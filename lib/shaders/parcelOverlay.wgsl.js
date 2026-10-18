/**
 * Parcel Overlay WGSL Shader — Terrain-based approach
 *
 * Reuses the terrain mesh via vertex pulling (same megaVertexBuffer,
 * visibleIndices, instances, terrainParams). Every vertex follows the
 * terrain surface exactly. The fragment shader maps sphere normals
 * back to parcel coordinates for coloring.
 *
 * Bind group 0: Full terrain bind group (shared)
 * Bind group 1: ParcelUniforms + Parcel storage
 */

import { PLANET_RADIUS } from '../config/planetConfig.js'
import { TERRAIN_SCALES, TERRAIN_LIMITS } from '../config/terrainConfig.js'
import { noiseWGSL } from './modules/noise.wgsl.js'

const R = PLANET_RADIUS.toFixed(1)
const HS = TERRAIN_SCALES.HEIGHT_SCALE.toFixed(1)
const MIN_ALT = TERRAIN_LIMITS.MIN_ALTITUDE_CLAMP.toFixed(1)
const MAX_ALT = TERRAIN_LIMITS.MAX_ALTITUDE_CLAMP.toFixed(1)

export const parcelOverlayWGSL = /* wgsl */`

// ============================================================================
// BIND GROUP 0 — Terrain resources (shared with terrain pipeline)
// Only the bindings actually used are declared; the explicit pipeline layout
// allows extra entries in the bind group that the shader does not reference.
// ============================================================================

struct GlobalUniforms {
  viewProjection : mat4x4f,
  cameraPos : vec4f,
  sunDirection : vec4f,
  earthCenter : vec4f,
  whitePoint : vec4f,
  cloudOpacities : vec4f,
  avatarSphere : vec4f,
  moonDir : vec4f,
  miscParams : vec4f,
  skyStylization : vec4f,
  skyTint : vec4f,
  rainParams : vec4f,
  lightning_params : vec4f,
}

struct ChunkData {
  morphParams : vec4f,
  chunkCenter : vec4f,
  quadParams  : vec4f,
  chunkNormal : vec4f,
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
  colGrass : vec4f,
  colForest : vec4f,
  colRock : vec4f,
  colSnow : vec4f,
  colSand : vec4f,
  colGround : vec4f,
  colShallowSea : vec4f,
  colDeepSea : vec4f,
}

@group(0) @binding(0)  var<uniform> globals : GlobalUniforms;
@group(0) @binding(12) var<storage, read> allVertices : array<f32>;
@group(0) @binding(13) var<storage, read> visibleIndices : array<u32>;
@group(0) @binding(14) var<storage, read> instances : array<ChunkData>;
@group(0) @binding(15) var<uniform> terrainParams : TerrainParams;

// ============================================================================
// BIND GROUP 1 — Parcel data
// ============================================================================

struct ParcelUniforms {
  hoveredIdx : f32,
  selectedIdx : f32,
  parcelCount : f32,
  cameraAltitude : f32,
}

struct Parcel {
  faceLocalX : f32,
  localY : f32,
  parcelType : f32,
  estateId : f32,
}

@group(1) @binding(0) var<uniform> parcelParams : ParcelUniforms;
@group(1) @binding(1) var<storage, read> parcels : array<Parcel>;

// ============================================================================
// CONSTANTS
// ============================================================================

const FACE_SIZE : f32 = 123.0;
const FACE_SIZE_I : i32 = 123;
const PLANET_R : f32 = ${R};
const HEIGHT_SCALE : f32 = ${HS};
const MIN_ALTITUDE : f32 = ${MIN_ALT};
const MAX_ALTITUDE : f32 = ${MAX_ALT};
const HEIGHT_EPSILON : f32 = 0.08;

const FaceNormals = array<vec3f, 6>(
  vec3f(0.0, 0.0, 1.0),
  vec3f(0.0, 0.0, -1.0),
  vec3f(1.0, 0.0, 0.0),
  vec3f(-1.0, 0.0, 0.0),
  vec3f(0.0, 1.0, 0.0),
  vec3f(0.0, -1.0, 0.0)
);

const FaceRights = array<vec3f, 6>(
  vec3f(1.0, 0.0, 0.0),
  vec3f(-1.0, 0.0, 0.0),
  vec3f(0.0, 0.0, -1.0),
  vec3f(0.0, 0.0, 1.0),
  vec3f(1.0, 0.0, 0.0),
  vec3f(1.0, 0.0, 0.0)
);

const FaceUps = array<vec3f, 6>(
  vec3f(0.0, 1.0, 0.0),
  vec3f(0.0, 1.0, 0.0),
  vec3f(0.0, 1.0, 0.0),
  vec3f(0.0, 1.0, 0.0),
  vec3f(0.0, 0.0, -1.0),
  vec3f(0.0, 0.0, 1.0)
);

// ============================================================================
// NOISE (shared with terrain shader)
// ============================================================================

${noiseWGSL}

// ============================================================================
// TERRAIN HEIGHT — identical to terrain.wgsl.js getTerrainHeight
// ============================================================================

fn getTerrainHeight(p_in: vec3f, octaves_f: f32, showNoise: bool, dist: f32) -> f32 {
  let warpScale = terrainParams.warpScale;
  let q = vec3f(
    gradientNoise(p_in * warpScale),
    gradientNoise(p_in * warpScale + vec3f(5.2, 1.3, 0.0)),
    gradientNoise(p_in * warpScale + vec3f(1.1, 0.0, 2.4))
  ) * terrainParams.warpFactor;

  let p1 = p_in + q;
  let r = vec3f(
    gradientNoise(p1 * warpScale * 2.0 + vec3f(3.3, 0.0, 0.0)),
    gradientNoise(p1 * warpScale * 2.0 + vec3f(0.0, 4.4, 0.0)),
    gradientNoise(p1 * warpScale * 2.0 + vec3f(0.0, 0.0, 5.5))
  ) * terrainParams.warpStrength2;

  let p = p1 + r;
  let mount_mask = smoothstep(-0.1, 0.35, gradientNoise(p * terrainParams.mountMaskFreq + vec3f(12.3)));

  var h: f32 = 0.0;
  var a: f32 = terrainParams.baseAmplitude;
  var f: f32 = terrainParams.baseFrequency;
  let totalOctaves = i32(octaves_f + 0.5);

  for (var i = 0; i < 24; i = i + 1) {
    if (i >= totalOctaves) { break; }
    h += a * gradientNoise(p * f);
    a *= terrainParams.persistence;
    f *= terrainParams.lacunarity;
  }

  let hSign = sign(h);
  var cExp = terrainParams.contrastExp;
  let softness = terrainParams.peakSoftness;
  cExp = mix(cExp, cExp * 0.5, smoothstep(0.1, 0.5, abs(h)) * softness);
  h = (hSign * pow(abs(h), cExp) * terrainParams.contrastScale) + terrainParams.seaLevelOffset;

  if (h > 0.0) {
    h = mix(h * 0.1, h, smoothstep(0.0, 0.1, h));
    if (showNoise) {
      let ridgeFreq = terrainParams.baseFrequency * 1.6;
      let r1 = ridgeNoise(p * ridgeFreq);
      let r2 = ridgeNoise(p * ridgeFreq * 2.7);
      let sharp_r1 = pow(r1, terrainParams.mountainSharpness);
      let ridge_detail = (0.4 * sharp_r1 * sharp_r1 + 0.15 * r2) * terrainParams.ridgeDetail;
      h = h + ridge_detail * mount_mask * h * 1.4;
      let tAmt = terrainParams.terraceAmount;
      if (tAmt > 0.0) {
        let cell = floor(h * tAmt);
        let fr = fract(h * tAmt);
        h = (cell + smoothstep(0.0, terrainParams.terraceSmooth, fr)) / tAmt;
      }
    } else {
      h = h + gradientNoise(p * 2.5) * mount_mask * h * 0.3;
    }

    // 5c. INLAND LAKES
    let lakeD = terrainParams.lakeDetail;
    if (lakeD > 0.0) {
      let lakeFreq = terrainParams.baseFrequency * 2.5;
      let lakeNoise = gradientNoise(p * lakeFreq + vec3f(7.7, 3.3, 9.9));
      let inlandMask = smoothstep(0.0, 0.01, h);
      h -= max(0.0, lakeNoise) * lakeD * inlandMask * 0.15;
    }

  } else {
    let shelfW = terrainParams.shelfWidth;
    h = mix(h * 0.1, h, smoothstep(0.0, -0.2 * shelfW, h));
    let tr1 = ridgeNoise(p * 5.0 + vec3f(12.3));
    let tr2 = ridgeNoise(p * 15.0);
    let abyss_detail = (tr1 * tr1 * 1.5 + tr2 * 0.4) * terrainParams.abyssDetail;
    h -= abyss_detail * abs(h) * 1.8 * smoothstep(0.0, -0.15, h);
  }

  return h * terrainParams.detailScale;
}

// ============================================================================
// INVERSE SPHERE → FACE + PARCEL COORDS
// ============================================================================

// Returns vec3f(face, u, v) where u,v ∈ [0, 1]
fn sphereToFaceUV(s: vec3f) -> vec3f {
  let ax = abs(s.x); let ay = abs(s.y); let az = abs(s.z);
  var face: f32; var cu: f32; var cv: f32;

  if (az >= ax && az >= ay) {
    if (s.z > 0.0) {
      face = 0.0; cu = s.x / s.z; cv = s.y / s.z;
    } else {
      face = 1.0; cu = s.x / s.z; cv = -(s.y / s.z);
    }
  } else if (ax >= ay) {
    if (s.x > 0.0) {
      face = 2.0; cu = -(s.z / s.x); cv = s.y / s.x;
    } else {
      face = 3.0; cu = -(s.z / s.x); cv = -(s.y / s.x);
    }
  } else {
    if (s.y > 0.0) {
      face = 4.0; cu = s.x / s.y; cv = -(s.z / s.y);
    } else {
      face = 5.0; cu = -(s.x / s.y); cv = -(s.z / s.y);
    }
  }

  return vec3f(face, (cu + 1.0) * 0.5, (cv + 1.0) * 0.5);
}

// ============================================================================
// HELPERS
// ============================================================================

fn getTypeColor(t: i32, hovered: bool, selected: bool) -> vec4f {
  // Colors matched to the marketplace UI design system (sale type semantic colors)
  var c: vec4f;
  switch (t) {
    case 0  { c = vec4f(0.15, 0.15, 0.20, 0.08); } // Empty
    case 1  { c = vec4f(0.25, 0.25, 0.32, 0.18); } // Reserved
    case 2  { c = vec4f(0.29, 0.87, 0.50, 0.55); } // For Sale  --mp-success #4ade80
    case 3  { c = vec4f(0.98, 0.75, 0.14, 0.55); } // Auction   --mp-warning #fbbf24
    case 4  { c = vec4f(0.96, 0.45, 0.71, 0.55); } // For Rent  --mp-pink    #f472b6
    case 5  { c = vec4f(0.65, 0.55, 0.98, 0.55); } // Owned     --mp-purple  #a78bfa
    default { c = vec4f(0.15, 0.15, 0.20, 0.08); } // Everything else → Empty
  }
  if (selected) { c = vec4f(0.6, 0.85, 1.0, 0.70); }
  else if (hovered) { c = vec4f(0.4, 0.75, 1.0, 0.55); }
  return c;
}

// ============================================================================
// VERTEX SHADER — vertex pulling identical to terrain
// ============================================================================

struct VSOut {
  @builtin(position) clipPos : vec4f,
  @location(0) sphereNormal : vec3f,
  @location(1) worldPos : vec3f,
  @location(2) distToCamera : f32,
}

@vertex
fn vsMain(
  @builtin(vertex_index) vertexIdx : u32,
  @builtin(instance_index) instanceIdx : u32
) -> VSOut {
  var out : VSOut;

  // Vertex pulling — identical to terrain shader
  let slotIdx = visibleIndices[instanceIdx];
  let baseIdx = (slotIdx * 625u + vertexIdx) * 5u;
  let pulledPos = vec3f(allVertices[baseIdx], allVertices[baseIdx + 1u], allVertices[baseIdx + 2u]);
  let uv = vec2f(allVertices[baseIdx + 3u], allVertices[baseIdx + 4u]);

  let chunk = instances[slotIdx];
  let debugFlagsV = u32(globals.whitePoint.w + 0.5);
  let showNoise = (debugFlagsV & 32u) != 0u;

  // Reconstruct sphere normal (identical to terrain)
  let faceIdx = u32(chunk.quadParams.z + 0.5);
  let quadX = chunk.quadParams.x;
  let quadY = chunk.quadParams.y;
  let quadSize = chunk.chunkCenter.w;

  let cubeU = quadX + uv.x * quadSize;
  let cubeV = quadY + uv.y * quadSize;
  let cubePos = FaceNormals[faceIdx] + FaceRights[faceIdx] * cubeU + FaceUps[faceIdx] * cubeV;
  let sNorm = normalize(cubePos);

  // Terrain height (identical to terrain)
  let basePosRel = chunk.chunkCenter.xyz + pulledPos;
  let distToCamera = length(basePosRel);
  let heightMul = getTerrainHeight(sNorm, terrainParams.octaves, showNoise, distToCamera);
  let heightKm = clamp(heightMul * HEIGHT_SCALE, MIN_ALTITUDE, MAX_ALTITUDE);
  let snappedHeight = max(0.0, heightKm);

  // Position slightly above terrain to avoid z-fighting
  let pos = basePosRel + sNorm * (snappedHeight + HEIGHT_EPSILON);

  // Skirt handling: terrain edge vertices go down for gap sealing.
  // For parcel overlay, just render at normal height (no skirt needed).
  // Edge vertices may cause minor overlap but depth test handles it.

  out.clipPos = globals.viewProjection * vec4f(pos, 1.0);
  out.sphereNormal = sNorm;
  out.worldPos = pos;
  out.distToCamera = distToCamera;

  return out;
}

// ============================================================================
// FRAGMENT SHADER — sphere normal → parcel lookup → color
// ============================================================================

@fragment
fn fsMain(in : VSOut) -> @location(0) vec4f {
  // Backface culling
  let toCamera = normalize(-in.worldPos);
  let dotProduct = dot(in.sphereNormal, toCamera);
  if (dotProduct < -0.1) { discard; }

  // Distance-based fade
  let altitude = parcelParams.cameraAltitude;
  let fadeFar = smoothstep(600.0, 400.0, altitude);
  let fadeNear = smoothstep(5.0, 15.0, altitude);
  let fade = fadeFar * fadeNear;
  if (fade < 0.01) { discard; }

  // Map sphere normal → face + UV
  let faceUV = sphereToFaceUV(in.sphereNormal);
  let face = i32(faceUV.x);
  let localXf = faceUV.y * FACE_SIZE;
  let localYf = faceUV.z * FACE_SIZE;
  let localX = clamp(i32(floor(localXf)), 0, FACE_SIZE_I - 1);
  let localY = clamp(i32(floor(localYf)), 0, FACE_SIZE_I - 1);

  // Look up parcel from flat buffer (face-major, row-major order)
  let parcelIdx = face * FACE_SIZE_I * FACE_SIZE_I + localY * FACE_SIZE_I + localX;
  let parcel = parcels[parcelIdx];

  let isHovered = (f32(parcelIdx) == parcelParams.hoveredIdx);
  let isSelected = (f32(parcelIdx) == parcelParams.selectedIdx);

  var color = getTypeColor(i32(parcel.parcelType), isHovered, isSelected);

  // Apply distance + angle fades
  let angleFade = smoothstep(-0.1, 0.3, dotProduct);
  color.a *= fade * angleFade;

  if (color.a < 0.02) { discard; }

  // UV within parcel (fractional part) — for borders and lines
  let uInParcel = fract(localXf);
  let vInParcel = fract(localYf);
  let estateId = parcel.estateId;

  // Parcel grid lines — neon green, visible at all altitudes
  let bw = 0.015;
  let borderU = smoothstep(bw, 0.0, uInParcel) + smoothstep(1.0 - bw, 1.0, uInParcel);
  let borderV = smoothstep(bw, 0.0, vInParcel) + smoothstep(1.0 - bw, 1.0, vInParcel);
  let border = clamp(borderU + borderV, 0.0, 1.0);
  if (border > 0.01) {
    color = mix(color, vec4f(0.0, 1.4, 0.3, 0.7), border * 0.6);
  }

  // State lines — neon yellow (divide each face into 4 sections)
  let stLw = 0.04;
  let isStateV = (localX == 30 || localX == 61 || localX == 92);
  let isStateH = (localY == 30 || localY == 61 || localY == 92);
  let stLineU = smoothstep(1.0 - stLw, 1.0, uInParcel);
  let stLineV = smoothstep(1.0 - stLw, 1.0, vInParcel);
  if (isStateV && stLineU > 0.01) {
    color = mix(color, vec4f(1.5, 1.3, 0.0, 1.0), stLineU);
  }
  if (isStateH && stLineV > 0.01) {
    color = mix(color, vec4f(1.5, 1.3, 0.0, 1.0), stLineV);
  }

  // Region borders (face edges)
  let isMinX = localX == 0;
  let isMaxX = localX == FACE_SIZE_I - 1;
  let isMinY = localY == 0;
  let isMaxY = localY == FACE_SIZE_I - 1;
  if (isMinX || isMaxX || isMinY || isMaxY) {
    let w = 0.06;

    // Face boundary edges (outer side) — neon glow
    // localX=0 → left edge (u≈0) is boundary | localX=122 → right edge (u≈1) is boundary
    let bndU = select(0.0, smoothstep(w, 0.0, uInParcel), isMinX)
             + select(0.0, smoothstep(1.0 - w, 1.0, uInParcel), isMaxX);
    let bndV = select(0.0, smoothstep(w, 0.0, vInParcel), isMinY)
             + select(0.0, smoothstep(1.0 - w, 1.0, vInParcel), isMaxY);
    let boundary = clamp(bndU + bndV, 0.0, 1.0);

    // Halo for boundary only
    let hw = 0.25;
    let haloU = select(0.0, smoothstep(hw, 0.0, uInParcel), isMinX)
              + select(0.0, smoothstep(1.0 - hw, 1.0, uInParcel), isMaxX);
    let haloV = select(0.0, smoothstep(hw, 0.0, vInParcel), isMinY)
              + select(0.0, smoothstep(1.0 - hw, 1.0, vInParcel), isMaxY);
    let halo = clamp(haloU + haloV, 0.0, 1.0);
    color = mix(color, vec4f(0.0, 0.8, 0.9, 0.8), halo * 0.35);
    color = mix(color, vec4f(0.6, 3.0, 3.2, 1.0), boundary * boundary);

    // Inner edges (facing inward) — plain cyan, no glow
    let inU = select(0.0, smoothstep(1.0 - w, 1.0, uInParcel), isMinX)
            + select(0.0, smoothstep(w, 0.0, uInParcel), isMaxX);
    let inV = select(0.0, smoothstep(1.0 - w, 1.0, vInParcel), isMinY)
            + select(0.0, smoothstep(w, 0.0, vInParcel), isMaxY);
    let inner = clamp(inU + inV, 0.0, 1.0);
    color = mix(color, vec4f(0.0, 1.0, 1.1, 0.9), inner);
  }

  // Equator line — neon white with glow
  if (face < 4 && localY == 61) {
    let eqHalo = smoothstep(0.25, 1.0, vInParcel);
    color = mix(color, vec4f(0.8, 0.8, 0.9, 0.8), eqHalo * 0.35);
    let eqCore = smoothstep(0.94, 1.0, vInParcel);
    color = mix(color, vec4f(3.0, 3.0, 3.2, 1.0), eqCore * eqCore);
  }

  // Subtle lighting
  let lightDir = normalize(globals.sunDirection.xyz);
  let diff = max(dot(in.sphereNormal, lightDir), 0.4);
  color = vec4f(color.rgb * diff, color.a);

  return color;
}
`
