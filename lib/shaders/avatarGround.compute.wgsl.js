/**
 * Avatar Ground Compute Shader
 *
 * Snaps wandering NPC avatar instances onto the terrain surface. Runs the same
 * GPU `getTerrainHeight` as the visible terrain (and the physics grid), so NPCs
 * sit exactly on the rendered ground — the CPU noise port is not accurate
 * enough for this (see GPU_PHYSICS_GRID.md).
 *
 * The CPU writes each NPC's centre at an arbitrary radius (the wander runs in
 * the tangent plane); this pass re-projects the centre onto the real surface.
 * Instance 0 (the local player, grounded by physics) is left untouched and is
 * used only to derive the avatar's origin-to-terrain offset.
 *
 * @module shaders/avatarGround.compute.wgsl
 */

import { TERRAIN_SCALES, TERRAIN_LIMITS, AVATAR_CONFIG } from '../config/index.js';
import { noiseWGSL } from './modules/noise.wgsl.js';

export const avatarGroundComputeShader = /* wgsl */`

// Terrain parameters — layout matches renderer.js terrainParamsBuffer.
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

// Per-avatar instance — must match avatar.wgsl.js AvatarInstance (112 bytes).
struct AvatarInstance {
  center : vec3f,
  scale : f32,
  forward : vec3f,
  visibility : f32,
  baseColor : vec3f,
  patternType : f32,
  lineColor : vec3f,
  lineScale : f32,
  lineColor2 : vec3f,
  lineWidth : f32,
  lineGlow : f32,
  glowMul : f32,
  multiColor : f32,
  animTime : f32,
  vertexPaint : f32,
  _pad0 : f32,
  _pad1 : f32,
  _pad2 : f32,
}

struct GroundParams {
  earthCenter : vec3f,   // camera-relative earth centre
  count : f32,           // avatar instance count
}

// Persists the captured avatar foot offset across frames.
struct FootStore {
  value : f32,
  captured : f32,
  _pad0 : f32,
  _pad1 : f32,
}

@group(0) @binding(0) var<storage, read_write> instances : array<AvatarInstance>;
@group(0) @binding(1) var<uniform> params : TerrainParams;
@group(0) @binding(2) var<uniform> ground : GroundParams;
@group(0) @binding(3) var<storage, read_write> footStore : FootStore;

const HEIGHT_SCALE : f32 = ${TERRAIN_SCALES.HEIGHT_SCALE.toFixed(1)};
const MIN_ALT : f32 = ${TERRAIN_LIMITS.MIN_ALTITUDE_CLAMP.toFixed(1)};
const MAX_ALT : f32 = ${TERRAIN_LIMITS.MAX_ALTITUDE_CLAMP.toFixed(1)};
const SWIM_SUBMERGE : f32 = ${(AVATAR_CONFIG.swimSubmerge ?? 0.06).toFixed(4)};   // km a swimmer sinks below sea level

${noiseWGSL}

// getTerrainHeight — verbatim copy of terrainHeightGrid.compute.wgsl.js, the
// physics-grade port kept in sync with terrain.wgsl.js.
fn getTerrainHeight(p_in: vec3f, octaves_in: f32) -> f32 {
  let showNoise = true;

  // 1. DOMAIN WARPING
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

  // 2. MOUNTAIN/PLAINS MASK
  let mount_mask = smoothstep(-0.1, 0.35, gradientNoise(p * params.mountMaskFreq + vec3f(12.3)));

  // 3. BASE fBM
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

  // 4. VERTICAL CONTRAST BOOST & PEAK SOFTNESS
  let hSign = sign(h);
  var exp = params.contrastExp;
  exp = mix(exp, exp * 0.5, smoothstep(0.1, 0.5, abs(h)) * params.peakSoftness);

  h = (hSign * pow(abs(h), exp) * params.contrastScale) + params.seaLevelOffset;

  // 5. BIOME-SPECIFIC TOPOGRAPHY
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
        let frac = fract(h * tAmt);
        let smooth_frac = smoothstep(0.0, tSmooth, frac);
        h = (cell + smooth_frac) / tAmt;
    }

    // 5c. INLAND LAKES
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

// Terrain surface altitude (km) for a unit direction from the earth centre.
fn surfaceHeight(dir : vec3f) -> f32 {
  return clamp(getTerrainHeight(dir, params.octaves) * HEIGHT_SCALE, MIN_ALT, MAX_ALT);
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid : vec3u) {
  let i = gid.x;
  // Instance 0 is the local player (grounded by physics) — leave it untouched.
  if (i == 0u || i >= u32(ground.count)) { return; }

  let ec = ground.earthCenter;

  // The player (instance 0) is grounded by physics. Anchor the NPCs to its
  // ground radius minus the terrain height beneath it — this needs no planet
  // radius constant and cancels any height-scale offset. The running minimum
  // keeps the anchor at the *grounded* value even when the player later
  // climbs or flies (that only raises playerR, never lowers the anchor).
  let playerDir = normalize(instances[0].center - ec);
  let playerR = length(instances[0].center - ec);
  let candidate = playerR - surfaceHeight(playerDir);
  var anchorR = candidate;
  if (footStore.captured > 0.5) {
    anchorR = min(footStore.value, candidate);
  }
  footStore.value = anchorR;
  footStore.captured = 1.0;

  // Snap this NPC's centre onto the terrain along its own direction. On land it
  // sits on the surface; over water it sinks below sea level so the body (the
  // model origin is at the feet, the body ~hip height up) is IN the water and
  // reads as swimming, not floating on top. The sink ramps in with depth from
  // the shoreline (no step at the water's edge) and never goes below the seabed.
  let dir = normalize(instances[i].center - ec);
  let h = surfaceHeight(dir);
  var snapped = h;
  if (h < 0.0) {
    let depth = -h;                                          // depth below sea level (km)
    let sink = SWIM_SUBMERGE * smoothstep(0.0, SWIM_SUBMERGE, depth);
    snapped = max(h, -sink);                                 // never below the seabed
  }
  let r = anchorR + snapped;
  instances[i].center = ec + dir * r;
}
`;
