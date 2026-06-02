/**
 * TreeSystem — GPU-instanced procedural tree meshes.
 *
 * Thin wrapper around `createScatterSystem` plus a custom
 * `getNearbyCylinders()` that mirrors the GPU scatter math on the CPU
 * so the physics layer can know which trees the avatar may collide
 * with (5×5 cells around the camera, ±2 cells radius).
 *
 * @module systems/TreeSystem
 */

import { PLANET_RADIUS, EARTH_CENTER, TREE_CONFIG, BIOME_LATITUDE } from '../config/index.js';
import { treeScatterComputeShader } from '../shaders/treeScatter.compute.wgsl.js';
import { generateTree, TREE_TEMPLATES_META } from '../procedural/ProceduralTreeGenerator.js';
import { hash33 } from './hash.js';
import { createScatterSystem } from './scatterBase.js';

const TEMPLATE_NAME_TO_IDX = new Map(TREE_TEMPLATES_META.map((t, i) => [t.name, i]));

const GRID_SIDE = TREE_CONFIG.gridSide;
const CELL_SPACING_KM = TREE_CONFIG.cellSpacingKm;
const CELL_SIZE_RAD = CELL_SPACING_KM / PLANET_RADIUS;
const NUM_VARIANTS = TREE_CONFIG.variants.length;

// Weighted CDF for variant selection (same as compute shader)
const _freqs = TREE_CONFIG.variants.map((v) => v.freq ?? 1);
const _totalFreq = _freqs.reduce((a, b) => a + b, 0);
const _cdf = _freqs.reduce((acc, fr) => { acc.push((acc.at(-1) ?? 0) + fr / _totalFreq); return acc; }, []);

const smoothstep = (e0, e1, x) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Default trunk cylinder for trees without _collider nodes (normalized model space) */
const DEFAULT_COLLIDER = { radius: 0.12, height: 0.7 };
const f = Math.fround;

// ---------- Render Shader (instanced mesh + lighting + snow on canopy) ----

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
  _pad     : f32,
}

@group(0) @binding(0) var<uniform> globals   : GlobalUniforms;
@group(0) @binding(1) var<storage, read> instances : array<Instance>;
@group(0) @binding(2) var<uniform> variantId : u32;

@group(1) @binding(0) var treeTex     : texture_2d<f32>;
@group(1) @binding(1) var treeSamp    : sampler;

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
  let worldVertex = inst.worldPos + tangentU * scaled.x + up * scaled.y + tangentV * scaled.z;
  let worldNormal = normalize(tangentU * localNormal.x + up * localNormal.y + tangentV * localNormal.z);

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

  let albedo = textureSample(treeTex, treeSamp, in.uv);

  let sunDir = normalize(globals.sunDirection.xyz);
  let n = normalize(in.normal);
  let nDotL = max(dot(n, sunDir), 0.0);
  let light = 0.35 + 0.65 * nDotL;

  var litColor = albedo.rgb * light;

  // Snow only on upward-facing canopy faces.
  let snowIntensity = globals.rainParams.z;
  if (snowIntensity > 0.01) {
    let alignment = dot(n, normalize(in.up));
    let horizontalSnow = max(alignment, 0.0);
    let snowCoverage = clamp(snowIntensity * snowIntensity * horizontalSnow * 1.3, 0.0, 0.92);
    let snowColor = vec3f(0.94, 0.96, 1.0) * light;
    litColor = mix(litColor, snowColor, snowCoverage);
  }

  return vec4f(litColor, 1.0);
}
`;

// ---------- CSM Shadow Depth Shader -----------------------------------------

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

// ---------- Factory ---------------------------------------------------------

/**
 * Create a TreeSystem with instanced procedural meshes.
 * @param {GPUDevice} device
 * @param {GPUTextureFormat} format
 * @param {GPUBuffer} globalBuffer
 * @param {GPUBuffer} terrainParamsBuffer
 */
export const createTreeSystem = (device, format, globalBuffer, terrainParamsBuffer) => {
  /** @type {(import('./scatterBase.js').ScatterVariant|null)[]} */
  let variantsRef = [];
  const reusableCylinders = [];

  const base = createScatterSystem({
    name: 'Tree',
    device, format, globalBuffer, terrainParamsBuffer,
    gridSide: GRID_SIDE,
    cellSpacingKm: CELL_SPACING_KM,
    numVariants: NUM_VARIANTS,
    renderShader: shaderCode,
    shadowDepthShader: shadowDepthShaderCode,
    computeShader: treeScatterComputeShader,
    generateVariants: ({ renderBGL1, sampler }) => {
      const variants = new Array(NUM_VARIANTS).fill(null);
      let totalTris = 0;
      for (let idx = 0; idx < NUM_VARIANTS; idx++) {
        try {
          const variant = TREE_CONFIG.variants[idx];
          const tplIdx = TEMPLATE_NAME_TO_IDX.get(variant.template);
          if (tplIdx === undefined) throw new Error(`Unknown template '${variant.template}'`);
          const tree = generateTree(device, renderBGL1, sampler, {
            seed: variant.seed ?? idx * 4099 + 17,
            templateIdx: tplIdx,
            sizeScale: variant.sizeScale ?? 1.0,
            yOffset:   variant.yOffset   ?? 0.0,
          });
          variants[idx] = tree;
          for (const sm of tree.subMeshes) totalTris += sm.indexCount / 3;
        } catch (e) {
          console.error(`[TreeSystem] variant ${idx} failed:`, e);
        }
      }
      variantsRef = variants;
      console.log(`[TreeSystem] ${variants.filter(Boolean).length}/${NUM_VARIANTS} procedural tree variants ready (${Math.round(totalTris)} tris)`);
      return variants;
    },
  });

  return {
    ...base,

    /**
     * Compute collision cylinders for trees near the avatar. Replicates
     * the GPU scatter grid math on the CPU for a ±2-cell window (5×5)
     * around the player so the physics layer can resolve collisions.
     * @param {number[]} cameraPos    - [x,y,z] in the same frame as the scatter shader
     * @param {Function} getHeightAt  - (x,y,z) => heightKm | null from PhysicsSystem GPU grid
     * @returns {Array<{x:number,y:number,z:number,radius:number,height:number,nx:number,ny:number,nz:number}>}
     */
    getNearbyCylinders(cameraPos, getHeightAt) {
      reusableCylinders.length = 0;
      if (!getHeightAt || variantsRef.filter(Boolean).length === 0) return reusableCylinders;

      const cpx = cameraPos[0], cpy = cameraPos[1], cpz = cameraPos[2];
      const len = Math.sqrt(cpx * cpx + cpy * cpy + cpz * cpz);
      if (len < 0.001) return reusableCylinders;

      const camNx = cpx / len, camNy = cpy / len, camNz = cpz / len;
      const camTheta = Math.atan2(camNz, camNx);
      const camPhi = Math.asin(Math.max(-1, Math.min(1, camNy)));

      const cs = CELL_SIZE_RAD;
      const snapTheta = Math.floor(camTheta / cs) * cs;
      const snapPhi = Math.floor(camPhi / cs) * cs;
      const halfGrid = GRID_SIDE * 0.5;

      const avatarIx = Math.round((camTheta - snapTheta) / cs + halfGrid - 0.5);
      const avatarIy = Math.round((camPhi - snapPhi) / cs + halfGrid - 0.5);

      const HALF_RANGE = 2;

      for (let dy = -HALF_RANGE; dy <= HALF_RANGE; dy++) {
        for (let dx = -HALF_RANGE; dx <= HALF_RANGE; dx++) {
          const ix = avatarIx + dx;
          const iy = avatarIy + dy;
          if (ix < 0 || ix >= GRID_SIDE || iy < 0 || iy >= GRID_SIDE) continue;

          const cellTheta = snapTheta + (ix - halfGrid + 0.5) * cs;
          const cellPhi = snapPhi + (iy - halfGrid + 0.5) * cs;

          const seedX = f(f(cellTheta) * f(1000));
          const seedY = f(f(cellPhi) * f(1000));
          const seedZ = f(893);

          const [jx, jy, jz] = hash33(seedX, seedY, seedZ);
          const jitterX = jx * 2 - 1;
          const jitterY = jy * 2 - 1;
          const jitterZ = jz * 2 - 1;

          const jTheta = cellTheta + jitterX * cs * 0.4;
          const jPhi = cellPhi + jitterY * cs * 0.4;

          const cosPhi = Math.cos(jPhi);
          let tnx = Math.cos(jTheta) * cosPhi;
          let tny = Math.sin(jPhi);
          let tnz = Math.sin(jTheta) * cosPhi;
          const tLen = Math.sqrt(tnx * tnx + tny * tny + tnz * tnz);
          tnx /= tLen; tny /= tLen; tnz /= tLen;

          const absX = tnx * PLANET_RADIUS + EARTH_CENTER[0];
          const absY = tny * PLANET_RADIUS + EARTH_CENTER[1];
          const absZ = tnz * PLANET_RADIUS + EARTH_CENTER[2];
          const heightKm = getHeightAt(absX, absY, absZ);
          if (heightKm === null) continue;

          if (heightKm < 0.05 || heightKm > 6.0) continue;

          const lat = Math.abs(tny);
          const treeProb = smoothstep(BIOME_LATITUDE.tropicalEnd - 0.05, BIOME_LATITUDE.temperateStart, lat);
          const polarFade = 1 - 0.6 * smoothstep(BIOME_LATITUDE.temperateEnd, BIOME_LATITUDE.polarStart, lat);
          const finalProb = treeProb * polarFade;

          const roll = (jitterZ + 1) * 0.5;
          if (roll > 0.45 * finalProb) continue;

          const [vh] = hash33(f(seedX + f(333)), f(seedY + f(666)), seedZ);
          let variantIdx = 0;
          for (let v = 0; v < _cdf.length - 1; v++) {
            if (vh >= _cdf[v]) variantIdx = v + 1;
          }

          const variant = variantsRef[variantIdx];
          if (!variant) continue;
          const collider = variant.collider ?? DEFAULT_COLLIDER;

          const [sh] = hash33(f(seedX + f(137)), f(seedY + f(311)), seedZ);
          const sizeScale = 0.6 + sh * 0.8;

          const worldSizeX = 0.060; // 60 m wide per model unit
          const worldSizeY = 0.085; // 85 m tall per model unit

          const R = PLANET_RADIUS + heightKm;
          const baseX = tnx * R + EARTH_CENTER[0];
          const baseY = tny * R + EARTH_CENTER[1];
          const baseZ = tnz * R + EARTH_CENTER[2];

          reusableCylinders.push({
            x: baseX, y: baseY, z: baseZ,
            radius: collider.radius * worldSizeX * sizeScale,
            height: collider.height * worldSizeY * sizeScale,
            nx: tnx, ny: tny, nz: tnz,
          });
        }
      }

      return reusableCylinders;
    },
  };
};
