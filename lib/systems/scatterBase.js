/**
 * Scatter base — shared factory for GPU-instanced scatter systems.
 *
 * Every scatter system (PlantSystem, TreeSystem, PalmSystem, RockSystem)
 * follows the same pipeline: compute shader places instances on a grid,
 * render pipeline draws each variant as instanced mesh, shadow pipeline
 * casts CSM shadows. Around 80 % of each system was identical boilerplate
 * (instance/uniform/variant buffer setup, compute pipeline, BGL0/BGL1,
 * shadow pipelines per cascade, lazy bind groups, update/dispatch loop).
 *
 * This module owns that boilerplate. A concrete system only provides:
 *   • its three WGSL strings (render / shadow / compute)
 *   • a `generateVariants` callback returning sub-mesh arrays
 *   • optional `extraBindGroup` for shared resources (e.g. the rock
 *     normal map at @group(2))
 *
 * The result is a system in ~150 lines instead of ~600.
 *
 * @module systems/scatterBase
 */

import { PLANET_RADIUS, SHADOW_CONFIG } from '../config/index.js';

const BYTES_PER_INSTANCE = 32;        // pos+alpha + size+biome+rotation = 32B
const VERTEX_ARRAY_STRIDE = 32;       // pos(12) + normal(12) + uv(8) interleaved
const VERTEX_ATTRIBUTES = [
  { shaderLocation: 0, offset: 0,  format: 'float32x3' },
  { shaderLocation: 1, offset: 12, format: 'float32x3' },
  { shaderLocation: 2, offset: 24, format: 'float32x2' },
];

/**
 * Build the cell-stride radian from the planet radius.
 * @param {number} cellSpacingKm
 * @returns {number}
 */
const cellSizeRad = (cellSpacingKm) => cellSpacingKm / PLANET_RADIUS;

/**
 * @typedef {Object} ScatterSubMesh
 * @property {GPUBuffer} vb         - interleaved vertex buffer (pos+normal+uv, 32 B/vertex)
 * @property {GPUBuffer} ib         - index buffer (uint32)
 * @property {number}   indexCount
 * @property {GPUBindGroup} bindGroup1 - per-sub-mesh texture bind group
 */

/**
 * @typedef {Object} ScatterVariant
 * @property {ScatterSubMesh[]} subMeshes
 */

/**
 * @typedef {Object} ScatterExtraGroup
 * @property {GPUBindGroupLayout} layout   - layout declared at the matching @group in the shader
 * @property {number} group                - bind group index (typically 2)
 * @property {() => GPUBindGroup} getBindGroup - returns the bind group to use at render time
 */

/**
 * Build all GPU resources for a scatter system.
 *
 * @param {Object} options
 * @param {string} options.name              - "Plant", "Tree", "Rock"... used for labels
 * @param {GPUDevice} options.device
 * @param {GPUTextureFormat} options.format
 * @param {GPUBuffer} options.globalBuffer
 * @param {GPUBuffer} options.terrainParamsBuffer
 * @param {number} options.gridSide
 * @param {number} options.cellSpacingKm
 * @param {number} options.numVariants
 * @param {string} options.renderShader        - WGSL render module
 * @param {string} options.shadowDepthShader   - WGSL shadow module (vs_cascade0..3)
 * @param {string} options.computeShader       - WGSL compute module (entryPoint = "main")
 * @param {GPUBindGroupLayoutEntry[]} [options.bgl1Entries] - per-sub-mesh entries (default: texture + sampler)
 * @param {(opts: { renderBGL1: GPUBindGroupLayout, sampler: GPUSampler }) =>
 *         (ScatterVariant|null)[] | Promise<(ScatterVariant|null)[]>}
 *         options.generateVariants
 * @param {ScatterExtraGroup} [options.extraBindGroup] - optional shared resource at @group(N)
 * @returns {Object} system instance with update / dispatchCompute / render / renderShadowDepth / hide
 */
export const createScatterSystem = ({
  name,
  device,
  format,
  globalBuffer,
  terrainParamsBuffer,
  gridSide,
  cellSpacingKm,
  numVariants,
  renderShader,
  shadowDepthShader,
  computeShader,
  bgl1Entries,
  generateVariants,
  extraBindGroup = null,
}) => {
  const MAX_DOTS = gridSide * gridSide;
  const CELL_SIZE_RAD = cellSizeRad(cellSpacingKm);

  // --- Instance buffer (compute writes, render reads) ---------------------
  const instanceBuffer = device.createBuffer({
    size: MAX_DOTS * BYTES_PER_INSTANCE,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    label: `${name} Instances`,
  });

  // --- Compute uniform (32 bytes: cameraPos + gridCount + ndcSize + cellSize) ---
  const uniformBuffer = device.createBuffer({
    size: 32,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    label: `${name} Uniforms`,
  });
  const uniformData = new ArrayBuffer(32);
  const uniformF32 = new Float32Array(uniformData);
  const uniformU32 = new Uint32Array(uniformData);

  // --- Per-variant uniform buffers (4 B each, written once) ---------------
  const variantBuffers = [];
  for (let v = 0; v < numVariants; v++) {
    const buf = device.createBuffer({
      size: 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: `${name} Variant ${v}`,
    });
    device.queue.writeBuffer(buf, 0, new Uint32Array([v]));
    variantBuffers.push(buf);
  }

  // --- Compute pipeline ---------------------------------------------------
  const computeModule = device.createShaderModule({ code: computeShader, label: `${name} Scatter Compute` });
  const computeBGL = device.createBindGroupLayout({
    label: `${name} Compute BGL`,
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
    ],
  });
  const computePipeline = device.createComputePipeline({
    label: `${name} Scatter Pipeline`,
    layout: device.createPipelineLayout({ bindGroupLayouts: [computeBGL] }),
    compute: { module: computeModule, entryPoint: 'main' },
  });
  const computeBindGroup = device.createBindGroup({
    layout: computeBGL,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: terrainParamsBuffer } },
      { binding: 2, resource: { buffer: instanceBuffer } },
    ],
    label: `${name} Compute BG`,
  });

  // --- Render pipeline ----------------------------------------------------
  const renderModule = device.createShaderModule({ code: renderShader, label: `${name} Render` });

  const renderBGL0 = device.createBindGroupLayout({
    label: `${name} Render BGL0`,
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
    ],
  });

  const renderBGL1 = device.createBindGroupLayout({
    label: `${name} Render BGL1`,
    entries: bgl1Entries ?? [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
    ],
  });

  const renderBGLs = [renderBGL0, renderBGL1];
  if (extraBindGroup) {
    if (extraBindGroup.group !== renderBGLs.length) {
      throw new Error(`[${name}] extraBindGroup.group must be ${renderBGLs.length} (current next slot)`);
    }
    renderBGLs.push(extraBindGroup.layout);
  }

  const renderPipeline = device.createRenderPipeline({
    label: `${name} Render Pipeline`,
    layout: device.createPipelineLayout({ bindGroupLayouts: renderBGLs }),
    vertex: {
      module: renderModule,
      entryPoint: 'vs_main',
      buffers: [{ arrayStride: VERTEX_ARRAY_STRIDE, stepMode: 'vertex', attributes: VERTEX_ATTRIBUTES }],
    },
    fragment: { module: renderModule, entryPoint: 'fs_main', targets: [{ format }] },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'greater' },
  });

  // Pre-create per-variant render bind groups for group(0)
  const variantBindGroups0 = variantBuffers.map((buf, v) =>
    device.createBindGroup({
      layout: renderBGL0,
      entries: [
        { binding: 0, resource: { buffer: globalBuffer } },
        { binding: 1, resource: { buffer: instanceBuffer } },
        { binding: 2, resource: { buffer: buf } },
      ],
      label: `${name} Render BG0 v${v}`,
    })
  );

  const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear' });

  // --- CSM Shadow Depth pipelines (one per cascade) -----------------------
  const shadowDepthModule = device.createShaderModule({ code: shadowDepthShader, label: `${name} Shadow Depth` });
  const shadowDepthBGL = device.createBindGroupLayout({
    label: `${name} Shadow Depth BGL`,
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
    ],
  });
  const shadowDepthPipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [shadowDepthBGL] });
  const scatterMaxCascade = SHADOW_CONFIG.SCATTER_SHADOW_MAX_CASCADE ?? 1;
  const cascadeEntries = ['vs_cascade0', 'vs_cascade1', 'vs_cascade2', 'vs_cascade3'];

  /** @type {GPURenderPipeline[]} */
  const shadowDepthPipelines = cascadeEntries.slice(0, scatterMaxCascade + 1).map((entry, i) =>
    device.createRenderPipeline({
      label: `${name} Shadow Depth Pipeline C${i}`,
      layout: shadowDepthPipelineLayout,
      vertex: {
        module: shadowDepthModule,
        entryPoint: entry,
        buffers: [{ arrayStride: VERTEX_ARRAY_STRIDE, stepMode: 'vertex', attributes: VERTEX_ATTRIBUTES }],
      },
      fragment: { module: shadowDepthModule, entryPoint: 'fs_shadow_depth', targets: [] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less' },
    })
  );

  /** @type {(GPUBindGroup[]|null)[]} lazy per-cascade per-variant bind groups */
  const shadowBindGroups = new Array(scatterMaxCascade + 1).fill(null);

  // --- Variant generation (sync or async) ---------------------------------
  /** @type {(ScatterVariant|null)[]} */
  let variants = new Array(numVariants).fill(null);
  let meshesReady = false;

  const variantsResult = generateVariants({ renderBGL1, sampler });
  const assignVariants = (vs) => {
    variants = vs;
    meshesReady = variants.filter(Boolean).length > 0;
  };
  if (variantsResult && typeof variantsResult.then === 'function') {
    variantsResult.then(assignVariants).catch((e) => {
      console.error(`[${name}] generateVariants failed:`, e);
    });
  } else {
    assignVariants(variantsResult);
  }

  // --- Frame state --------------------------------------------------------
  let active = false;
  let loggedRender = false;
  const DISPATCH_X = Math.ceil(gridSide / 16);
  const DISPATCH_Y = Math.ceil(gridSide / 16);

  return {
    resize() {},

    /**
     * Upload camera position to the compute uniform; returns the dispatch
     * count for the caller (always MAX_DOTS once meshes are ready).
     */
    update(_visibleQuads, cameraPos) {
      if (!meshesReady) return 0;
      uniformF32[0] = cameraPos[0];
      uniformF32[1] = cameraPos[1];
      uniformF32[2] = cameraPos[2];
      uniformU32[3] = gridSide;
      uniformF32[4] = 1.0;
      uniformF32[5] = 1.0;
      uniformF32[6] = CELL_SIZE_RAD;
      uniformF32[7] = 0;
      device.queue.writeBuffer(uniformBuffer, 0, uniformData);
      active = true;
      return MAX_DOTS;
    },

    /** Run the scatter compute pass. */
    dispatchCompute(commandEncoder) {
      if (!active) return;
      const pass = commandEncoder.beginComputePass({ label: `${name} Scatter` });
      pass.setPipeline(computePipeline);
      pass.setBindGroup(0, computeBindGroup);
      pass.dispatchWorkgroups(DISPATCH_X, DISPATCH_Y, 1);
      pass.end();
    },

    /** Render shadow depth into the given CSM cascade. */
    renderShadowDepth(pass, count, shadowUniformBuffer, cascadeIndex) {
      if (!count || !meshesReady || cascadeIndex > scatterMaxCascade) return;
      if (!shadowBindGroups[cascadeIndex]) {
        shadowBindGroups[cascadeIndex] = variantBuffers.map((buf) =>
          device.createBindGroup({
            layout: shadowDepthBGL,
            entries: [
              { binding: 0, resource: { buffer: shadowUniformBuffer } },
              { binding: 1, resource: { buffer: instanceBuffer } },
              { binding: 2, resource: { buffer: buf } },
            ],
            label: `${name} Shadow Depth BG C${cascadeIndex}`,
          })
        );
      }
      pass.setPipeline(shadowDepthPipelines[cascadeIndex]);
      for (let v = 0; v < numVariants; v++) {
        const variant = variants[v];
        if (!variant) continue;
        pass.setBindGroup(0, shadowBindGroups[cascadeIndex][v]);
        for (const sub of variant.subMeshes) {
          pass.setVertexBuffer(0, sub.vb);
          pass.setIndexBuffer(sub.ib, 'uint32');
          pass.drawIndexed(sub.indexCount, count);
        }
      }
    },

    /** Render instanced meshes (one drawIndexed per sub-mesh per variant). */
    render(pass, count) {
      if (!count || !meshesReady) return;
      if (!loggedRender) {
        console.log(`[${name}] Rendering ${count} instances, ${variants.filter(Boolean).length} variants ready`);
        loggedRender = true;
      }
      pass.setPipeline(renderPipeline);
      if (extraBindGroup) {
        pass.setBindGroup(extraBindGroup.group, extraBindGroup.getBindGroup());
      }
      for (let v = 0; v < numVariants; v++) {
        const variant = variants[v];
        if (!variant) continue;
        pass.setBindGroup(0, variantBindGroups0[v]);
        for (const sub of variant.subMeshes) {
          pass.setBindGroup(1, sub.bindGroup1);
          pass.setVertexBuffer(0, sub.vb);
          pass.setIndexBuffer(sub.ib, 'uint32');
          pass.drawIndexed(sub.indexCount, count);
        }
      }
    },

    hide() { active = false; },

    /** Plants/trees/palms/rocks don't collide with the player by default. */
    getNearbyCylinders() { return []; },
  };
};
