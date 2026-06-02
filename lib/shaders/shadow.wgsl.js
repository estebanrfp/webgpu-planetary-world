/**
 * shadow.wgsl.js - WGSL for CSM shadow map depth pass
 * 
 * Cascaded Shadow Maps with 4 cascades for high-resolution
 * near shadows and distant terrain coverage.
 */

export const shadowShader = `
// CSM Shadow Uniforms: 4 matrices + split depths + padding
struct ShadowUniforms {
  cascadeViewProj0: mat4x4f,
  cascadeViewProj1: mat4x4f,
  cascadeViewProj2: mat4x4f,
  cascadeViewProj3: mat4x4f,
  splitDepths: vec4f,
  earthCenter: vec4f,
}

struct ChunkData {
  morphParams : vec4f,
  chunkCenter : vec4f,
  quadParams : vec4f,
  chunkNormal : vec4f,
}

@group(0) @binding(0) var<uniform> shadow: ShadowUniforms;
@group(0) @binding(1) var<storage, read> instances: array<ChunkData>;
@group(0) @binding(2) var<storage, read> allVertices: array<f32>;

struct VertexInput {
  @builtin(vertex_index) vertexIdx : u32,
  @builtin(instance_index) instanceIdx : u32,
}

struct VertexOutput {
  @builtin(position) position: vec4f,
}

// Get cascade matrix by index
fn getCascadeViewProj(idx: u32) -> mat4x4f {
  switch(idx) {
    case 0u: { return shadow.cascadeViewProj0; }
    case 1u: { return shadow.cascadeViewProj1; }
    case 2u: { return shadow.cascadeViewProj2; }
    default: { return shadow.cascadeViewProj3; }
  }
}

// Basis vectors for projection (matching terrain shader)
const FaceNormals = array<vec3f, 6>(
  vec3f(0.0, 0.0, 1.0), vec3f(0.0, 0.0, -1.0),
  vec3f(1.0, 0.0, 0.0), vec3f(-1.0, 0.0, 0.0),
  vec3f(0.0, 1.0, 0.0), vec3f(0.0, -1.0, 0.0)
);
const FaceUps = array<vec3f, 6>(
  vec3f(0.0, 1.0, 0.0), vec3f(0.0, 1.0, 0.0),
  vec3f(0.0, 1.0, 0.0), vec3f(0.0, 1.0, 0.0),
  vec3f(0.0, 0.0, -1.0), vec3f(0.0, 0.0, 1.0)
);
const FaceRights = array<vec3f, 6>(
  vec3f(1.0, 0.0, 0.0), vec3f(-1.0, 0.0, 0.0),
  vec3f(0.0, 0.0, -1.0), vec3f(0.0, 0.0, 1.0),
  vec3f(1.0, 0.0, 0.0), vec3f(1.0, 0.0, 0.0)
);

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
  var out: VertexOutput;
  
  // VERTEX PULLING from Mega-Storage Buffer
  let slotIdx = in.instanceIdx;
  let baseIdx = (slotIdx * 625u + in.vertexIdx) * 5u;
  let pulledPos = vec3f(allVertices[baseIdx], allVertices[baseIdx + 1u], allVertices[baseIdx + 2u]);
  
  let chunk = instances[slotIdx];
  
  // FLOATING ORIGIN: Positions are camera-relative from CPU (float64 precision)
  let worldPos = chunk.chunkCenter.xyz + pulledPos;
  
  // Use cascade 0 matrix for primary shadow pass
  // Multi-cascade rendering is handled by multiple draw passes
  out.position = shadow.cascadeViewProj0 * vec4f(worldPos, 1.0);
  return out;
}

// Alternative entry point for specific cascade rendering
@vertex
fn vs_cascade1(in: VertexInput) -> VertexOutput {
  var out: VertexOutput;
  let slotIdx = in.instanceIdx;
  let baseIdx = (slotIdx * 625u + in.vertexIdx) * 5u;
  let pulledPos = vec3f(allVertices[baseIdx], allVertices[baseIdx + 1u], allVertices[baseIdx + 2u]);
  let chunk = instances[slotIdx];
  let worldPos = chunk.chunkCenter.xyz + pulledPos;
  out.position = shadow.cascadeViewProj1 * vec4f(worldPos, 1.0);
  return out;
}

@vertex
fn vs_cascade2(in: VertexInput) -> VertexOutput {
  var out: VertexOutput;
  let slotIdx = in.instanceIdx;
  let baseIdx = (slotIdx * 625u + in.vertexIdx) * 5u;
  let pulledPos = vec3f(allVertices[baseIdx], allVertices[baseIdx + 1u], allVertices[baseIdx + 2u]);
  let chunk = instances[slotIdx];
  let worldPos = chunk.chunkCenter.xyz + pulledPos;
  out.position = shadow.cascadeViewProj2 * vec4f(worldPos, 1.0);
  return out;
}

@vertex
fn vs_cascade3(in: VertexInput) -> VertexOutput {
  var out: VertexOutput;
  let slotIdx = in.instanceIdx;
  let baseIdx = (slotIdx * 625u + in.vertexIdx) * 5u;
  let pulledPos = vec3f(allVertices[baseIdx], allVertices[baseIdx + 1u], allVertices[baseIdx + 2u]);
  let chunk = instances[slotIdx];
  let worldPos = chunk.chunkCenter.xyz + pulledPos;
  out.position = shadow.cascadeViewProj3 * vec4f(worldPos, 1.0);
  return out;
}

@fragment
fn fs_main() {
  // Depth only - no color output
}
`;

export const shadowCharacterShader = `
// CSM Shadow Uniforms for Character
struct ShadowUniforms {
  cascadeViewProj0: mat4x4f,
  cascadeViewProj1: mat4x4f,
  cascadeViewProj2: mat4x4f,
  cascadeViewProj3: mat4x4f,
  splitDepths: vec4f,
  earthCenter: vec4f,
}

struct GlobalUniforms {
  viewProjection : mat4x4f,
  cameraPos : vec4f,
  sunDirection : vec4f,
  earthCenter : vec4f,
  whitePoint : vec4f,
  _reserved0 : vec4f,
  avatarSphere : vec4f,
  moonDir : vec4f,
  miscParams : vec4f,
}

// Per-avatar instance data — must match avatar.wgsl.js AvatarInstance exactly
// (112 bytes / 28 floats) so the storage-buffer stride lines up.
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
  boneSlot : f32,                // per-instance bone slot (matches avatar.wgsl.js)
  _pad1 : f32,
  _pad2 : f32,
}

@group(0) @binding(0) var<uniform> shadow: ShadowUniforms;
@group(0) @binding(1) var<uniform> globals: GlobalUniforms;
@group(0) @binding(2) var<storage, read> instances: array<AvatarInstance>;
@group(0) @binding(3) var<storage, read> boneMatrices: array<mat4x4f>;

struct VertexInput {
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
  @location(3) joints: vec4f,
  @location(4) weights: vec4f,
}

struct VertexOutput {
  @builtin(position) position: vec4f,
}

// Must match avatar.wgsl.js buildRotationMatrix exactly so the shadow
// silhouette tracks the avatar's real facing direction.
fn buildRotationMatrix(up : vec3f, fwd : vec3f) -> mat3x3f {
  let fwd_ortho = normalize(fwd - dot(fwd, up) * up);
  let right = normalize(cross(up, fwd_ortho));
  let forward = cross(right, up);
  return mat3x3f(right, up, forward);
}

fn getCascadeViewProj(idx : u32) -> mat4x4f {
  switch(idx) {
    case 0u: { return shadow.cascadeViewProj0; }
    case 1u: { return shadow.cascadeViewProj1; }
    case 2u: { return shadow.cascadeViewProj2; }
    default: { return shadow.cascadeViewProj3; }
  }
}

// Skins the avatar, places it on the planet surface and projects it with the
// requested cascade matrix. One avatar per @builtin(instance_index).
fn shadowVertex(in : VertexInput, ii : u32, cascadeIdx : u32) -> VertexOutput {
  var out : VertexOutput;
  let inst = instances[ii];

  // Skip invisible avatars entirely — local player while in flight mode
  // has visibility=0. Pushing the vertex outside NDC (-10) makes the
  // rasterizer drop the triangle, so no shadow is cast.
  if (inst.visibility < 0.01) {
    out.position = vec4f(0.0, 0.0, -10.0, 1.0);
    return out;
  }

  // 1. Skeletal Animation (Skinning)
  var skinnedPos = vec3f(0.0);
  let totalWeight = in.weights.x + in.weights.y + in.weights.z + in.weights.w;

  if (totalWeight > 0.001) {
    // Per-instance bone slot (player=0, NPC walk/run phases) — must match
    // avatar.wgsl.js. 128u = AVATAR_CONFIG.maxBones (slot width).
    let boneBase = u32(inst.boneSlot) * 128u;
    skinnedPos += (boneMatrices[boneBase + u32(in.joints.x)] * vec4f(in.position, 1.0)).xyz * in.weights.x;
    skinnedPos += (boneMatrices[boneBase + u32(in.joints.y)] * vec4f(in.position, 1.0)).xyz * in.weights.y;
    skinnedPos += (boneMatrices[boneBase + u32(in.joints.z)] * vec4f(in.position, 1.0)).xyz * in.weights.z;
    skinnedPos += (boneMatrices[boneBase + u32(in.joints.w)] * vec4f(in.position, 1.0)).xyz * in.weights.w;
  } else {
    skinnedPos = in.position;
  }

  // 2. Planetary Position (matching main character shader)
  let scaledPos = skinnedPos * inst.scale;
  let avatarCenter = inst.center;
  let localUp = normalize(avatarCenter - globals.earthCenter.xyz);
  let rotMatrix = buildRotationMatrix(localUp, inst.forward);
  let worldPos = (rotMatrix * scaledPos) + avatarCenter;
  
  out.position = getCascadeViewProj(cascadeIdx) * vec4f(worldPos, 1.0);
  return out;
}

// One entry point per cascade — the pipeline selects which, so avatars are
// written into every cascade layer of the shadow atlas (the avatar ring is
// wider than cascade 0, so distant avatars must reach the larger cascades).
@vertex fn vs_main(in : VertexInput, @builtin(instance_index) ii : u32) -> VertexOutput { return shadowVertex(in, ii, 0u); }
@vertex fn vs_cascade1(in : VertexInput, @builtin(instance_index) ii : u32) -> VertexOutput { return shadowVertex(in, ii, 1u); }
@vertex fn vs_cascade2(in : VertexInput, @builtin(instance_index) ii : u32) -> VertexOutput { return shadowVertex(in, ii, 2u); }
@vertex fn vs_cascade3(in : VertexInput, @builtin(instance_index) ii : u32) -> VertexOutput { return shadowVertex(in, ii, 3u); }

@fragment
fn fs_main() {
  // Depth only
}
`;
