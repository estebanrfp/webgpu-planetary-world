/**
 * ParcelTooltipSystem — parcel tooltip as an HTML-in-Canvas billboard.
 *
 * The tooltip is a real HTML/CSS element rasterized into a GPU texture with
 * `copyElementImageToTexture`, then drawn as a screen-aligned, fixed-pixel-size
 * billboard anchored above the parcel.
 *
 * Two modes:
 * - HOVER: compact tooltip — coords, name, owner, price; follows the hover.
 * - SELECTED: expanded tooltip — terrain preview, info and action buttons.
 *
 * @module systems/ParcelTooltipSystem
 */

const TEX_SCALE = 2;             // texture supersampling — keeps text crisp
const MAX_DISTANCE = 800;        // visibility cutoff (km), no fade
const FIXED_ALPHA = 0.96;        // tooltip opacity

const TYPE_LABELS = { 0: 'Unclaimed', 2: 'For Sale', 3: 'Auction', 4: 'For Rent', 5: 'Owned' };
const ACTION_LABELS = { 0: 'Claim Land', 2: 'Buy Now', 3: 'Place Bid', 4: 'Rent Now', 5: 'View' };

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
  ndcSize  : vec2f,
  _pad     : vec2f,
}

@group(0) @binding(0) var<uniform> globals  : GlobalUniforms;
@group(0) @binding(1) var<storage, read> inst : Instance;
@group(0) @binding(2) var tex        : texture_2d<f32>;
@group(0) @binding(3) var texSampler : sampler;

struct VOut {
  @builtin(position) position : vec4f,
  @location(0) uv    : vec2f,
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

  let clip = globals.viewProjection * vec4f(inst.worldPos, 1.0);
  if (clip.w <= 0.0) {
    out.position = vec4f(0.0, 0.0, -10.0, 1.0);
    out.alpha = 0.0;
    return out;
  }

  var positions = array<vec2f, 6>(
    vec2f(-0.5, 0.0), vec2f(0.5, 0.0), vec2f(0.5, 1.0),
    vec2f(-0.5, 0.0), vec2f(0.5, 1.0), vec2f(-0.5, 1.0)
  );
  var uvs = array<vec2f, 6>(
    vec2f(0.0, 1.0), vec2f(1.0, 1.0), vec2f(1.0, 0.0),
    vec2f(0.0, 1.0), vec2f(1.0, 0.0), vec2f(0.0, 0.0)
  );

  let lp = positions[vi];
  // Screen-space offset (multiply by clipW to cancel the perspective divide).
  // The quad sits ABOVE the anchor, with a small Y gap so it clears the parcel.
  var pos = clip;
  pos.x += lp.x * inst.ndcSize.x * clip.w;
  pos.y += (lp.y + 0.08) * inst.ndcSize.y * clip.w;
  pos.z += 0.001 * clip.w;          // depth bias toward camera (reverse-Z)

  out.position = pos;
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

/** Inject the tooltip stylesheet once. */
const ensureTooltipStyle = () => {
  if (document.getElementById('ovgrid-parcel-tooltip-style')) return;
  const style = document.createElement('style');
  style.id = 'ovgrid-parcel-tooltip-style';
  style.textContent = `
    #parcel-tooltip {
      position: absolute;
      left: 0;
      top: 700px;
      box-sizing: border-box;
      padding: 14px 16px;
      font-family: -apple-system, "Segoe UI", system-ui, sans-serif;
      color: #fff;
      background: linear-gradient(165deg, rgba(18,19,27,0.97), rgba(10,10,15,0.98));
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 14px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.6);
    }
    #parcel-tooltip.hover { width: 300px; }
    #parcel-tooltip.selected { width: 432px; }
    #parcel-tooltip .pt-head {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 10px;
    }
    #parcel-tooltip .pt-coords {
      font-size: 13px;
      color: rgba(190,194,204,0.95);
    }
    #parcel-tooltip .pt-badge {
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.4px;
      color: #4ff3ff;
    }
    #parcel-tooltip[data-type="2"] .pt-badge { color: #4ade80; }
    #parcel-tooltip[data-type="3"] .pt-badge { color: #fbbf24; }
    #parcel-tooltip[data-type="4"] .pt-badge { color: #f472b6; }
    #parcel-tooltip[data-type="5"] .pt-badge { color: #a78bfa; }
    #parcel-tooltip .pt-name {
      font-size: 19px;
      font-weight: 700;
      margin-top: 6px;
      line-height: 1.2;
    }
    #parcel-tooltip .pt-sub {
      font-size: 13px;
      color: rgba(165,168,178,0.9);
      margin-top: 3px;
    }
    #parcel-tooltip .pt-price {
      font-size: 18px;
      font-weight: 700;
      color: #66bb6a;
      margin-top: 6px;
    }
    #parcel-tooltip .pt-price.free { color: #4ff3ff; }
    #parcel-tooltip .pt-body {
      display: flex;
      gap: 14px;
      margin-top: 10px;
    }
    #parcel-tooltip .pt-preview {
      width: 116px;
      height: 116px;
      flex: none;
      border-radius: 10px;
      object-fit: cover;
      background: linear-gradient(135deg, #1a1a24, #2a2a34);
      border: 1px solid rgba(255,255,255,0.08);
    }
    #parcel-tooltip .pt-info { flex: 1; min-width: 0; }
    #parcel-tooltip .pt-buttons {
      display: flex;
      gap: 8px;
      margin-top: 12px;
    }
    #parcel-tooltip .pt-btn {
      flex: 1;
      padding: 9px 0;
      font-size: 14px;
      font-weight: 700;
      color: rgba(210,212,220,0.95);
      background: rgba(255,255,255,0.08);
      border: none;
      border-radius: 9px;
      cursor: pointer;
    }
    #parcel-tooltip .pt-btn.primary { color: #fff; background: #2ecc71; }
    #parcel-tooltip .pt-btn.primary.owned { background: #3498db; }
    #parcel-tooltip .pt-btn.confirm { background: #e67e22; color: #fff; }
    #parcel-tooltip .pt-btn.burn { color: #fff; background: #e74c3c; }
    #parcel-tooltip .pt-btn.tp { color: #fff; background: #06b6d4; }
  `;
  document.head.appendChild(style);
};

/** Shorten a 0x… address for display. */
const shortAddr = (a) => (a && a.length > 20 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

/** Build the compact hover-mode tooltip markup. */
const hoverHTML = (parcel) => {
  const badge = TYPE_LABELS[parcel.type] ?? '';
  const name = parcel.name ?? parcel.regionName ?? 'Unnamed';
  return `
    <div class="pt-head">
      <span class="pt-coords">F${parcel.face}:${parcel.localX},${parcel.localY}</span>
      ${badge ? `<span class="pt-badge">${badge}</span>` : ''}
    </div>
    <div class="pt-name">${name}</div>
    ${parcel.owner ? `<div class="pt-sub">Owner: ${shortAddr(parcel.owner)}</div>` : ''}
    ${parcel.price ? `<div class="pt-price">${parcel.price} OVG</div>` : ''}
  `;
};

/** Build the expanded selected-mode tooltip markup (preview + info + buttons). */
const selectedHTML = (parcel, confirmState) => {
  const isEmpty = parcel.type === 0 || parcel.action === 'claim';
  const badge = TYPE_LABELS[parcel.type] ?? '';
  const name = isEmpty ? 'Unclaimed Land' : (parcel.name ?? parcel.regionName ?? 'Unnamed');
  const priceText = isEmpty ? 'Free' : (parcel.price ? `${parcel.price} OVG` : '—');

  let buttons = '<button class="pt-btn" data-action="close">Close</button>';
  buttons += '<button class="pt-btn tp" data-action="tp">TP</button>';
  const primaryLabel = confirmState === 'confirm' ? 'Confirm' : (ACTION_LABELS[parcel.type] ?? 'Claim Land');
  const primaryCls = confirmState === 'confirm' ? 'confirm' : (isEmpty ? '' : 'owned');
  buttons += `<button class="pt-btn primary ${primaryCls}" data-action="primary">${primaryLabel}</button>`;
  if (parcel.type === 5) {
    const burnLabel = confirmState === 'burn-confirm' ? 'Confirm' : 'Burn';
    const burnCls = confirmState === 'burn-confirm' ? 'confirm' : 'burn';
    buttons += `<button class="pt-btn ${burnCls}" data-action="burn">${burnLabel}</button>`;
  }

  return `
    <div class="pt-head">
      <span class="pt-coords">F${parcel.face}:${parcel.localX},${parcel.localY}</span>
      ${badge ? `<span class="pt-badge">${badge}</span>` : ''}
    </div>
    <div class="pt-body">
      <img class="pt-preview" alt="">
      <div class="pt-info">
        <div class="pt-name">${name}</div>
        ${parcel.owner && !isEmpty ? `<div class="pt-sub">Owner: ${shortAddr(parcel.owner)}</div>` : ''}
        ${parcel.regionName ? `<div class="pt-sub">Region: ${parcel.regionName}</div>` : ''}
        <div class="pt-price ${isEmpty ? 'free' : ''}">${priceText}</div>
      </div>
    </div>
    <div class="pt-buttons">${buttons}</div>
  `;
};

/**
 * Create a ParcelTooltipSystem.
 * @param {GPUDevice} device
 * @param {GPUTextureFormat} format
 * @param {GPUBuffer} globalBuffer - Shared global uniform buffer.
 * @returns {object} The tooltip system (update, select, hitTest, …).
 */
export const createParcelTooltipSystem = (device, format, globalBuffer) => {
  const webgpuCanvas = document.getElementById('webgpu-canvas');

  ensureTooltipStyle();
  webgpuCanvas.setAttribute('layoutsubtree', '');
  const el = document.createElement('div');
  el.id = 'parcel-tooltip';
  el.className = 'hover';
  webgpuCanvas.appendChild(el);

  const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
  const shaderModule = device.createShaderModule({ code: shaderCode, label: 'ParcelTooltip Shader' });
  const pipeline = device.createRenderPipeline({
    label: 'ParcelTooltip Pipeline',
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

  const instanceBuffer = device.createBuffer({
    size: 32,                       // worldPos3 alpha1 ndcSize2 pad2
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    label: 'ParcelTooltip Instance',
  });
  const instanceData = new Float32Array(8);

  let texture = null, bindGroup = null;
  let texW = 0, texH = 0, cssW = 0, cssH = 0;
  let mode = 'hover';
  let confirmState = null;
  let currentWorldPos = null;       // camera-relative, for hit testing
  let lastParcelKey = '';
  let visible = false;

  /** (Re)create the GPU texture to match the tooltip element's current size. */
  const syncTexture = () => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    cssW = Math.round(r.width);
    cssH = Math.round(r.height);
    const wantW = cssW * TEX_SCALE, wantH = cssH * TEX_SCALE;
    if (wantW !== texW || wantH !== texH) {
      texW = wantW; texH = wantH;
      texture = device.createTexture({
        size: [texW, texH],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
        label: 'ParcelTooltip Texture',
      });
      bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: globalBuffer } },
          { binding: 1, resource: { buffer: instanceBuffer } },
          { binding: 2, resource: texture.createView() },
          { binding: 3, resource: sampler },
        ],
      });
    }
    return true;
  };

  /** Distance + horizon culling; writes the billboard instance. Returns 0 or 1. */
  const updateInstance = (worldPos, cameraPos, earthCenter) => {
    const hideInstance = () => {
      instanceData[3] = 0;
      device.queue.writeBuffer(instanceBuffer, 0, instanceData);
      return 0;
    };
    if (!worldPos || cssW < 1) return hideInstance();

    const dx = worldPos[0] - cameraPos[0];
    const dy = worldPos[1] - cameraPos[1];
    const dz = worldPos[2] - cameraPos[2];
    if (Math.sqrt(dx * dx + dy * dy + dz * dz) > MAX_DISTANCE) return hideInstance();

    // Horizon culling — drop the tooltip when the parcel is over the horizon.
    const camDx = cameraPos[0] - earthCenter[0];
    const camDy = cameraPos[1] - earthCenter[1];
    const camDz = cameraPos[2] - earthCenter[2];
    const camDist = Math.sqrt(camDx * camDx + camDy * camDy + camDz * camDz) || 1;
    const pDx = worldPos[0] - earthCenter[0];
    const pDy = worldPos[1] - earthCenter[1];
    const pDz = worldPos[2] - earthCenter[2];
    const pDist = Math.sqrt(pDx * pDx + pDy * pDy + pDz * pDz) || 1;
    const dotHP = (camDx * pDx + camDy * pDy + camDz * pDz) / (camDist * pDist);
    if (dotHP < pDist / camDist) return hideInstance();

    // Screen-space size from the canvas CSS dimensions — keeps the billboard a
    // fixed CSS-pixel size (so the texture maps 1:1 and hit-testing aligns).
    const vw = webgpuCanvas.clientWidth || 1;
    const vh = webgpuCanvas.clientHeight || 1;
    instanceData[0] = dx; instanceData[1] = dy; instanceData[2] = dz;
    instanceData[3] = FIXED_ALPHA;
    instanceData[4] = (cssW / vw) * 2.0;
    instanceData[5] = (cssH / vh) * 2.0;
    device.queue.writeBuffer(instanceBuffer, 0, instanceData);
    currentWorldPos = [dx, dy, dz];
    return 1;
  };

  // Rasterize the tooltip element into its texture once it has laid out.
  webgpuCanvas.addEventListener('paint', () => {
    if (!visible || !texture) return;
    try {
      device.queue.copyElementImageToTexture(el, texW, texH, { texture });
    } catch (err) {
      console.error('[ParcelTooltip] copyElementImageToTexture failed:', err);
    }
  });

  return {
    /** Kept for API compatibility — the viewport is read live from the canvas. */
    resize() {},

    /**
     * Hover-mode update. Re-renders the tooltip only when the parcel changes;
     * in selected mode it just re-anchors the (pinned) tooltip.
     * @returns {number} 0 or 1 (visible instance count).
     */
    update(parcel, worldPos, cameraPos, earthCenter) {
      if (!parcel || !worldPos) { visible = false; return updateInstance(null); }

      if (mode === 'hover') {
        const key = `hover:${parcel.face}:${parcel.localX},${parcel.localY}`;
        if (key !== lastParcelKey) {
          lastParcelKey = key;
          el.className = 'hover';
          el.dataset.type = String(parcel.type ?? 0);
          el.innerHTML = hoverHTML(parcel);
        }
      }
      if (!syncTexture()) { visible = false; return updateInstance(null); }

      const count = updateInstance(worldPos, cameraPos, earthCenter);
      visible = count === 1;
      if (visible && typeof webgpuCanvas.requestPaint === 'function') webgpuCanvas.requestPaint();
      return count;
    },

    /**
     * Selected-mode update — expanded tooltip with preview and action buttons.
     * @param {object} previewBaker - Optional terrain-preview baker.
     * @returns {number} 0 or 1.
     */
    select(parcel, worldPos, cameraPos, earthCenter, previewBaker) {
      if (!parcel || !worldPos) return 0;

      mode = 'selected';
      confirmState = null;
      lastParcelKey = `selected:${parcel.face}:${parcel.localX},${parcel.localY}`;
      el.className = 'selected';
      el.dataset.type = String(parcel.type ?? 0);
      el.innerHTML = selectedHTML(parcel, null);

      if (previewBaker) {
        previewBaker.getPreview(parcel, (dataUrl) => {
          const img = el.querySelector('.pt-preview');
          if (img && dataUrl) img.src = dataUrl;
        });
      }

      if (!syncTexture()) { visible = false; return 0; }
      const count = updateInstance(worldPos, cameraPos, earthCenter);
      visible = count === 1;
      if (visible && typeof webgpuCanvas.requestPaint === 'function') webgpuCanvas.requestPaint();
      return count;
    },

    /**
     * Hit-test a screen click against the selected-mode buttons.
     * @returns {string|null} The button's `data-action`, or null.
     */
    hitTest(screenX, screenY, canvasEl, viewProjection) {
      if (mode !== 'selected' || !currentWorldPos) return null;

      const [wx, wy, wz] = currentWorldPos;
      const m = viewProjection;
      const clipX = m[0] * wx + m[4] * wy + m[8] * wz + m[12];
      const clipY = m[1] * wx + m[5] * wy + m[9] * wz + m[13];
      const clipW = m[3] * wx + m[7] * wy + m[11] * wz + m[15];
      if (clipW <= 0) return null;

      const rect = canvasEl.getBoundingClientRect();
      const anchorX = rect.left + (clipX / clipW * 0.5 + 0.5) * rect.width;
      const anchorY = rect.top + (-clipY / clipW * 0.5 + 0.5) * rect.height;

      // The billboard is screen-aligned and fixed-pixel-size; it sits above the
      // anchor (shader: Y from 0.08·H to 1.08·H). Map the click to element px.
      const left = anchorX - cssW / 2;
      const top = anchorY - cssH * 1.08;
      const localX = screenX - left;
      const localY = screenY - top;
      if (localX < 0 || localX > cssW || localY < 0 || localY > cssH) return null;

      const elRect = el.getBoundingClientRect();
      for (const btn of el.querySelectorAll('.pt-btn')) {
        const b = btn.getBoundingClientRect();
        const bx = b.left - elRect.left, by = b.top - elRect.top;
        if (localX >= bx && localX <= bx + b.width && localY >= by && localY <= by + b.height) {
          return btn.dataset.action;
        }
      }
      return null;
    },

    /** Set the two-step-confirm state and rebuild the selected tooltip. */
    setConfirmState(state, parcel) {
      confirmState = state;
      if (mode === 'selected' && parcel) {
        const img = el.querySelector('.pt-preview');
        const src = img ? img.src : '';
        el.innerHTML = selectedHTML(parcel, confirmState);
        if (src) { const ni = el.querySelector('.pt-preview'); if (ni) ni.src = src; }
        if (typeof webgpuCanvas.requestPaint === 'function') webgpuCanvas.requestPaint();
      }
    },

    /** Draw the tooltip billboard. */
    render(passEncoder, visibleCount) {
      if (visibleCount === 0 || !bindGroup) return;
      passEncoder.setPipeline(pipeline);
      passEncoder.setBindGroup(0, bindGroup);
      passEncoder.draw(6, 1);
    },

    /** Hide the tooltip and reset to hover mode. */
    hide() {
      visible = false;
      mode = 'hover';
      confirmState = null;
      currentWorldPos = null;
      lastParcelKey = '';
      instanceData[3] = 0;
      device.queue.writeBuffer(instanceBuffer, 0, instanceData);
    },

    /** @returns {'hover'|'selected'} Current mode. */
    get mode() { return mode; },
    /** @returns {string|null} Current confirm state. */
    get confirmState() { return confirmState; },
  };
};
