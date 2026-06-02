/**
 * ParcelLabelSystem — Screen-space instanced billboard for filtered parcel labels.
 *
 * Hybrid: NameplateSystem's multi-instance pattern (texture_2d_array + instanced draw)
 * + ParcelTooltipSystem's screen-space positioning (fixed pixel size).
 *
 * Shows compact colored labels above ALL parcels matching the active filter.
 *
 * @module systems/ParcelLabelSystem
 */

const CANVAS_W = 200;
const CANVAS_H = 56;
const MAX_INSTANCES = 256;
const MAX_DISTANCE = 600; // km — distance culling
const FIXED_ALPHA = 0.85;

const TYPE_COLORS = {
  2: '#4ade80', // sale → green
  3: '#fbbf24', // auction → yellow
  4: '#f472b6', // rent → pink
  5: '#a78bfa', // owned → purple
};

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

struct LabelInstance {
  worldPos : vec3f,
  alpha    : f32,
  ndcSize  : vec2f,
  texIdx   : f32,
  _pad     : f32,
}

@group(0) @binding(0) var<uniform> globals  : GlobalUniforms;
@group(0) @binding(1) var<storage, read> instances : array<LabelInstance>;
@group(0) @binding(2) var texArray   : texture_2d_array<f32>;
@group(0) @binding(3) var texSampler : sampler;

struct VOut {
  @builtin(position) position : vec4f,
  @location(0) uv    : vec2f,
  @location(1) alpha : f32,
  @location(2) @interpolate(flat) texIdx : u32,
}

@vertex
fn vs_main(
  @builtin(vertex_index) vi : u32,
  @builtin(instance_index) instanceIdx : u32
) -> VOut {
  var out : VOut;
  let inst = instances[instanceIdx];

  if (inst.alpha <= 0.0) {
    out.position = vec4f(0.0, 0.0, -10.0, 1.0);
    out.alpha = 0.0;
    return out;
  }

  // Project anchor to clip space
  let clip = globals.viewProjection * vec4f(inst.worldPos, 1.0);

  // Behind camera
  if (clip.w <= 0.0) {
    out.position = vec4f(0.0, 0.0, -10.0, 1.0);
    out.alpha = 0.0;
    return out;
  }

  // Quad centered horizontally, sitting above anchor
  var positions = array<vec2f, 6>(
    vec2f(-0.5, 0.0), vec2f(0.5, 0.0), vec2f(0.5, 1.0),
    vec2f(-0.5, 0.0), vec2f(0.5, 1.0), vec2f(-0.5, 1.0)
  );
  var uvs = array<vec2f, 6>(
    vec2f(0.0, 1.0), vec2f(1.0, 1.0), vec2f(1.0, 0.0),
    vec2f(0.0, 1.0), vec2f(1.0, 0.0), vec2f(0.0, 0.0)
  );

  let lp = positions[vi];

  // Screen-space offset (multiply by clip.w to cancel perspective divide)
  var pos = clip;
  pos.x += lp.x * inst.ndcSize.x * clip.w;
  pos.y += (lp.y + 0.04) * inst.ndcSize.y * clip.w;

  // Depth bias: push toward camera (reverse-Z: +z = closer)
  pos.z += 0.0005 * clip.w;

  out.position = pos;
  out.uv       = uvs[vi];
  out.alpha    = inst.alpha;
  out.texIdx   = u32(inst.texIdx);
  return out;
}

@fragment
fn fs_main(in : VOut) -> @location(0) vec4f {
  let c = textureSample(texArray, texSampler, in.uv, in.texIdx);
  if (c.a < 0.01) { discard; }
  return vec4f(c.rgb, c.a * in.alpha);
}
`;

/**
 * Render a compact parcel label to an offscreen canvas.
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} parcel - { face, localX, localY, name, type }
 */
const renderLabelToCanvas = (ctx, parcel) => {
  const w = CANVAS_W, h = CANVAS_H;
  ctx.clearRect(0, 0, w, h);

  const bgColor = TYPE_COLORS[parcel.type] ?? '#4ff3ff';
  const m = 4;
  const r = 10;

  // Rounded rect background
  ctx.beginPath();
  ctx.roundRect(m, m, w - m * 2, h - m * 2, r);
  ctx.fillStyle = bgColor;
  ctx.globalAlpha = 0.85;
  ctx.fill();
  ctx.globalAlpha = 1.0;

  // Subtle border
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Text
  const label = parcel.name ?? `F${parcel.face}:${parcel.localX},${parcel.localY}`;
  const display = label.length > 18 ? label.slice(0, 16) + '…' : label;

  ctx.font = 'bold 20px Arial, Helvetica, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 3;
  ctx.fillText(display, w / 2, h / 2);
  ctx.shadowBlur = 0;
};

/**
 * Create a ParcelLabelSystem (screen-space instanced billboards).
 * @param {GPUDevice} device
 * @param {GPUTextureFormat} format
 * @param {GPUBuffer} globalBuffer
 * @returns {{ update, render, hide, resize }}
 */
export const createParcelLabelSystem = (device, format, globalBuffer) => {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  const texture = device.createTexture({
    size: [CANVAS_W, CANVAS_H, MAX_INSTANCES],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    label: 'ParcelLabel TextureArray',
  });

  const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });

  // Instance: worldPos(3f) + alpha(1f) + ndcSize(2f) + texIdx(1f) + pad(1f) = 32 bytes
  const instanceBuffer = device.createBuffer({
    size: MAX_INSTANCES * 32,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    label: 'ParcelLabel Instance Buffer',
  });

  const instanceData = new Float32Array(MAX_INSTANCES * 8);
  const shaderModule = device.createShaderModule({ code: shaderCode, label: 'ParcelLabel Shader' });

  const pipeline = device.createRenderPipeline({
    label: 'ParcelLabel Pipeline',
    layout: 'auto',
    vertex: { module: shaderModule, entryPoint: 'vs_main' },
    fragment: {
      module: shaderModule,
      entryPoint: 'fs_main',
      targets: [{
        format,
        blend: {
          color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
          alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
        },
      }],
    },
    primitive: { topology: 'triangle-list' },
    depthStencil: { format: 'depth32float', depthWriteEnabled: false, depthCompare: 'greater' },
  });

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: globalBuffer } },
      { binding: 1, resource: { buffer: instanceBuffer } },
      { binding: 2, resource: texture.createView() },
      { binding: 3, resource: sampler },
    ],
  });

  // Track which parcels have textures rendered (cache key → texIdx)
  const texCache = new Map();
  let nextTexIdx = 0;
  let lastCacheKey = '';
  let viewW = 1920;
  let viewH = 1080;

  return {
    /**
     * Update viewport dimensions for NDC calculations.
     * @param {number} w - Canvas width in pixels
     * @param {number} h - Canvas height in pixels
     */
    resize(w, h) { viewW = w; viewH = h; },

    /**
     * Update labels for filtered parcels.
     * @param {object[]} parcels - Filtered parcel objects (face, localX, localY, name, type)
     * @param {number[]} cameraPos - Absolute camera position [x,y,z]
     * @param {number[]} earthCenter - Absolute earth center [x,y,z]
     * @param {Function} parcelToWorldFn - (face, lx, ly) => [x, y, z] absolute position
     * @returns {number} Visible instance count
     */
    update(parcels, cameraPos, earthCenter, parcelToWorldFn) {
      if (!parcels?.length) return 0;

      // Build cache key to detect parcel set changes
      const cacheKey = parcels.length + ':' + (parcels[0]?.face ?? '') + ':' + (parcels[parcels.length - 1]?.localX ?? '');
      const texturesChanged = cacheKey !== lastCacheKey;
      if (texturesChanged) {
        texCache.clear();
        nextTexIdx = 0;
        lastCacheKey = cacheKey;
      }

      const ndcW = (CANVAS_W / viewW) * 2.0;
      const ndcH = (CANVAS_H / viewH) * 2.0;
      let visibleCount = 0;

      // Precompute camera-to-center vector (constant for all parcels)
      const camDx = cameraPos[0] - earthCenter[0];
      const camDy = cameraPos[1] - earthCenter[1];
      const camDz = cameraPos[2] - earthCenter[2];
      const camDist = Math.sqrt(camDx * camDx + camDy * camDy + camDz * camDz);

      for (let i = 0; i < parcels.length && visibleCount < MAX_INSTANCES; i++) {
        const p = parcels[i];
        const worldPos = parcelToWorldFn(p.face, p.localX, p.localY);
        if (!worldPos) continue;

        // Distance culling
        const dx = worldPos[0] - cameraPos[0];
        const dy = worldPos[1] - cameraPos[1];
        const dz = worldPos[2] - cameraPos[2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist > MAX_DISTANCE) continue;

        // Horizon culling — skip parcels behind the planet curvature
        const pDx = worldPos[0] - earthCenter[0];
        const pDy = worldPos[1] - earthCenter[1];
        const pDz = worldPos[2] - earthCenter[2];
        const pDist = Math.sqrt(pDx * pDx + pDy * pDy + pDz * pDz);
        const dot = (camDx * pDx + camDy * pDy + camDz * pDz) / (camDist * pDist);
        if (dot < pDist / camDist) continue;

        // Get or create texture for this parcel
        const pKey = `${p.face}:${p.localX},${p.localY}`;
        let texIdx = texCache.get(pKey);
        if (texIdx === undefined) {
          texIdx = nextTexIdx++;
          if (texIdx >= MAX_INSTANCES) break;
          texCache.set(pKey, texIdx);

          // Render label to canvas and upload
          renderLabelToCanvas(ctx, p);
          const imgData = ctx.getImageData(0, 0, CANVAS_W, CANVAS_H);
          device.queue.writeTexture(
            { texture, origin: [0, 0, texIdx] },
            imgData.data,
            { bytesPerRow: CANVAS_W * 4 },
            [CANVAS_W, CANVAS_H, 1],
          );
        }

        // Camera-relative position (Floating Origin)
        const offset = visibleCount * 8;
        instanceData[offset + 0] = worldPos[0] - cameraPos[0];
        instanceData[offset + 1] = worldPos[1] - cameraPos[1];
        instanceData[offset + 2] = worldPos[2] - cameraPos[2];
        instanceData[offset + 3] = FIXED_ALPHA;
        instanceData[offset + 4] = ndcW;
        instanceData[offset + 5] = ndcH;
        instanceData[offset + 6] = texIdx;
        instanceData[offset + 7] = 0; // padding

        visibleCount++;
      }

      if (visibleCount > 0) {
        device.queue.writeBuffer(instanceBuffer, 0, instanceData.subarray(0, visibleCount * 8));
      }

      return visibleCount;
    },

    /**
     * Render label billboards.
     * @param {GPURenderPassEncoder} passEncoder
     * @param {number} visibleCount
     */
    render(passEncoder, visibleCount) {
      if (visibleCount === 0) return;
      passEncoder.setPipeline(pipeline);
      passEncoder.setBindGroup(0, bindGroup);
      passEncoder.draw(6, visibleCount);
    },

    /** Hide all labels (clear count externally, invalidate cache) */
    hide() {
      lastCacheKey = '';
      texCache.clear();
      nextTexIdx = 0;
    },
  };
};
