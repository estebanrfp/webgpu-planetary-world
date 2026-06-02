/**
 * Rock Scatter Compute Shader — Clustered Altitude-aware Planetary Grid
 *
 * Places rocks in clusters of 3-4 on a global spherical grid.
 * 16×16 grid treated as 8×8 cluster groups (2×2 blocks).
 * Each sub-rock offsets from shared cluster center with mixed variants.
 *
 * Types: 0=stone_01, 1=stone_02, 2=stone_03, 3=stone_04, 4=stone_05
 *
 * @module shaders/rockScatter.compute.wgsl
 */

import { PLANET_RADIUS, TERRAIN_SCALES, TERRAIN_LIMITS, BIOME_LATITUDE } from '../config/index.js';
import { noiseWGSL } from './modules/noise.wgsl.js';

export const rockScatterComputeShader = /* wgsl */`

struct RockUniforms {
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

@group(0) @binding(0) var<uniform> rock      : RockUniforms;
@group(0) @binding(1) var<uniform> params    : TerrainParams;
@group(0) @binding(2) var<storage, read_write> instances : array<Instance>;

const EARTH_RADIUS: f32 = ${PLANET_RADIUS.toFixed(1)};
const HEIGHT_SCALE: f32 = ${TERRAIN_SCALES.HEIGHT_SCALE.toFixed(1)};
const NUM_VARIANTS: f32 = 8.0;
const DEAD = Instance(vec3f(0.0), 0.0, vec2f(0.0), NUM_VARIANTS, 0.0);
const LAT_TROPICAL_END: f32 = ${BIOME_LATITUDE.tropicalEnd.toFixed(2)};
const LAT_TEMPERATE_END: f32 = ${BIOME_LATITUDE.temperateEnd.toFixed(2)};
const LAT_POLAR_START: f32 = ${BIOME_LATITUDE.polarStart.toFixed(2)};
const LAT_NOISE_SCALE: f32 = ${BIOME_LATITUDE.noiseScale.toFixed(1)};
const LAT_NOISE_AMP: f32 = ${BIOME_LATITUDE.noiseAmplitude.toFixed(2)};

${noiseWGSL}

// Terrain height (same algorithm as vegetation/terrain)
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
  let N  = i32(rock.gridCount);
  let outIdx = gid.y * rock.gridCount + gid.x;

  if (ix >= N || iy >= N) { return; }

  // --- Cluster coordinates (2×2 blocks → 8×8 clusters) ---
  let clusterX = ix / 2;
  let clusterY = iy / 2;
  let subIdx   = (iy % 2) * 2 + (ix % 2); // 0..3 within cluster

  // Camera spherical coords
  let camNorm  = normalize(rock.cameraPos);
  let camTheta = atan2(camNorm.z, camNorm.x);
  let camPhi   = asin(clamp(camNorm.y, -1.0, 1.0));

  let cs = rock.cellSize;
  let clusterStride = cs * 2.0; // clusters are 2× cell spacing apart
  let snapTheta = floor(camTheta / clusterStride) * clusterStride;
  let snapPhi   = floor(camPhi   / clusterStride) * clusterStride;

  let halfClusters = f32(N / 2) * 0.5; // 8 * 0.5 = 4.0
  let baseClusterTheta = snapTheta + (f32(clusterX) - halfClusters + 0.5) * clusterStride;
  let baseClusterPhi   = snapPhi   + (f32(clusterY) - halfClusters + 0.5) * clusterStride;

  // Cluster-level jitter (shared by all 4 sub-rocks)
  let clusterSeed = vec3f(baseClusterTheta * 1000.0, baseClusterPhi * 1000.0, 271.0);
  let clusterJitter = hash33(clusterSeed) * 2.0 - 1.0;
  let clusterTheta = baseClusterTheta + clusterJitter.x * clusterStride * 0.35;
  let clusterPhi   = baseClusterPhi   + clusterJitter.y * clusterStride * 0.35;

  // Cluster center on sphere
  let clusterCosPhi = cos(clusterPhi);
  let clusterNormal = normalize(vec3f(
    cos(clusterTheta) * clusterCosPhi,
    sin(clusterPhi),
    sin(clusterTheta) * clusterCosPhi
  ));

  // Terrain height at cluster center (shared check)
  let heightRaw = getTerrainHeight(clusterNormal, params.octaves);
  let heightKm = clamp(heightRaw * HEIGHT_SCALE, ${TERRAIN_LIMITS.MIN_ALTITUDE_CLAMP.toFixed(1)}, ${TERRAIN_LIMITS.MAX_ALTITUDE_CLAMP.toFixed(1)});

  let roll = (clusterJitter.z + 1.0) * 0.5; // [0, 1]

  // --- Cluster mask: low-frequency noise carves clearings between rock
  // formations so the grid doesn't read as a uniform sprinkle. ~50 % of
  // clusters survive; the rest leave open ground between groups.
  let clusterMask = gradientNoise(clusterNormal * 100.0 + vec3f(73.0, 41.0, 19.0));
  if (clusterMask < 0.0) {
    instances[outIdx] = DEAD; return;
  }

  // --- Altitude biome check (cluster-level) ---
  var baseBiome: f32 = NUM_VARIANTS;

  if (heightKm < 0.001) {
    instances[outIdx] = DEAD; return;
  } else if (heightKm < 0.5) {
    if      (roll < 0.20) { baseBiome = 1.0; }
    else { instances[outIdx] = DEAD; return; }
  } else if (heightKm < 3.0) {
    if      (roll < 0.12) { baseBiome = 0.0; }
    else if (roll < 0.20) { baseBiome = 5.0; }
    else if (roll < 0.26) { baseBiome = 6.0; }
    else if (roll < 0.32) { baseBiome = 3.0; }
    else { instances[outIdx] = DEAD; return; }
  } else if (heightKm < 8.0) {
    if      (roll < 0.12) { baseBiome = 0.0; }
    else if (roll < 0.20) { baseBiome = 5.0; }
    else if (roll < 0.28) { baseBiome = 6.0; }
    else if (roll < 0.34) { baseBiome = 3.0; }
    else if (roll < 0.40) { baseBiome = 2.0; }
    else if (roll < 0.45) { baseBiome = 7.0; }
    else { instances[outIdx] = DEAD; return; }
  } else if (heightKm < 15.0) {
    if      (roll < 0.15) { baseBiome = 2.0; }
    else if (roll < 0.25) { baseBiome = 6.0; }
    else if (roll < 0.33) { baseBiome = 5.0; }
    else if (roll < 0.40) { baseBiome = 7.0; }
    else if (roll < 0.48) { baseBiome = 0.0; }
    else { instances[outIdx] = DEAD; return; }
  } else {
    if      (roll < 0.18) { baseBiome = 2.0; }
    else if (roll < 0.28) { baseBiome = 6.0; }
    else if (roll < 0.36) { baseBiome = 7.0; }
    else if (roll < 0.45) { baseBiome = 5.0; }
    else { instances[outIdx] = DEAD; return; }
  }

  // --- Sub-rock offset from cluster center ---
  let subSeed = vec3f(clusterSeed.x, clusterSeed.y, f32(subIdx) * 73.0 + 19.0);
  let subHash = hash33(subSeed);

  // ~25% random kill → some clusters have 3 rocks instead of 4
  if (subHash.z < 0.25) { instances[outIdx] = DEAD; return; }

  // Offset direction and distance on tangent plane — bumped from 8-20 m
  // to 60-180 m to match the new 4-20× rock sizes (~40-500 m wide). With
  // the old radii the four sub-rocks of a cluster collapsed into a
  // single overlapping pile once the size multiplier was applied.
  let offsetAngle = subHash.x * 6.2831853;
  let offsetDist  = (0.060 + subHash.y * 0.120) / EARTH_RADIUS;

  // Tangent vectors at cluster center
  let up = clusterNormal;
  let tangentU = normalize(cross(select(vec3f(0.0, 1.0, 0.0), vec3f(1.0, 0.0, 0.0), abs(up.y) > 0.99), up));
  let tangentV = cross(up, tangentU);

  let offset = tangentU * cos(offsetAngle) * offsetDist + tangentV * sin(offsetAngle) * offsetDist;
  let subNormal = normalize(clusterNormal + offset);

  // Sub-rock terrain height (for accurate surface placement)
  let subHeightRaw = getTerrainHeight(subNormal, params.octaves);
  let subHeightKm = clamp(subHeightRaw * HEIGHT_SCALE, ${TERRAIN_LIMITS.MIN_ALTITUDE_CLAMP.toFixed(1)}, ${TERRAIN_LIMITS.MAX_ALTITUDE_CLAMP.toFixed(1)});

  // Kill sub-rock if it ended up in water
  if (subHeightKm < 0.001) { instances[outIdx] = DEAD; return; }

  // --- Variant mixing: rotate baseBiome by subIdx, biased by latitude ---
  var biome = f32((i32(baseBiome) + subIdx) % 8);

  // Latitude-based variant preference
  let lat = abs(clusterNormal.y);
  let latNoise = (hash33(clusterNormal * LAT_NOISE_SCALE + vec3f(55.0, 0.0, 33.0)).x - 0.5) * LAT_NOISE_AMP * 2.0;
  let effLat = lat + latNoise;

  let polarWeight = smoothstep(LAT_TEMPERATE_END, LAT_POLAR_START, effLat);
  let tropicalWeight = 1.0 - smoothstep(LAT_TROPICAL_END, LAT_TEMPERATE_END, effLat);

  // Polar → favor bare/icy rocks (stone_04=3, stone_05=4)
  // Tropical → favor eroded/mossy rocks (stone_01=0, stone_02=1)
  let latBias = hash33(subSeed + vec3f(88.0, 44.0, 0.0)).x;
  if (polarWeight > 0.5 && latBias < polarWeight * 0.6) {
    biome = select(3.0, 4.0, latBias < polarWeight * 0.3);
  } else if (tropicalWeight > 0.5 && latBias < tropicalWeight * 0.5) {
    biome = select(0.0, 1.0, latBias < tropicalWeight * 0.25);
  }

  // Arid zone override — only in tropical/temperate (not polar)
  let moisture = gradientNoise(subNormal * 3.0 + vec3f(99.0, 0.0, 77.0));
  if (moisture < -0.25 && polarWeight < 0.3 && (biome == 0.0 || biome == 3.0)) {
    biome = 4.0;
  }

  // World-space size per variant (km) — vec2f(width/depth, height).
  // Heights raised so the rocks don't read as pancakes under the new
  // 4-20× sizeScale. Aim for height ≳ width × 0.8 except for the
  // explicitly low silhouettes (flat_stone, mound).
  var worldSize = vec2f(0.012, 0.011);                          // 0: boulder      12m × 11m
  if      (biome == 1.0) { worldSize = vec2f(0.010, 0.006); }  // 1: flat_stone   10m × 6m  (still flat)
  else if (biome == 2.0) { worldSize = vec2f(0.012, 0.014); }  // 2: tall_rock    12m × 14m (taller than wide)
  else if (biome == 3.0) { worldSize = vec2f(0.012, 0.010); }  // 3: wide_jagged  12m × 10m
  else if (biome == 4.0) { worldSize = vec2f(0.010, 0.009); }  // 4: round_stone  10m × 9m
  else if (biome == 5.0) { worldSize = vec2f(0.016, 0.014); }  // 5: formation    16m × 14m
  else if (biome == 6.0) { worldSize = vec2f(0.022, 0.014); }  // 6: mound        22m × 14m (still low and wide)
  else if (biome == 7.0) { worldSize = vec2f(0.020, 0.018); }  // 7: pergola      20m × 18m

  // Seed-based size variation [4.0 … 20.0] — the previous 4× minimum is
  // now the floor (so the smallest rock still reads as a boulder), with
  // the maximum lifted to 20× for occasional landmark-sized outcrops.
  let sizeHash = hash33(subSeed + vec3f(137.0, 311.0, 0.0));
  let sizeScale = 4.0 + sizeHash.x * 16.0;

  // Vertical offset: mesh Y ranges [-0.335, 0.335]. Lifting by exactly
  // 0.335 puts the base flush with the terrain → a hard horizontal cut
  // that reads as "floating". Lifting by 0.22 instead buries the rock
  // ~12 % of its height (≈ 0.115 of the mesh range), so it looks like
  // it's growing out of the ground.
  let heightOffset = worldSize.y * sizeScale * 0.22;
  let worldPos = subNormal * (EARTH_RADIUS + subHeightKm + heightOffset);
  let relPos = worldPos - rock.cameraPos;

  let dist = length(relPos);
  let maxRadius = f32(N) * 0.5 * cs * EARTH_RADIUS;
  let alpha = 1.0 - smoothstep(maxRadius * 0.85, maxRadius, dist);

  instances[outIdx] = Instance(relPos, alpha, worldSize * sizeScale * rock.ndcSize, biome, 0.0);
}
`;
