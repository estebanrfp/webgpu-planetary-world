/**
 * PlantSystem — GPU-instanced procedural flowers across every biome.
 *
 * Thin wrapper around `createScatterSystem` (lib/systems/scatterBase.js):
 * this module only owns its three WGSL shaders and the mesh generation
 * callback. All bind groups, pipelines, shadow cascades, update loop
 * and instance buffers are shared with the other scatter systems.
 *
 * @module systems/PlantSystem
 */

import { PLANT_CONFIG } from '../config/index.js';
import { plantScatterComputeShader } from '../shaders/plantScatter.compute.wgsl.js';
import { generatePlant } from '../procedural/ProceduralPlantGenerator.js';
import { createScatterSystem } from './scatterBase.js';

const NUM_VARIANTS = PLANT_CONFIG.variants.length;

// ---------- Render Shader (instanced mesh + simple hemisphere lighting) ----

const shaderCode = /* wgsl */ `
struct GlobalUniforms {
  viewProjection : mat4x4f,
  cameraPos      : vec4f,
  sunDirection   : vec4f,
  earthCenter    : vec4f,
  whitePoint     : vec4f,
  _reserved0     : vec4f,
  avatarSphere   : vec4f,
  moonDir        : vec4f,
  miscParams     : vec4f,
}

struct Instance {
  worldPos : vec3f,
  alpha    : f32,
  size     : vec2f,
  biome    : f32,
  _pad     : f32,
}

@group(0) @binding(0) var<uniform> globals   : GlobalUniforms;
@group(0) @binding(1) var<storage, read> instances : array<Instance>;
@group(0) @binding(2) var<uniform> variantId : u32;

@group(1) @binding(0) var plantTex  : texture_2d<f32>;
@group(1) @binding(1) var plantSamp : sampler;

struct VOut {
  @builtin(position) position : vec4f,
  @location(0) uv     : vec2f,
  @location(1) normal : vec3f,
  @location(2) alpha  : f32,
}

@vertex
fn vs_main(
  @location(0) localPos    : vec3f,
  @location(1) localNormal : vec3f,
  @location(2) localUV     : vec2f,
  @builtin(instance_index) ii : u32
) -> VOut {
  var out : VOut;
  let inst = instances[ii];

  if (inst.alpha <= 0.0 || u32(inst.biome + 0.5) != variantId) {
    out.position = vec4f(0.0, 0.0, -10.0, 1.0);
    out.alpha = 0.0;
    return out;
  }

  let up = normalize(inst.worldPos - globals.earthCenter.xyz);
  var refV = vec3f(0.0, 1.0, 0.0);
  if (abs(up.y) > 0.99) { refV = vec3f(1.0, 0.0, 0.0); }
  let tangentU = normalize(cross(refV, up));
  let tangentV = cross(up, tangentU);

  let scaled = vec3f(localPos.x * inst.size.x, localPos.y * inst.size.y, localPos.z * inst.size.x);
  let worldVertex = inst.worldPos + tangentU * scaled.x + up * scaled.y + tangentV * scaled.z;
  let worldNormal = normalize(tangentU * localNormal.x + up * localNormal.y + tangentV * localNormal.z);

  out.position = globals.viewProjection * vec4f(worldVertex, 1.0);
  out.uv       = localUV;
  out.normal   = worldNormal;
  out.alpha    = inst.alpha;
  return out;
}

// 4x4 Bayer dither — smooth LOD fade at the grid edge.
fn bayerDither(pos: vec2f) -> f32 {
  let bayer = array<f32, 16>(
    0.0/16.0, 8.0/16.0, 2.0/16.0, 10.0/16.0,
    12.0/16.0, 4.0/16.0, 14.0/16.0, 6.0/16.0,
    3.0/16.0, 11.0/16.0, 1.0/16.0, 9.0/16.0,
    15.0/16.0, 7.0/16.0, 13.0/16.0, 5.0/16.0,
  );
  let x = u32(pos.x) % 4u;
  let y = u32(pos.y) % 4u;
  return bayer[y * 4u + x];
}

@fragment
fn fs_main(in : VOut) -> @location(0) vec4f {
  if (in.alpha < bayerDither(in.position.xy)) { discard; }

  let albedo = textureSample(plantTex, plantSamp, in.uv);

  // Brighter ambient than trees so small foliage doesn't muddy in shadow.
  let sunDir = normalize(globals.sunDirection.xyz);
  let nDotL = max(dot(in.normal, sunDir), 0.0);
  let light = 0.45 + 0.55 * nDotL;

  return vec4f(albedo.rgb * light, 1.0);
}
`;

// ---------- CSM Shadow Depth Shader ----------------------------------------

const shadowDepthShaderCode = /* wgsl */ `
struct ShadowUniforms {
  cascadeViewProj0 : mat4x4f,
  cascadeViewProj1 : mat4x4f,
  cascadeViewProj2 : mat4x4f,
  cascadeViewProj3 : mat4x4f,
  splitDepths      : vec4f,
  earthCenter      : vec4f,
}

struct Instance {
  worldPos : vec3f,
  alpha    : f32,
  size     : vec2f,
  biome    : f32,
  _pad     : f32,
}

@group(0) @binding(0) var<uniform> shadow    : ShadowUniforms;
@group(0) @binding(1) var<storage, read> instances : array<Instance>;
@group(0) @binding(2) var<uniform> variantId : u32;

struct VOut { @builtin(position) position : vec4f, }

fn buildShadowVertex(localPos : vec3f, ii : u32, cascadeVP : mat4x4f) -> VOut {
  var out : VOut;
  let inst = instances[ii];

  if (inst.alpha <= 0.0 || u32(inst.biome + 0.5) != variantId) {
    out.position = vec4f(0.0, 0.0, -10.0, 1.0);
    return out;
  }

  let up = normalize(inst.worldPos - shadow.earthCenter.xyz);
  var refV = vec3f(0.0, 1.0, 0.0);
  if (abs(up.y) > 0.99) { refV = vec3f(1.0, 0.0, 0.0); }
  let tangentU = normalize(cross(refV, up));
  let tangentV = cross(up, tangentU);

  let scaled = vec3f(localPos.x * inst.size.x, localPos.y * inst.size.y, localPos.z * inst.size.x);
  let worldVertex = inst.worldPos + tangentU * scaled.x + up * scaled.y + tangentV * scaled.z;
  out.position = cascadeVP * vec4f(worldVertex, 1.0);
  return out;
}

@vertex fn vs_cascade0(@location(0) p:vec3f,@location(1) n:vec3f,@location(2) u:vec2f,@builtin(instance_index) ii:u32)
  -> VOut { return buildShadowVertex(p, ii, shadow.cascadeViewProj0); }
@vertex fn vs_cascade1(@location(0) p:vec3f,@location(1) n:vec3f,@location(2) u:vec2f,@builtin(instance_index) ii:u32)
  -> VOut { return buildShadowVertex(p, ii, shadow.cascadeViewProj1); }
@vertex fn vs_cascade2(@location(0) p:vec3f,@location(1) n:vec3f,@location(2) u:vec2f,@builtin(instance_index) ii:u32)
  -> VOut { return buildShadowVertex(p, ii, shadow.cascadeViewProj2); }
@vertex fn vs_cascade3(@location(0) p:vec3f,@location(1) n:vec3f,@location(2) u:vec2f,@builtin(instance_index) ii:u32)
  -> VOut { return buildShadowVertex(p, ii, shadow.cascadeViewProj3); }

@fragment fn fs_shadow_depth() {}
`;

// ---------- Factory --------------------------------------------------------

/**
 * Create a PlantSystem with instanced procedural meshes.
 * @param {GPUDevice} device
 * @param {GPUTextureFormat} format
 * @param {GPUBuffer} globalBuffer
 * @param {GPUBuffer} terrainParamsBuffer
 */
export const createPlantSystem = (device, format, globalBuffer, terrainParamsBuffer) =>
  createScatterSystem({
    name: 'Plant',
    device, format, globalBuffer, terrainParamsBuffer,
    gridSide: PLANT_CONFIG.gridSide,
    cellSpacingKm: PLANT_CONFIG.cellSpacingKm,
    numVariants: NUM_VARIANTS,
    renderShader: shaderCode,
    shadowDepthShader: shadowDepthShaderCode,
    computeShader: plantScatterComputeShader,
    generateVariants: ({ renderBGL1, sampler }) => {
      const variants = new Array(NUM_VARIANTS).fill(null);
      let totalTris = 0;
      for (let idx = 0; idx < NUM_VARIANTS; idx++) {
        try {
          const plant = generatePlant(device, renderBGL1, sampler, {
            seed: idx * 6151 + 23,
            templateIdx: idx,
          });
          variants[idx] = plant;
          for (const sm of plant.subMeshes) totalTris += sm.indexCount / 3;
        } catch (e) {
          console.error(`[PlantSystem] variant ${idx} failed:`, e);
        }
      }
      console.log(`[PlantSystem] ${variants.filter(Boolean).length}/${NUM_VARIANTS} procedural plant variants ready (${Math.round(totalTris)} tris)`);
      return variants;
    },
  });
