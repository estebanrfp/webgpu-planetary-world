/**
 * PalmSystem — GPU-instanced palm meshes along tropical coasts.
 *
 * Thin wrapper around `createScatterSystem`. Generates 8 variants by
 * cycling through 5 silhouettes (single curved, twin trunks, tall
 * straight, lateral lean, snake / low-leaning) so the compute shader's
 * hash picks a mix on every beach. The legacy GLB mode was removed —
 * everything is procedural via ProceduralTreeGenerator's palm family.
 *
 * @module systems/PalmSystem
 */

import { PALM_CONFIG } from '../config/index.js';
import { palmScatterComputeShader } from '../shaders/palmScatter.compute.wgsl.js';
import { generateTree, TREE_TEMPLATES_META } from '../procedural/ProceduralTreeGenerator.js';
import { createScatterSystem } from './scatterBase.js';

// Palm style rotation — 5 silhouettes distributed across the 8 variant slots
// so the compute-shader hash produces a varied beachscape.
const PALM_STYLE_NAMES = ['palm', 'palm_tall', 'palm_lean', 'palm_twin', 'palm_snake'];
const PALM_STYLE_INDICES = PALM_STYLE_NAMES.map(
  (n) => TREE_TEMPLATES_META.findIndex((t) => t.name === n),
);

const NUM_VARIANTS = PALM_CONFIG.proceduralVariants;

// ---------- Render Shader (instanced palm mesh + per-instance Y rotation) -

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
  _skyStylization: vec4f,
  _skyTint       : vec4f,
  rainParams     : vec4f,    // x=rain, y=shadowDayWeight, z=snowIntensity, w=reserved
}

struct Instance {
  worldPos : vec3f,
  alpha    : f32,
  size     : vec2f,
  biome    : f32,
  rotation : f32,             // per-instance Y rotation [0, 2π]
}

@group(0) @binding(0) var<uniform> globals   : GlobalUniforms;
@group(0) @binding(1) var<storage, read> instances : array<Instance>;
@group(0) @binding(2) var<uniform> variantId : u32;

@group(1) @binding(0) var palmTex  : texture_2d<f32>;
@group(1) @binding(1) var palmSamp : sampler;

struct VOut {
  @builtin(position) position : vec4f,
  @location(0) uv     : vec2f,
  @location(1) normal : vec3f,
  @location(2) alpha  : f32,
  @location(3) up     : vec3f,
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

  // Per-instance Y rotation so neighbouring palms don't all face the same way.
  let cosR = cos(inst.rotation);
  let sinR = sin(inst.rotation);
  let rotated = vec3f(
    scaled.x * cosR - scaled.z * sinR,
    scaled.y,
    scaled.x * sinR + scaled.z * cosR
  );
  let worldVertex = inst.worldPos + tangentU * rotated.x + up * rotated.y + tangentV * rotated.z;

  let rotatedNormal = vec3f(
    localNormal.x * cosR - localNormal.z * sinR,
    localNormal.y,
    localNormal.x * sinR + localNormal.z * cosR
  );
  let worldNormal = normalize(tangentU * rotatedNormal.x + up * rotatedNormal.y + tangentV * rotatedNormal.z);

  out.position = globals.viewProjection * vec4f(worldVertex, 1.0);
  out.uv       = localUV;
  out.normal   = worldNormal;
  out.alpha    = inst.alpha;
  out.up       = up;
  return out;
}

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

  let albedo = textureSample(palmTex, palmSamp, in.uv);
  if (albedo.a < 0.3) { discard; }

  // Higher ambient than trees — fronds read dark otherwise.
  let sunDir = normalize(globals.sunDirection.xyz);
  let n = normalize(in.normal);
  let nDotL = max(dot(n, sunDir), 0.0);
  let light = 0.60 + 0.40 * nDotL;

  var litColor = albedo.rgb * light;

  // Snow only on upward-facing fronds (no floor — would paint undersides).
  let snowIntensity = globals.rainParams.z;
  if (snowIntensity > 0.01) {
    let alignment = dot(n, normalize(in.up));
    let horizontalSnow = max(alignment, 0.0);
    let snowCoverage = clamp(snowIntensity * snowIntensity * horizontalSnow * 1.2, 0.0, 0.88);
    let snowColor = vec3f(0.94, 0.96, 1.0) * light;
    litColor = mix(litColor, snowColor, snowCoverage);
  }

  return vec4f(litColor, 1.0);
}
`;

// ---------- CSM Shadow Depth Shader (matches main render orientation) -----

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
  rotation : f32,
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

  // Must mirror the main render shader (same orientation + Y rotation) so
  // the shadow silhouette matches the visible palm.
  let up = normalize(inst.worldPos - shadow.earthCenter.xyz);
  var refV = vec3f(0.0, 1.0, 0.0);
  if (abs(up.y) > 0.99) { refV = vec3f(1.0, 0.0, 0.0); }
  let tangentU = normalize(cross(refV, up));
  let tangentV = cross(up, tangentU);

  let scaled = vec3f(localPos.x * inst.size.x, localPos.y * inst.size.y, localPos.z * inst.size.x);

  let cosR = cos(inst.rotation);
  let sinR = sin(inst.rotation);
  let rotated = vec3f(
    scaled.x * cosR - scaled.z * sinR,
    scaled.y,
    scaled.x * sinR + scaled.z * cosR
  );
  let worldVertex = inst.worldPos + tangentU * rotated.x + up * rotated.y + tangentV * rotated.z;
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
 * Create a PalmSystem with instanced procedural palms.
 * @param {GPUDevice} device
 * @param {GPUTextureFormat} format
 * @param {GPUBuffer} globalBuffer
 * @param {GPUBuffer} terrainParamsBuffer
 */
export const createPalmSystem = (device, format, globalBuffer, terrainParamsBuffer) =>
  createScatterSystem({
    name: 'Palm',
    device, format, globalBuffer, terrainParamsBuffer,
    gridSide: PALM_CONFIG.gridSide,
    cellSpacingKm: PALM_CONFIG.cellSpacingKm,
    numVariants: NUM_VARIANTS,
    renderShader: shaderCode,
    shadowDepthShader: shadowDepthShaderCode,
    computeShader: palmScatterComputeShader,
    generateVariants: ({ renderBGL1, sampler }) => {
      if (PALM_STYLE_INDICES.some((idx) => idx < 0)) {
        throw new Error("[PalmSystem] missing palm templates in ProceduralTreeGenerator");
      }
      const variants = new Array(NUM_VARIANTS).fill(null);
      let totalTris = 0;
      for (let i = 0; i < NUM_VARIANTS; i++) {
        const templateIdx = PALM_STYLE_INDICES[i % PALM_STYLE_INDICES.length];
        const palm = generateTree(device, renderBGL1, sampler, {
          seed: 4242 + i * 7919,
          templateIdx,
          sizeScale: 1.0,
        });
        variants[i] = { subMeshes: palm.subMeshes };
        for (const sm of palm.subMeshes) totalTris += sm.indexCount / 3;
      }
      console.log(`[PalmSystem] ${NUM_VARIANTS} procedural palm variants ready (${Math.round(totalTris / NUM_VARIANTS)} tris avg)`);
      return variants;
    },
  });
