/**
 * Tree Scatter Compute Shader — Temperate & Polar Tree Placement
 *
 * Places low-poly trees in temperate and polar zones (suppressed in tropical).
 * 16×16 grid, 18 variants (color-only PBR GLBs), random assignment.
 * Moisture filter suppresses trees in arid zones.
 *
 * @module shaders/treeScatter.compute.wgsl
 */

import { PLANET_RADIUS, TERRAIN_SCALES, TERRAIN_LIMITS, TREE_CONFIG, BIOME_LATITUDE } from '../config/index.js';
import { noiseWGSL } from './modules/noise.wgsl.js';

// Build weighted CDF for variant selection
const _freqs = TREE_CONFIG.variants.map(v => v.freq ?? 1);
const _total = _freqs.reduce((a, b) => a + b, 0);
const _cdf = _freqs.reduce((acc, f) => { acc.push((acc.at(-1) ?? 0) + f / _total); return acc; }, []);

export const treeScatterComputeShader = /* wgsl */`

struct TreeUniforms {
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

@group(0) @binding(0) var<uniform> tree      : TreeUniforms;
@group(0) @binding(1) var<uniform> params    : TerrainParams;
@group(0) @binding(2) var<storage, read_write> instances : array<Instance>;

const EARTH_RADIUS: f32 = ${PLANET_RADIUS.toFixed(1)};
const HEIGHT_SCALE: f32 = ${TERRAIN_SCALES.HEIGHT_SCALE.toFixed(1)};
const NUM_VARIANTS: f32 = ${TREE_CONFIG.variants.length}.0;
const DEAD = Instance(vec3f(0.0), 0.0, vec2f(0.0), NUM_VARIANTS, 0.0);
const LAT_TROPICAL_END: f32 = ${BIOME_LATITUDE.tropicalEnd.toFixed(2)};
const LAT_TEMPERATE_START: f32 = ${BIOME_LATITUDE.temperateStart.toFixed(2)};
const LAT_TEMPERATE_END: f32 = ${BIOME_LATITUDE.temperateEnd.toFixed(2)};
const LAT_POLAR_START: f32 = ${BIOME_LATITUDE.polarStart.toFixed(2)};
const LAT_NOISE_SCALE: f32 = ${BIOME_LATITUDE.noiseScale.toFixed(1)};
const LAT_NOISE_AMP: f32 = ${BIOME_LATITUDE.noiseAmplitude.toFixed(2)};

${noiseWGSL}

// Terrain height (same algorithm as terrain/rocks/palms)
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
  let N  = i32(tree.gridCount);
  let outIdx = gid.y * tree.gridCount + gid.x;

  if (ix >= N || iy >= N) { return; }

  // Camera spherical coords
  let camNorm  = normalize(tree.cameraPos);
  let camTheta = atan2(camNorm.z, camNorm.x);
  let camPhi   = asin(clamp(camNorm.y, -1.0, 1.0));

  let cs = tree.cellSize;
  let snapTheta = floor(camTheta / cs) * cs;
  let snapPhi   = floor(camPhi   / cs) * cs;

  let halfGrid = f32(N) * 0.5;
  let cellTheta = snapTheta + (f32(ix) - halfGrid + 0.5) * cs;
  let cellPhi   = snapPhi   + (f32(iy) - halfGrid + 0.5) * cs;

  // Per-cell jitter (unique seed offset 893.0 to avoid overlap with palms/rocks)
  let cellSeed = vec3f(cellTheta * 1000.0, cellPhi * 1000.0, 893.0);
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

  // --- Latitude & altitude zones ------------------------------------------
  //   tropical interior:  abs(lat) < tropicalEnd, altitude 0.025–0.200 km
  //                       → jungle (variant 8). Palms still own the 0–10 m
  //                       beach band via PalmSystem.
  //   temperate broadleaf: temperate+polar lat, altitude 0.050–0.130 km
  //                       → variants 4–7 (oak/maple/cherry/birch).
  //   mountain conifers:  temperate+polar lat, altitude 0.250–0.700 km
  //                       → variants 0–3 (pine_tall/medium/fir/cypress).
  let lat = abs(normal.y);
  let latNoise = (hash33(normal * LAT_NOISE_SCALE + vec3f(55.0, 0.0, 33.0)).x - 0.5) * LAT_NOISE_AMP * 2.0;
  let effLat = lat + latNoise;
  let isTropical = effLat < LAT_TROPICAL_END;
  let isTempPolar = effLat >= LAT_TEMPERATE_START - 0.05;

  let isJungleZone    = isTropical  && heightKm >= 0.025 && heightKm < 0.200;
  let isBroadleafZone = isTempPolar && heightKm >= 0.050 && heightKm < 0.130;
  let isPineZone      = isTempPolar && heightKm >= 0.250 && heightKm <= 0.700;
  if (!isJungleZone && !isBroadleafZone && !isPineZone) {
    instances[outIdx] = DEAD; return;
  }

  // Polar fade — only applies to the temperate-zone families (jungle is
  // tropical-only, so it doesn't get the polar fade).
  let polarFade = 1.0 - 0.6 * smoothstep(LAT_TEMPERATE_END, LAT_POLAR_START, effLat);
  let finalProb = select(polarFade, 1.0, isJungleZone);

  // Per-family density:
  //   broadleaf 0.95 — leafy closed canopy
  //   pines     0.75 — open mountain stands
  //   jungle    0.85 — dense rainforest but with breathing space
  var densityMult: f32 = 0.95;
  if (isPineZone)   { densityMult = 0.75; }
  if (isJungleZone) { densityMult = 0.85; }
  if (roll > 0.225 * finalProb * densityMult) {
    instances[outIdx] = DEAD; return;
  }

  // Moisture filter: suppress in very arid zones (no desert trees)
  let moisture = gradientNoise(normal * 3.0 + vec3f(99.0, 0.0, 77.0));
  if (moisture < -0.25) {
    instances[outIdx] = DEAD; return;
  }

  // Steep slope filter: no trees on cliffs
  let slopeNoise = gradientNoise(normal * 15.0 + vec3f(3.3, 7.7, 1.1));
  if (abs(slopeNoise) > 0.7) {
    instances[outIdx] = DEAD; return;
  }

  // --- Clustering mask (after all kills so we don't waste compute on it
  // for cells we'd skip anyway). Each family uses its own domain offset
  // and tuning so their stands don't visually align.
  var clusterDomain = vec3f(57.0, 91.0, 13.0);  // pine domain
  if (isBroadleafZone) { clusterDomain = vec3f(11.0, 33.0, 77.0); }
  if (isJungleZone)    { clusterDomain = vec3f(141.0, 7.0, 211.0); }
  var clusterFreq: f32 = 240.0;
  if (isBroadleafZone) { clusterFreq = 320.0; }
  if (isJungleZone)    { clusterFreq = 200.0; }   // bigger stands for rainforest
  var clusterCut: f32 = 0.05;
  if (isBroadleafZone) { clusterCut = 0.00; }
  if (isJungleZone)    { clusterCut = -0.05; }    // denser coverage in jungle
  let clusterNoise = gradientNoise(normal * clusterFreq + clusterDomain);
  if (clusterNoise < clusterCut) {
    instances[outIdx] = DEAD; return;
  }

  // Variant selection — TREE_CONFIG order: 0–3 conifers, 4–7 broadleaf, 8 jungle.
  let variantHash = hash33(cellSeed + vec3f(333.0, 666.0, 0.0));
  let vRoll = variantHash.x;
  var biome: f32 = 0.0;
  if (isJungleZone) {
    biome = 8.0;                                 // single jungle variant
  } else if (isPineZone) {
    biome = f32(u32(vRoll * 4.0));               // 0..3 conifers
  } else {
    biome = f32(4u + u32(vRoll * 4.0));          // 4..7 broadleaf
  }

  // Per-family base size + per-instance variation. Pines keep their
  // original mountain stature (173–260 m); broadleaf/jungle stay in
  // the tighter low-canopy range the user dialed in for the valley.
  //   pines     [0.8, 1.2]  → 173–260 m  (mountain silhouette, untouched)
  //   broadleaf [0.85, 1.0] → 108–128 m
  //   jungle    [0.9, 1.05] → 119–139 m
  let baseSize = vec2f(0.180, 0.255);
  var sizeFamily: f32 = 0.85;                    // pines — restored
  if (isBroadleafZone) { sizeFamily = 0.50; }    // broadleaf
  if (isJungleZone)    { sizeFamily = 0.52; }    // jungle
  let worldSize = baseSize * sizeFamily;

  let sizeHash = hash33(cellSeed + vec3f(137.0, 311.0, 0.0));
  var sizeMin: f32 = 0.8;
  var sizeMax: f32 = 1.2;
  if (isBroadleafZone) { sizeMin = 0.85; sizeMax = 1.0; }
  if (isJungleZone)    { sizeMin = 0.9;  sizeMax = 1.05; }
  let sizeScale = sizeMin + sizeHash.x * (sizeMax - sizeMin);

  // Slight sink so the trunk base touches the terrain — model space has
  // base at Y=0 (same convention as crystals), so no half-height lift.
  let heightOffset = worldSize.y * sizeScale * -0.02;
  let worldPos = normal * (EARTH_RADIUS + heightKm + heightOffset);
  let relPos = worldPos - tree.cameraPos;

  let dist = length(relPos);
  let maxRadius = f32(N) * 0.5 * cs * EARTH_RADIUS;
  let alpha = 1.0 - smoothstep(maxRadius * 0.85, maxRadius, dist);

  instances[outIdx] = Instance(relPos, alpha, worldSize * sizeScale * tree.ndcSize, biome, 0.0);
}
`;
