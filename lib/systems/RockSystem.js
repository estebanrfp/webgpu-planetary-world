/**
 * RockSystem — GPU-instanced procedural rock meshes with shared normal map.
 *
 * Thin wrapper around `createScatterSystem` plus an `extraBindGroup`
 * (@group(2)) that carries the mountain rock normal map shared across
 * every variant. The KTX2 loads async; a 1×1 flat normal serves as
 * fallback so the rocks render correctly during the decode.
 *
 * @module systems/RockSystem
 */

import { ROCK_CONFIG } from '../config/index.js';
import { rockScatterComputeShader } from '../shaders/rockScatter.compute.wgsl.js';
import { generateRock } from '../procedural/ProceduralRockGenerator.js';
import { loadKTX2Texture } from '../textures/ktx2-loader.js';
import { createScatterSystem } from './scatterBase.js';

const ROCK_NORMAL_MAP_URL = './assets/textures/sources-textures/rock/Rock035_1K-PNG/normal.ktx2';
const NUM_VARIANTS = ROCK_CONFIG.variants.length;

// ---------- Render Shader (instanced mesh + triplanar normal map) ---------

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

@group(1) @binding(0) var rockTex     : texture_2d<f32>;
@group(1) @binding(1) var rockSamp    : sampler;

// Shared mountain relief — same normal map the terrain uses for cliffs.
@group(2) @binding(0) var rockNormalTex  : texture_2d<f32>;
@group(2) @binding(1) var rockNormalSamp : sampler;

struct VOut {
  @builtin(position) position : vec4f,
  @location(0) uv       : vec2f,
  @location(1) normal   : vec3f,
  @location(2) alpha    : f32,
  @location(3) localPos : vec3f,
  @location(4) dist     : f32,
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
  out.localPos = localPos;
  // worldVertex is camera-relative — length is the actual distance to
  // the camera in km. ×1000 to feed metres to the FS fade thresholds.
  out.dist     = length(worldVertex) * 1000.0;
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

// Triplanar sample of the rock normal map in model space. tileScale=3 →
// ~3 repeats per rock face regardless of runtime size, so landmark
// boulders and small outcrops share the same surface-detail density.
// textureSampleLevel (not textureSample) so the caller can fade on
// distance — textureSample needs uniform control flow for derivatives.
fn sampleRockNormal(localPos: vec3f, mipLevel: f32) -> vec3f {
  let tileScale = 3.0;
  let p = localPos * tileScale;
  let nWeights = pow(abs(normalize(localPos + vec3f(1e-5))), vec3f(4.0));
  let w = nWeights / max(nWeights.x + nWeights.y + nWeights.z, 1e-5);

  let nx = textureSampleLevel(rockNormalTex, rockNormalSamp, p.zy, mipLevel).rgb * 2.0 - 1.0;
  let ny = textureSampleLevel(rockNormalTex, rockNormalSamp, p.xz, mipLevel).rgb * 2.0 - 1.0;
  let nz = textureSampleLevel(rockNormalTex, rockNormalSamp, p.xy, mipLevel).rgb * 2.0 - 1.0;

  let bumpX = vec3f(0.0,   nx.y, nx.x);
  let bumpY = vec3f(ny.x, 0.0,   ny.y);
  let bumpZ = vec3f(nz.x, nz.y, 0.0);

  return normalize(bumpX * w.x + bumpY * w.y + bumpZ * w.z);
}

@fragment
fn fs_main(in : VOut) -> @location(0) vec4f {
  if (in.alpha < bayerDither(in.position.xy)) { discard; }

  let albedo = textureSample(rockTex, rockSamp, in.uv);
  if (albedo.a < 0.1) { discard; }

  // Distance-faded bump: strength 0.7 close, fading to 0 at 1500 m.
  // mipLevel ramps 0 → 8 with distance so faraway rocks sample a coarse
  // MIP that is essentially flat anyway.
  let baseN = normalize(in.normal);
  let bumpFade = 1.0 - smoothstep(500.0, 1500.0, in.dist);
  let mipLevel = mix(8.0, 0.0, bumpFade);
  let bump = sampleRockNormal(in.localPos, mipLevel);
  let n = normalize(mix(baseN, normalize(baseN + bump), 0.7 * bumpFade));

  // Hemisphere lighting: sun + sky + ground bounce
  let sunDir = normalize(globals.sunDirection.xyz);
  let nDotL = dot(n, sunDir);
  let wrap = nDotL * 0.5 + 0.5;
  let sky = n.y * 0.5 + 0.5;
  let light = 0.35 + 0.45 * wrap + 0.2 * sky;

  return vec4f(albedo.rgb * light, 1.0);
}
`;

// ---------- CSM Shadow Depth Shader (opaque mesh geometry) ----------------

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
 * Create a RockSystem with instanced procedural rock meshes.
 * @param {GPUDevice} device
 * @param {GPUTextureFormat} format
 * @param {GPUBuffer} globalBuffer
 * @param {GPUBuffer} terrainParamsBuffer
 */
export const createRockSystem = (device, format, globalBuffer, terrainParamsBuffer) => {
  // --- Shared rock normal map (mountain relief) ---------------------------
  // 1×1 flat normal placeholder so rocks render correctly even before the
  // KTX2 finishes decoding. Swapped in below when the async load resolves.
  const flatNormalTex = device.createTexture({
    size: [1, 1, 1], format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    label: 'Rock Flat Normal (fallback)',
  });
  device.queue.writeTexture(
    { texture: flatNormalTex },
    new Uint8Array([128, 128, 255, 255]),
    { bytesPerRow: 4 },
    [1, 1],
  );

  const normalSampler = device.createSampler({
    addressModeU: 'repeat', addressModeV: 'repeat',
    magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear',
  });

  // Layout for the shared normal map — passed to scatterBase via
  // `extraBindGroup` and bound at @group(2) in the render shader.
  const normalBGL = device.createBindGroupLayout({
    label: 'Rock Normal Map BGL',
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
    ],
  });

  let normalBindGroup = device.createBindGroup({
    layout: normalBGL,
    entries: [
      { binding: 0, resource: flatNormalTex.createView() },
      { binding: 1, resource: normalSampler },
    ],
    label: 'Rock Normal BG (fallback)',
  });

  // Async-load the real KTX2 normal map and swap the bind group when ready.
  (async () => {
    try {
      const tex = await loadKTX2Texture(device, ROCK_NORMAL_MAP_URL);
      if (!tex) throw new Error('loadKTX2Texture returned null');
      normalBindGroup = device.createBindGroup({
        layout: normalBGL,
        entries: [
          { binding: 0, resource: tex.createView() },
          { binding: 1, resource: normalSampler },
        ],
        label: 'Rock Normal BG',
      });
      console.log('[RockSystem] Mountain rock normal map loaded.');
    } catch (e) {
      console.warn('[RockSystem] Failed to load rock normal map, keeping flat fallback:', e);
    }
  })();

  return createScatterSystem({
    name: 'Rock',
    device, format, globalBuffer, terrainParamsBuffer,
    gridSide: ROCK_CONFIG.gridSide,
    cellSpacingKm: ROCK_CONFIG.cellSpacingKm,
    numVariants: NUM_VARIANTS,
    renderShader: shaderCode,
    shadowDepthShader: shadowDepthShaderCode,
    computeShader: rockScatterComputeShader,
    extraBindGroup: {
      layout: normalBGL,
      group: 2,
      getBindGroup: () => normalBindGroup,
    },
    generateVariants: ({ renderBGL1, sampler }) => {
      // generateRock returns a flat sub-mesh ({vb, ib, indexCount, bindGroup1})
      // not the {subMeshes:[...]} shape scatterBase expects, so wrap each.
      const variants = ROCK_CONFIG.variants.map((cfg, i) => {
        const sub = generateRock(device, renderBGL1, sampler, {
          seed: 42 + i * 7919,
          color: cfg.color,
          displacement: cfg.displacement,
          templateIdx: i,
        });
        return { subMeshes: [sub] };
      });
      console.log(`[RockSystem] ${NUM_VARIANTS} procedural rock variants generated`);
      return variants;
    },
  });
};
