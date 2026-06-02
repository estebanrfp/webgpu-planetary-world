/**
 * GPU Frustum Culling Compute Shader
 * 
 * Performs horizon and back-cone culling on GPU.
 * 
 * Input: Array of chunk bounding spheres
 * Output: Array of visibility flags (0 = culled, 1 = visible)
 */

export const frustumCullComputeShader = /* wgsl */`

struct ChunkData {
  center: vec3f,      // Bounding sphere center (PLANET-LOCAL)
  radius: f32,        // Bounding sphere radius in km
  lodLevel: f32,      // LOD level for adaptive margin
  meshIndex: f32,     // Original mesh index
  _pad: vec2f,        // Padding to 32 bytes
}

struct IndirectDrawArgs {
  indexCount: u32,
  instanceCount: atomic<u32>,
  firstIndex: u32,
  baseVertex: i32,
  firstInstance: u32,
}

struct CullParams {
  cameraPos: vec3f,
  planetRadius: f32,
  cameraForward: vec3f,
  chunkCount: u32,
  earthCenterOffset: vec3f,
  horizonCullingEnabled: f32,
  horizonCullMargin: f32,
  backConeThreshold: f32,
  _pad: vec2f,
}

struct TerrainInstance {
  morphParams : vec4f, // x: morphFactor, y: lodLevel, z: morphActive, w: checkerIndex
  chunkCenter : vec4f, // xyz: center, w: size (qSize)
  quadParams : vec4f,  // x: qX, y: qY, z: faceIndex, w: reserved
  chunkNormal : vec4f, // xyz: normal, w: ?
}

@group(0) @binding(0) var<storage, read> chunks: array<ChunkData>;
@group(0) @binding(1) var<storage, read_write> visibility: array<u32>;
@group(0) @binding(2) var<uniform> params: CullParams;
@group(0) @binding(3) var<storage, read_write> indirectArgs: IndirectDrawArgs;
@group(0) @binding(4) var<storage, read_write> visibleIndices: array<u32>;
@group(0) @binding(5) var<storage, read_write> instances: array<TerrainInstance>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id: vec3u) {
  let idx = global_id.x;
  if (idx >= params.chunkCount) { return; }

  let chunk = chunks[idx];
  // GPU TRANSFORMATION: Convert from planet-local to camera-relative
  let cameraRelativeCenter = chunk.center + params.earthCenterOffset;
  var isVisible = true;

  // 1. SAFETY: If camera is near or inside the bounding sphere, always visible.
  let distSq = dot(cameraRelativeCenter, cameraRelativeCenter);
  let dist = sqrt(distSq);
  let safetyRadius = chunk.radius * 2.0;
  
  if (dist < safetyRadius) {
    isVisible = true;
  } else {
    // 2. HORIZON CULLING - Geometric horizon distance
    // A chunk beyond the geometric horizon distance is definitely hidden by Earth's curvature
    if (params.horizonCullingEnabled > 0.5) {
      // Calculate camera altitude above planet surface
      let camDistFromCenter = length(params.earthCenterOffset);
      let cameraAltitude = camDistFromCenter - params.planetRadius;
      
      // Clamp altitude to >= 0 for stable behavior when below sea level
      // At h=0, horizonDist = 0, and only safety margin applies
      let h = max(cameraAltitude, 0.0);
      
      // Geometric horizon distance formula: d = sqrt(2*R*h + h²)
      let R = params.planetRadius;
      let horizonDist = sqrt(2.0 * R * h + h * h);
      
      // Add safety margin for terrain height variations
      let safetyMargin = params.horizonCullMargin + chunk.radius * 2.0;
      
      // Cull if chunk center is significantly beyond the horizon
      if (dist > horizonDist + safetyMargin) {
        isVisible = false;
      }
    }

    
    // 3. BACK-CONE CULLING (works with camera-relative coords)
    if (isVisible) {
      let toChunkNorm = cameraRelativeCenter / dist;
      let dotForward = dot(toChunkNorm, params.cameraForward);
      let angularRadius = chunk.radius / dist;
      
      // Use configured threshold
      let threshold = params.backConeThreshold - angularRadius;
      
      if (dotForward < threshold) {
        isVisible = false;
      }
    }
  }

    // Visibility reporting
  if (isVisible) {
    let slotIdx = u32(chunk.meshIndex);
    visibility[idx] = 1u;
    let visibleDrawIdx = atomicAdd(&indirectArgs.instanceCount, 1u);
    visibleIndices[visibleDrawIdx] = slotIdx;
  } else {
    visibility[idx] = 0u;
  }
}
`;
