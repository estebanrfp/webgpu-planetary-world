/**
 * AvatarMarkerSystem — glowing dot billboards marking entities on the parcel map.
 *
 * Multi-instance, per-instance colour: the local player (cyan), the NPC roster
 * (yellow) and remote P2P players (orange) all appear as fixed-pixel-size glowing
 * dots in parcel-map mode. Reuses the screen-space billboard technique from
 * ParcelTooltipSystem (project anchor → fixed-pixel quad) with a single white
 * radial-glow texture tinted per instance (white-hot core + coloured halo).
 *
 * Positions are passed already in camera-relative space (Floating Origin), so the
 * shader projects them straight with the global view-projection.
 *
 * @module systems/AvatarMarkerSystem
 */

const MARKER_PX = 44;
const FIXED_ALPHA = 0.95;
const MAX_MARKERS = 128;
const FLOATS_PER_MARKER = 12;   // see Marker struct (48 bytes / 4)

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

struct Marker {
  pos   : vec3f,   // camera-relative position
  alpha : f32,
  color : vec3f,
  ndcX  : f32,
  ndcY  : f32,
  pad0  : f32,
  pad1  : f32,
  pad2  : f32,
}

@group(0) @binding(0) var<uniform> globals  : GlobalUniforms;
@group(0) @binding(1) var<storage, read> markers : array<Marker>;
@group(0) @binding(2) var tex        : texture_2d<f32>;
@group(0) @binding(3) var texSampler : sampler;

struct VOut {
  @builtin(position) position : vec4f,
  @location(0) uv    : vec2f,
  @location(1) alpha : f32,
  @location(2) color : vec3f,
}

@vertex
fn vs_main(@builtin(vertex_index) vi : u32, @builtin(instance_index) ii : u32) -> VOut {
  var out : VOut;
  let m = markers[ii];

  if (m.alpha <= 0.0) {
    out.position = vec4f(0.0, 0.0, -10.0, 1.0);
    out.alpha = 0.0;
    return out;
  }

  let clip = globals.viewProjection * vec4f(m.pos, 1.0);
  if (clip.w <= 0.0) {
    out.position = vec4f(0.0, 0.0, -10.0, 1.0);
    out.alpha = 0.0;
    return out;
  }

  var positions = array<vec2f, 6>(
    vec2f(-0.5, -0.5), vec2f(0.5, -0.5), vec2f(0.5, 0.5),
    vec2f(-0.5, -0.5), vec2f(0.5, 0.5), vec2f(-0.5, 0.5)
  );
  var uvs = array<vec2f, 6>(
    vec2f(0.0, 1.0), vec2f(1.0, 1.0), vec2f(1.0, 0.0),
    vec2f(0.0, 1.0), vec2f(1.0, 0.0), vec2f(0.0, 0.0)
  );

  let lp = positions[vi];
  var pos = clip;
  pos.x += lp.x * m.ndcX * clip.w;
  pos.y += lp.y * m.ndcY * clip.w;

  // Depth bias — render in front of terrain
  pos.z += 0.002 * clip.w;

  out.position = pos;
  out.uv       = uvs[vi];
  out.alpha    = m.alpha;
  out.color    = m.color;
  return out;
}

@fragment
fn fs_main(in : VOut) -> @location(0) vec4f {
  // Texture stores a white radial glow in its alpha; tint by the per-instance
  // colour and keep a white-hot core (sharp falloff biases the centre to white).
  let glow = textureSample(tex, texSampler, in.uv).a;
  if (glow < 0.01) { discard; }
  let core = pow(glow, 3.0);
  let rgb  = mix(in.color, vec3f(1.0), core);
  return vec4f(rgb, glow * in.alpha);
}
`;

/**
 * Render a white radial glow (white RGB, alpha falloff) to an offscreen canvas.
 * @param {CanvasRenderingContext2D} ctx
 */
function renderMarker(ctx) {
  const s = MARKER_PX;
  ctx.clearRect(0, 0, s, s);
  const cx = s / 2, cy = s / 2;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, s * 0.48);
  g.addColorStop(0, 'rgba(255, 255, 255, 1)');
  g.addColorStop(0.3, 'rgba(255, 255, 255, 0.55)');
  g.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
}

/**
 * Create an AvatarMarkerSystem (screen-space colored glowing-dot billboards).
 * @param {GPUDevice} device
 * @param {GPUTextureFormat} format
 * @param {GPUBuffer} globalBuffer
 * @returns {{ update, render, hide, resize }}
 */
export const createAvatarMarkerSystem = (device, format, globalBuffer) => {
  const canvas = document.createElement('canvas');
  canvas.width = MARKER_PX;
  canvas.height = MARKER_PX;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  renderMarker(ctx);

  const texture = device.createTexture({
    size: [MARKER_PX, MARKER_PX],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    label: 'AvatarMarker Texture',
  });

  const imgData = ctx.getImageData(0, 0, MARKER_PX, MARKER_PX);
  device.queue.writeTexture(
    { texture },
    imgData.data,
    { bytesPerRow: MARKER_PX * 4 },
    [MARKER_PX, MARKER_PX, 1],
  );

  const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });

  const instanceBuffer = device.createBuffer({
    size: MAX_MARKERS * FLOATS_PER_MARKER * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    label: 'AvatarMarker Instances',
  });

  const instanceData = new Float32Array(MAX_MARKERS * FLOATS_PER_MARKER);
  const shaderModule = device.createShaderModule({ code: shaderCode, label: 'AvatarMarker Shader' });

  const pipeline = device.createRenderPipeline({
    label: 'AvatarMarker Pipeline',
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

  let viewW = 1920;
  let viewH = 1080;

  return {
    /** @param {number} w @param {number} h */
    resize(w, h) { viewW = w; viewH = h; },

    /**
     * Upload the marker list (camera-relative positions + colours).
     * @param {Array<{x:number,y:number,z:number,r:number,g:number,b:number}>} markers
     * @returns {number} The number of markers uploaded (drawn).
     */
    update(markers) {
      const n = Math.min(markers?.length ?? 0, MAX_MARKERS);
      const ndcX = (MARKER_PX / viewW) * 2.0;
      const ndcY = (MARKER_PX / viewH) * 2.0;
      for (let i = 0; i < n; i++) {
        const m = markers[i];
        const o = i * FLOATS_PER_MARKER;
        instanceData[o] = m.x; instanceData[o + 1] = m.y; instanceData[o + 2] = m.z;
        instanceData[o + 3] = FIXED_ALPHA;
        instanceData[o + 4] = m.r; instanceData[o + 5] = m.g; instanceData[o + 6] = m.b;
        instanceData[o + 7] = ndcX; instanceData[o + 8] = ndcY;
      }
      if (n > 0) device.queue.writeBuffer(instanceBuffer, 0, instanceData, 0, n * FLOATS_PER_MARKER);
      return n;
    },

    /**
     * @param {GPURenderPassEncoder} passEncoder
     * @param {number} visibleCount
     */
    render(passEncoder, visibleCount) {
      if (visibleCount <= 0) return;
      passEncoder.setPipeline(pipeline);
      passEncoder.setBindGroup(0, bindGroup);
      passEncoder.draw(6, visibleCount);
    },

    hide() { /* no-op: visibility is driven by the count passed to render() */ },
  };
};
