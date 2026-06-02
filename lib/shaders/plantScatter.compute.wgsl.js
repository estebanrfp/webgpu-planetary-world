/**
 * Plant Scatter Compute Shader — Low plants / shrubs / flowers placement.
 *
 * Places small procedural plants across the planet surface. Unlike trees,
 * plants spawn in *all* biomes (tropical / temperate / polar) with only a
 * gentle polar fade, and on a wider altitude band. Cliffs and very arid
 * patches still suppress them so they hug the playable surface.
 *
 * @module shaders/plantScatter.compute.wgsl
 */

import { PLANET_RADIUS, TERRAIN_SCALES, TERRAIN_LIMITS, PLANT_CONFIG, BIOME_LATITUDE } from '../config/index.js';
import { noiseWGSL } from './modules/noise.wgsl.js';

// Weighted CDF for variant selection (matches the JS-side CDF in PlantSystem)
const _freqs = PLANT_CONFIG.variants.map(v => v.freq ?? 1);
const _total = _freqs.reduce((a, b) => a + b, 0);
const _cdf = _freqs.reduce((acc, f) => { acc.push((acc.at(-1) ?? 0) + f / _total); return acc; }, []);

export const plantScatterComputeShader = /* wgsl */`

struct PlantUniforms {
  cameraPos : vec3f,
  gridCount : u32,
  ndcSize   : vec2f,
  cellSize  : f32,
  _pad      : f32,
}

struct Instance {
  worldPos : vec3f,
  alpha    : f32,
  ndcSize  : vec2f,
  biome    : f32,
  _pad     : f32,
}

struct TerrainParams {
  warpFactor : f32,
  mountMaskFreq : f32,
  baseAmplitude : f32,
  baseFrequency : f32,
  persistence : f32,
  lacunarity : f32,
  contrastExp : f32,
  contrastScale : f32,
  seaLevelOffset : f32,
  ridgeDetail : f32,
  abyssDetail : f32,
  detailScale : f32,
  grassCoverage : f32,
  sandCoverage : f32,
  snowCoverage : f32,
  rockCoverage : f32,
  octaves : f32,
  warpScale : f32,
  warpStrength2 : f32,
  peakSoftness : f32,
  terraceAmount : f32,
  terraceSmooth : f32,
  mountainSharpness : f32,
  shelfWidth : f32,
  beachWidth : f32,
  snowLine : f32,
  sandSharpness : f32,
  rockThreshold : f32,
  grassThreshold : f32,
  globalMoisture : f32,
  debugFlags : f32,
  lakeDetail : f32,
}

@group(0) @binding(0) var<uniform> plant     : PlantUniforms;
@group(0) @binding(1) var<uniform> params    : TerrainParams;
@group(0) @binding(2) var<storage, read_write> instances : array<Instance>;

const EARTH_RADIUS: f32 = ${PLANET_RADIUS.toFixed(1)};
const HEIGHT_SCALE: f32 = ${TERRAIN_SCALES.HEIGHT_SCALE.toFixed(1)};
const NUM_VARIANTS: f32 = ${PLANT_CONFIG.variants.length}.0;
const DEAD = Instance(vec3f(0.0), 0.0, vec2f(0.0), NUM_VARIANTS, 0.0);
const LAT_TEMPERATE_END: f32 = ${BIOME_LATITUDE.temperateEnd.toFixed(2)};
const LAT_POLAR_START: f32 = ${BIOME_LATITUDE.polarStart.toFixed(2)};

${noiseWGSL}

// Terrain height — same algorithm as terrain / trees / rocks.
fn getTerrainHeight(p_in: vec3f, octaves_in: f32) -> f32 {
  let showNoise = true;
  let warpFactor = params.warpFactor;
  let warpScale = params.warpScale;
  let q = vec3f(
    gradientNoise(p_in * warpScale + vec3f(0.0, 0.0, 0.0)),
    gradientNoise(p_in * warpScale + vec3f(5.2, 1.3, 0.0)),
    gradientNoise(p_in * warpScale + vec3f(1.1, 0.0, 2.4))
  ) * warpFactor;
  let p1 = p_in + q;
  let r = vec3f(
    gradientNoise(p1 * warpScale * 2.0 + vec3f(3.3, 0.0, 0.0)),
    gradientNoise(p1 * warpScale * 2.0 + vec3f(0.0, 4.4, 0.0)),
    gradientNoise(p1 * warpScale * 2.0 + vec3f(0.0, 0.0, 5.5))
  ) * params.warpStrength2;
  let p = p1 + r;
  let mount_mask = smoothstep(-0.1, 0.35, gradientNoise(p * params.mountMaskFreq + vec3f(12.3)));
  var h: f32 = 0.0;
  var a: f32 = params.baseAmplitude;
  var f: f32 = params.baseFrequency;
  let totalOctaves = i32(params.octaves + 0.5);
  for (var i = 0; i < 24; i = i + 1) {
    if (i >= totalOctaves) { break; }
    h += a * gradientNoise(p * f);
    a *= params.persistence;
    f *= params.lacunarity;
  }
  let hSign = sign(h);
  var exp = params.contrastExp;
  exp = mix(exp, exp * 0.5, smoothstep(0.1, 0.5, abs(h)) * params.peakSoftness);
  h = (hSign * pow(abs(h), exp) * params.contrastScale) + params.seaLevelOffset;
  if (h > 0.0) {
    h = mix(h * 0.1, h, smoothstep(0.0, 0.1, h));
    if (showNoise) {
      let ridgeFreq = params.baseFrequency * 1.6;
      let r1 = ridgeNoise(p * ridgeFreq);
      let r2 = ridgeNoise(p * ridgeFreq * 2.7);
      let sharp_r1 = pow(r1, params.mountainSharpness);
      let ridge_detail = (0.4 * sharp_r1 * sharp_r1 + 0.15 * r2) * params.ridgeDetail;
      h = h + ridge_detail * mount_mask * h * 1.4;
    }
    let tAmt = params.terraceAmount;
    if (tAmt > 0.0) {
      let tSmooth = params.terraceSmooth;
      let cell = floor(h * tAmt);
      let frac_h = fract(h * tAmt);
      let smooth_frac = smoothstep(0.0, tSmooth, frac_h);
      h = (cell + smooth_frac) / tAmt;
    }
    let lakeD = params.lakeDetail;
    if (lakeD > 0.0) {
      let lakeFreq = params.baseFrequency * 2.5;
      let lakeNoise = gradientNoise(p * lakeFreq + vec3f(7.7, 3.3, 9.9));
      let inlandMask = smoothstep(0.0, 0.01, h);
      h -= max(0.0, lakeNoise) * lakeD * inlandMask * 0.15;
    }
  } else {
    let shelfWidth = params.shelfWidth;
    h = mix(h * 0.1, h, smoothstep(0.0, -0.2 * shelfWidth, h));
    let tr1 = ridgeNoise(p * 5.0 + vec3f(12.3));
    let tr2 = ridgeNoise(p * 15.0);
    let abyss_detail = (tr1 * tr1 * 1.5 + tr2 * 0.4) * params.abyssDetail;
    h -= abyss_detail * abs(h) * 1.8 * smoothstep(0.0, -0.15, h);
  }
  return h * params.detailScale;
}

@compute @workgroup_size(16, 16, 1)
fn main(@builtin(global_invocation_id) gid : vec3u) {
  let ix = i32(gid.x);
  let iy = i32(gid.y);
  let N  = i32(plant.gridCount);
  let outIdx = gid.y * plant.gridCount + gid.x;

  if (ix >= N || iy >= N) { return; }

  // Camera spherical coords
  let camNorm  = normalize(plant.cameraPos);
  let camTheta = atan2(camNorm.z, camNorm.x);
  let camPhi   = asin(clamp(camNorm.y, -1.0, 1.0));

  let cs = plant.cellSize;
  let snapTheta = floor(camTheta / cs) * cs;
  let snapPhi   = floor(camPhi   / cs) * cs;

  let halfGrid = f32(N) * 0.5;
  let cellTheta = snapTheta + (f32(ix) - halfGrid + 0.5) * cs;
  let cellPhi   = snapPhi   + (f32(iy) - halfGrid + 0.5) * cs;

  // Per-cell jitter — unique seed offset 1471.0 so plants don't share
  // randomness with trees (893), palms or rocks.
  let cellSeed = vec3f(cellTheta * 1000.0, cellPhi * 1000.0, 1471.0);
  let cellJitter = hash33(cellSeed) * 2.0 - 1.0;
  let jTheta = cellTheta + cellJitter.x * cs * 0.4;
  let jPhi   = cellPhi   + cellJitter.y * cs * 0.4;

  // Position on sphere
  let cosPhi = cos(jPhi);
  let normal = normalize(vec3f(
    cos(jTheta) * cosPhi,
    sin(jPhi),
    sin(jTheta) * cosPhi
  ));

  // Terrain height
  let heightRaw = getTerrainHeight(normal, params.octaves);
  let heightKm = clamp(heightRaw * HEIGHT_SCALE, ${TERRAIN_LIMITS.MIN_ALTITUDE_CLAMP.toFixed(1)}, ${TERRAIN_LIMITS.MAX_ALTITUDE_CLAMP.toFixed(1)});

  let roll = (cellJitter.z + 1.0) * 0.5; // [0, 1]

  // --- Altitude gate: same band as the broadleaf trees (50–130 m).
  // No flowers on the beach (palms only there) and none on the mountain
  // slopes (where pines live) — flowers are a valley-floor accent.
  if (heightKm < 0.050 || heightKm > 0.130) {
    instances[outIdx] = DEAD; return;
  }

  // Latitude filter + density. Mild polar fade, and the density floor
  // (0.25) targets ~25 % cell survival so the visible zone holds ~20
  // active flowers (256 cells × 0.5 alt × 0.25 dens × 0.9 moist × 0.75
  // slope ≈ 21).
  let lat = abs(normal.y);
  let polarFade = 1.0 - 0.65 * smoothstep(LAT_TEMPERATE_END, LAT_POLAR_START, lat);
  if (roll > 0.25 * polarFade) {
    instances[outIdx] = DEAD; return;
  }

  // Moisture filter: suppress in *very* arid zones (deserts).
  let moisture = gradientNoise(normal * 3.0 + vec3f(99.0, 0.0, 77.0));
  if (moisture < -0.45) {
    instances[outIdx] = DEAD; return;
  }

  // Steep slope filter: no plants on cliffs.
  let slopeNoise = gradientNoise(normal * 15.0 + vec3f(3.3, 7.7, 1.1));
  if (abs(slopeNoise) > 0.75) {
    instances[outIdx] = DEAD; return;
  }

  // Weighted variant assignment (freq-based CDF)
  let variantHash = hash33(cellSeed + vec3f(333.0, 666.0, 0.0));
  let vRoll = variantHash.x;
  var biome: f32 = 0.0;
${_cdf.slice(0, -1).map((threshold, i) => `  if (vRoll >= ${threshold.toFixed(6)}) { biome = ${i + 1}.0; }`).join('\n')}

  // Plant world scale — doubled from 10×12 m to 20×25 m per model unit
  // so the flowers read clearly at gameplay distance (a real-size flower
  // would be a sub-pixel speck from 50 m away).
  let worldSize = vec2f(0.020, 0.025);

  // Size variation [1.0, 1.5] — minimum is the model's natural size so
  // even the smallest random pick remains clearly visible.
  let sizeHash = hash33(cellSeed + vec3f(137.0, 311.0, 0.0));
  let sizeScale = 1.0 + sizeHash.x * 0.5;

  // Slight sink so the base touches the terrain (model base at Y=0).
  let heightOffset = worldSize.y * sizeScale * -0.02;
  let worldPos = normal * (EARTH_RADIUS + heightKm + heightOffset);
  let relPos = worldPos - plant.cameraPos;

  let dist = length(relPos);
  let maxRadius = f32(N) * 0.5 * cs * EARTH_RADIUS;
  let alpha = 1.0 - smoothstep(maxRadius * 0.85, maxRadius, dist);

  instances[outIdx] = Instance(relPos, alpha, worldSize * sizeScale * plant.ndcSize, biome, 0.0);
}
`;
