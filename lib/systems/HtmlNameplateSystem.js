/**
 * HtmlNameplateSystem — avatar nameplate HUD rendered via the HTML-in-Canvas API.
 *
 * Replaces the hand-drawn 2D-canvas NameplateSystem: each entity's nameplate is
 * real HTML/CSS rasterized into a GPU texture with `copyElementImageToTexture`,
 * then drawn as an upright camera-facing billboard above the avatar's head.
 *
 * The texture is refreshed every frame (the bars animate) — same cadence as the
 * old 2D path, so the two are directly comparable for performance.
 *
 * Requires the experimental HTML-in-Canvas API (`copyElementImageToTexture`).
 * That requirement is enforced at boot by the requirements gate
 * (lib/core/requirements.js), so the API is assumed present here — there is no
 * 2D fallback by design.
 *
 * @module systems/HtmlNameplateSystem
 */

import { HUD_CONFIG } from '../config/index.js';

// Source panel size (CSS px) and the GPU texture it is rasterized into.
const DIV_W = 230, DIV_H = 130;
const TEX_SCALE = 2;
const TEX_W = DIV_W * TEX_SCALE, TEX_H = DIV_H * TEX_SCALE;

const MAX_SLOTS = 32;            // pool cap (local player + P2P peers)
const INSTANCE_BYTES = 48;       // center3 alpha1 right3 sizeW1 up3 sizeH1

// World-space billboard size — keeps the panel aspect, no stretching.
const SIZE_W = HUD_CONFIG.baseScale;
const SIZE_H = SIZE_W * DIV_H / DIV_W;
const HEIGHT_LIFT = 0.015;       // small extra lift above the head (world units)

const BADGES = ['🏆', '⭐', '🎯', '💎', '🔥', '🎖️'];

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
  center : vec3f,
  alpha  : f32,
  right  : vec3f,
  sizeW  : f32,
  up     : vec3f,
  sizeH  : f32,
}

@group(0) @binding(0) var<uniform> globals : GlobalUniforms;
@group(0) @binding(1) var<storage, read> inst : Instance;
@group(0) @binding(2) var tex : texture_2d<f32>;
@group(0) @binding(3) var texSampler : sampler;

struct VOut {
  @builtin(position) position : vec4f,
  @location(0) uv : vec2f,
  @location(1) alpha : f32,
}

@vertex
fn vs_main(@builtin(vertex_index) vi : u32) -> VOut {
  var out : VOut;

  if (inst.alpha <= 0.0) {
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
  let world = inst.center
    + inst.right * (lp.x * inst.sizeW)
    + inst.up    * (lp.y * inst.sizeH);

  out.position = globals.viewProjection * vec4f(world, 1.0);
  out.uv       = uvs[vi];
  out.alpha    = inst.alpha;
  return out;
}

@fragment
fn fs_main(in : VOut) -> @location(0) vec4f {
  let c = textureSample(tex, texSampler, in.uv);
  if (c.a < 0.01) { discard; }
  return vec4f(c.rgb, c.a * in.alpha);
}
`;

/** Inject the shared nameplate stylesheet once. */
const ensureNameplateStyle = () => {
  if (document.getElementById('ovgrid-nameplate-style')) return;
  const style = document.createElement('style');
  style.id = 'ovgrid-nameplate-style';
  style.textContent = `
    .ovg-np {
      --np-w: ${DIV_W}px;
      --np-h: ${DIV_H}px;
      box-sizing: border-box;
      position: absolute;
      left: 0;
      width: var(--np-w);
      height: var(--np-h);
      padding: 12px 13px 13px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      font-family: -apple-system, "Segoe UI", system-ui, sans-serif;
      color: #fff;
      background: linear-gradient(165deg, rgba(33,36,46,0.9), rgba(20,22,29,0.94));
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 13px;
      box-shadow: inset 0 0 18px rgba(0,0,0,0.35);
    }
    .ovg-np .np-dot {
      position: absolute;
      top: 11px; right: 12px;
      width: 11px; height: 11px;
      border-radius: 50%;
      background: #22dd44;
      box-shadow: 0 0 7px currentColor;
      color: #22dd44;
    }
    .ovg-np .np-name {
      font-size: 20px;
      font-weight: 700;
      text-align: center;
      line-height: 1.1;
      margin-top: 2px;
    }
    .ovg-np .np-status {
      font-size: 11.5px;
      color: rgba(190,196,206,0.92);
      text-align: center;
      min-height: 14px;
    }
    .ovg-np .np-badges {
      font-size: 15px;
      text-align: center;
      letter-spacing: 3px;
      min-height: 22px;
      margin-top: 1px;
    }
    .ovg-np .np-bars {
      margin-top: auto;
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    .ovg-np .np-bar {
      display: flex;
      align-items: center;
      gap: 7px;
    }
    .ovg-np .np-bar > span {
      font-size: 9px;
      font-weight: 700;
      width: 16px;
    }
    .ovg-np .np-track {
      flex: 1;
      height: 6px;
      border-radius: 3px;
      background: rgba(255,255,255,0.08);
      overflow: hidden;
    }
    .ovg-np .np-track > i {
      display: block;
      height: 100%;
      width: 0%;
      border-radius: 3px;
    }
    .ovg-np .np-hp > span { color: #88cc88; }
    .ovg-np .np-en > span { color: #88aaff; }
    .ovg-np .np-xp > span { color: #cc88dd; }
  `;
  document.head.appendChild(style);
};

/** Status text shown under the name. */
const formatState = (state) => {
  switch (state) {
    case 1: return 'Caminando';
    case 2: return 'Corriendo';
    case 3: return 'Siguiendo';
    default: return '';
  }
};

/** Status-dot colour by entity state. */
const statusColor = (state) => {
  switch (state) {
    case 1: return '#ddaa22';
    case 2: return '#dd4422';
    default: return '#22dd44';
  }
};

/** Health-bar colour ramp. */
const healthColor = (h) => (h > 0.6 ? '#22cc55' : h > 0.3 ? '#ddaa22' : '#dd3333');

/**
 * Create an HtmlNameplateSystem.
 * @param {GPUDevice} device
 * @param {GPUTextureFormat} format
 * @param {GPUBuffer} globalBuffer - Shared global uniform buffer (GlobalUniforms).
 * @returns {{ update: Function, render: Function }}
 */
export const createHtmlNameplateSystem = (device, format, globalBuffer) => {
  const canvas = document.getElementById('webgpu-canvas');

  ensureNameplateStyle();
  canvas.setAttribute('layoutsubtree', '');

  const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
  const shaderModule = device.createShaderModule({ code: shaderCode, label: 'HtmlNameplate Shader' });

  const pipeline = device.createRenderPipeline({
    label: 'HtmlNameplate Pipeline',
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
    // Depth-tested (Reverse-Z): terrain/avatars in front occlude the nameplate.
    depthStencil: { format: 'depth32float', depthWriteEnabled: false, depthCompare: 'greater' },
  });

  /** @type {Array<object>} */
  const slots = [];
  const slotByKey = new Map();
  let visible = [];

  /** Build a pooled nameplate slot (DOM element + texture + bind group). */
  const createSlot = (index) => {
    const div = document.createElement('div');
    div.className = 'ovg-np';
    div.id = `ovgrid-nameplate-${index}`;
    div.setAttribute('inert', '');
    // Stack panels vertically off-screen so they never overlap during layout.
    div.style.top = `${index * (DIV_H + 6)}px`;
    div.innerHTML = `
      <div class="np-dot"></div>
      <div class="np-name"></div>
      <div class="np-status"></div>
      <div class="np-badges"></div>
      <div class="np-bars">
        <div class="np-bar np-hp"><span>HP</span><div class="np-track"><i></i></div></div>
        <div class="np-bar np-en"><span>EN</span><div class="np-track"><i></i></div></div>
        <div class="np-bar np-xp"><span>XP</span><div class="np-track"><i></i></div></div>
      </div>
    `;
    canvas.appendChild(div);

    const texture = device.createTexture({
      size: [TEX_W, TEX_H],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
      label: `HtmlNameplate Texture ${index}`,
    });
    const instanceBuffer = device.createBuffer({
      size: INSTANCE_BYTES,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      label: `HtmlNameplate Instance ${index}`,
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

    return {
      div, texture, instanceBuffer, bindGroup,
      instanceData: new Float32Array(12),
      el: {
        dot: div.querySelector('.np-dot'),
        name: div.querySelector('.np-name'),
        status: div.querySelector('.np-status'),
        badges: div.querySelector('.np-badges'),
        hp: div.querySelector('.np-hp i'),
        en: div.querySelector('.np-en i'),
        xp: div.querySelector('.np-xp i'),
      },
    };
  };

  /** Get the slot for an entity key, lazily creating one (or null if pool full). */
  const getSlot = (key) => {
    let slot = slotByKey.get(key);
    if (slot) return slot;
    if (slots.length >= MAX_SLOTS) return null;
    slot = createSlot(slots.length);
    slots.push(slot);
    slotByKey.set(key, slot);
    return slot;
  };

  /** Refresh a slot's HTML content from the entity data. */
  const applyContent = (slot, name, status, health, energy, xp, dotColor) => {
    const e = slot.el;
    e.name.textContent = name || 'Player';
    e.status.textContent = status;
    e.dot.style.background = dotColor;
    e.dot.style.color = dotColor;

    const count = 1 + ((name || 'P').charCodeAt(0) % 6);
    let badges = '';
    for (let i = 0; i < count; i++) badges += BADGES[i % BADGES.length];
    e.badges.textContent = badges;

    e.hp.style.width = `${Math.round(Math.max(0, Math.min(1, health)) * 100)}%`;
    e.hp.style.background = healthColor(health);
    e.en.style.width = `${Math.round(Math.max(0, Math.min(1, energy)) * 100)}%`;
    e.en.style.background = '#3399ff';
    e.xp.style.width = `${Math.round(Math.max(0, Math.min(1, xp)) * 100)}%`;
    e.xp.style.background = '#aa55dd';
  };

  // Rasterize every visible slot's HTML into its texture once the panels have
  // laid out. Uses addEventListener so it coexists with the signboard's onpaint.
  canvas.addEventListener('paint', () => {
    for (const slot of visible) {
      try {
        device.queue.copyElementImageToTexture(slot.div, TEX_W, TEX_H, { texture: slot.texture });
      } catch (err) {
        console.error('[Nameplate] copyElementImageToTexture failed:', err);
      }
    }
  });

  return {
    /**
     * Place a nameplate above every entity and refresh its HTML texture.
     * @param {Array<object>} entities - Entities with absolute {x,y,z} + HUD data.
     * @param {number[]} cameraPos - Absolute camera position.
     * @param {number[]} earthCenter - Absolute planet center.
     * @returns {number} Visible nameplate count.
     */
    update(entities, cameraPos, earthCenter) {
      const time = performance.now();
      visible = [];

      for (let i = 0; i < entities.length && visible.length < MAX_SLOTS; i++) {
        const ent = entities[i];
        if (!ent || typeof ent.x !== 'number') continue;

        const dx = ent.x - cameraPos[0], dy = ent.y - cameraPos[1], dz = ent.z - cameraPos[2];
        const dist = Math.hypot(dx, dy, dz);
        if (dist > HUD_CONFIG.maxDistance) continue;

        let alpha = 1.0;
        if (dist > HUD_CONFIG.fadeStartDistance) {
          alpha = 1.0 - (dist - HUD_CONFIG.fadeStartDistance) /
            (HUD_CONFIG.fadeEndDistance - HUD_CONFIG.fadeStartDistance);
        }
        if (dist < HUD_CONFIG.minDistance) alpha *= dist / HUD_CONFIG.minDistance;
        alpha *= ent.visibility ?? 1.0;
        if (alpha <= 0.01) continue;

        const slot = getSlot(ent.name || `entity_${i}`);
        if (!slot) continue;

        // Fake animated bars — kept so the texture refreshes every frame
        // (a like-for-like performance comparison with the old 2D path).
        const phase = i * 0.7;
        const health = ent.health ?? ((Math.sin(time * (0.0008 + (i % 5) * 0.0001) + phase) + 1) / 2);
        const energy = ent.energy ?? ((Math.sin(time * (0.0012 + (i % 7) * 0.00015) + phase + 1) + 1) / 2);
        const xp = ent.xp ?? ((Math.sin(time * (0.0006 + (i % 3) * 0.0002) + phase + 2) + 1) / 2);
        applyContent(slot, ent.name, formatState(ent.state),
          health, energy, xp, statusColor(ent.state));

        // Radial "up" — keeps the nameplate upright on the planet surface.
        let ux = ent.x - earthCenter[0], uy = ent.y - earthCenter[1], uz = ent.z - earthCenter[2];
        const ul = Math.hypot(ux, uy, uz) || 1;
        ux /= ul; uy /= ul; uz /= ul;

        // Direction to camera — for a camera-facing (cylindrical) billboard.
        let tx = cameraPos[0] - ent.x, ty = cameraPos[1] - ent.y, tz = cameraPos[2] - ent.z;
        const tl = Math.hypot(tx, ty, tz) || 1;
        tx /= tl; ty /= tl; tz /= tl;

        // right = normalize(cross(up, toCamera))
        let rx = uy * tz - uz * ty;
        let ry = uz * tx - ux * tz;
        let rz = ux * ty - uy * tx;
        const rl = Math.hypot(rx, ry, rz) || 1;
        rx /= rl; ry /= rl; rz /= rl;

        // Anchor above the avatar's head, camera-relative (Floating Origin).
        const ho = HUD_CONFIG.heightOffset + HEIGHT_LIFT;
        const d = slot.instanceData;
        d[0] = ent.x + ux * ho - cameraPos[0];
        d[1] = ent.y + uy * ho - cameraPos[1];
        d[2] = ent.z + uz * ho - cameraPos[2];
        d[3] = alpha;
        d[4] = rx; d[5] = ry; d[6] = rz;
        d[7] = SIZE_W;
        d[8] = ux; d[9] = uy; d[10] = uz;
        d[11] = SIZE_H;
        device.queue.writeBuffer(slot.instanceBuffer, 0, d);

        visible.push(slot);
      }

      if (typeof canvas.requestPaint === 'function') canvas.requestPaint();
      return visible.length;
    },

    /**
     * Draw every visible nameplate billboard.
     * @param {GPURenderPassEncoder} passEncoder
     */
    render(passEncoder) {
      if (visible.length === 0) return;
      passEncoder.setPipeline(pipeline);
      for (const slot of visible) {
        passEncoder.setBindGroup(0, slot.bindGroup);
        passEncoder.draw(6, 1);
      }
    },
  };
};
