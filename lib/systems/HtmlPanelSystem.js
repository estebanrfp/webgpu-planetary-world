/**
 * HtmlPanelSystem — in-world HTML-in-Canvas control panels.
 *
 * A manager for any number of DOM config panels rendered inside the 3D world:
 * each real panel element is re-parented into the WebGPU canvas (`layoutsubtree`),
 * rasterized into a GPU texture with `copyElementImageToTexture`, and drawn as an
 * upright, camera-facing billboard anchored beside the player. Open panels are
 * staggered sideways so they do not overlap.
 *
 * The HTML-in-Canvas API routes no events to 3D-placed elements, so interaction
 * is manual: pointer input is raycast against the billboard quad, mapped to
 * panel-local coordinates, hit-tested against the live control rects, and
 * replayed as synthetic DOM events on the real controls. Controls are detected
 * generically by the shared markup (`.slider-row`, `.checkbox-label`, buttons),
 * so the system works for any `.config-popup-panel`-style panel.
 *
 * Relies on the experimental HTML-in-Canvas API (`copyElementImageToTexture`).
 * The requirements gate (lib/core/requirements.js) enforces it at boot, so the
 * API is assumed present here, not detected per-call.
 *
 * @module systems/HtmlPanelSystem
 */

const TEX_SCALE = 2;                 // texture supersampling — keeps text crisp

// World-space placement (planetary units, same scale as HUD_CONFIG).
const PANEL_PX_TO_WORLD = 0.09 / 350; // CSS px → world units (a ~350px panel ≈ 0.09 wide)
const LATERAL_OFFSET = 0.12;         // first panel's sideways gap from the player
const LATERAL_STEP = 0.11;           // extra sideways gap per additional open panel
const HEIGHT_OFFSET = 0.03;          // panel bottom-edge height above the player's feet
const CAMERA_PANEL_DAMP = 0.13;      // camera-anchored panel inertia (lerp per frame)
const PANEL_EYE_HEIGHT = 0.06;       // camera-panel centre height above the player's feet
// Front-of-camera placement: a panel is pushed out far enough that its size
// fills PANEL_FRAME_FILL of the tighter screen axis. HALF_TAN_FOVY = tan(50°/2),
// matching the camera's vertical field of view.
const PANEL_FRAME_FILL = 0.80;
const PANEL_HALF_TAN_FOVY = 0.4663;
// Fly-in: a freshly opened panel spawns this many times farther than its
// resting distance, then eases forward into place via CAMERA_PANEL_DAMP.
const PANEL_SPAWN_FACTOR = 2.2;

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

/** Inject the in-world panel stylesheet once (keeps styling out of JS). */
const ensureStyle = () => {
  if (document.getElementById('ovgrid-html-panel-style')) return;
  const style = document.createElement('style');
  style.id = 'ovgrid-html-panel-style';
  // `!important` so the class wins over the panel's own base CSS and any
  // inline `display:none` — the panel lays out as a fully-visible block
  // inside the canvas subtree instead of a hidden overlay. Width is left
  // untouched so each panel keeps its natural size.
  style.textContent = `
    .ovg-inworld-panel {
      display: block !important;
      position: absolute !important;
      left: 0 !important;
      top: 0 !important;
      right: auto !important;
      bottom: auto !important;
      height: auto !important;
      max-height: none !important;
      overflow: visible !important;
      opacity: 1 !important;
      visibility: visible !important;
      pointer-events: auto !important;
      transform: none !important;
    }
  `;
  document.head.appendChild(style);
};

/**
 * Perspective-correct inverse mapping: find the quad UV (0..1, top-left
 * origin) whose projection lands on NDC (nx,ny). Corners are clip-space
 * [X,Y,W] (pre-divide), ordered TL,TR,BR,BL.
 *
 * The screen position of a quad point is `clip.xy / clip.w`, and clip is
 * bilinear in (u,v); so `clipX - nx·clipW` and `clipY - ny·clipW` are both
 * bilinear and vanish exactly at the hit. Solving the two bilinear equations
 * accounts for perspective — affine barycentrics do not, and miss at angles.
 * @returns {{u:number,v:number}|null} UV inside the quad, or null if outside.
 */
const solveUV = (nx, ny, tl, tr, br, bl) => {
  const f0 = tl[0] - nx * tl[2], f1 = tr[0] - nx * tr[2];
  const f2 = br[0] - nx * br[2], f3 = bl[0] - nx * bl[2];
  const g0 = tl[1] - ny * tl[2], g1 = tr[1] - ny * tr[2];
  const g2 = br[1] - ny * br[2], g3 = bl[1] - ny * bl[2];
  // H(u,v) = A + B·u + C·v + D·u·v   (corners TL,TR,BR,BL → uv 00,10,11,01)
  const Af = f0, Bf = f1 - f0, Cf = f3 - f0, Df = f0 - f1 + f2 - f3;
  const Ag = g0, Bg = g1 - g0, Cg = g3 - g0, Dg = g0 - g1 + g2 - g3;
  // Eliminate v → quadratic in u.
  const qa = Bg * Df - Dg * Bf;
  const qb = Ag * Df + Bg * Cf - Cg * Bf - Dg * Af;
  const qc = Ag * Cf - Cg * Af;
  const roots = [];
  if (Math.abs(qa) < 1e-9) {
    if (Math.abs(qb) > 1e-12) roots.push(-qc / qb);
  } else {
    const disc = qb * qb - 4 * qa * qc;
    if (disc < 0) return null;
    const sq = Math.sqrt(disc);
    roots.push((-qb + sq) / (2 * qa), (-qb - sq) / (2 * qa));
  }
  const EPS = 1e-3;
  for (const u of roots) {
    if (u < -EPS || u > 1 + EPS) continue;
    const denom = Cf + Df * u;
    if (Math.abs(denom) < 1e-12) continue;
    const v = -(Af + Bf * u) / denom;
    if (v < -EPS || v > 1 + EPS) continue;
    return { u: Math.min(1, Math.max(0, u)), v: Math.min(1, Math.max(0, v)) };
  }
  return null;
};

/** Detect a panel's interactive controls live (handles dynamically-added DOM). */
const detectControls = (element) => {
  const list = [];
  const buttons = [...element.querySelectorAll('button')];
  // Host-panel close button — by id (…close…) or glyph; never the picker's.
  const closeBtn = buttons.find((b) => !b.classList.contains('cp-close')
    && (/close/i.test(b.id) || ['×', '✕', '✖'].includes(b.textContent.trim())));
  if (closeBtn) list.push({ type: 'close', hit: closeBtn });
  const cpClose = element.querySelector('button.cp-close');
  if (cpClose) list.push({ type: 'colorclose', hit: cpClose });
  element.querySelectorAll('.checkbox-label').forEach((label) => {
    const input = label.querySelector('input[type="checkbox"]');
    if (input) list.push({ type: 'checkbox', hit: label, input });
  });
  const seenSliders = new Set();
  element.querySelectorAll('.slider-row').forEach((row) => {
    const input = row.querySelector('input[type="range"]');
    if (input) { list.push({ type: 'slider', hit: row, input }); seenSliders.add(input); }
  });
  // Range inputs outside a .slider-row (e.g. inside a .color-picker-row).
  element.querySelectorAll('input[type="range"]').forEach((input) => {
    if (seenSliders.has(input)) return;
    list.push({ type: 'slider', hit: input.closest('.slider-container') || input, input });
  });
  element.querySelectorAll('input[type="color"]').forEach((input) => {
    list.push({ type: 'color', hit: input, input });
  });
  for (const b of buttons) {
    if (b !== closeBtn && !b.classList.contains('cp-close')) {
      list.push({ type: 'button', hit: b });
    }
  }
  // Colour-popover controls take precedence — they overlay the panel.
  list.sort((a, b) =>
    (b.hit.closest('.cp-popover') ? 1 : 0) - (a.hit.closest('.cp-popover') ? 1 : 0));
  return list;
};

/**
 * Create the HtmlPanelSystem.
 * @param {GPUDevice} device
 * @param {GPUTextureFormat} format
 * @param {GPUBuffer} globalBuffer - Shared global uniform buffer (GlobalUniforms).
 * @returns {{ toggle:Function, update:Function, render:Function, destroy:Function }}
 */
export const createHtmlPanelSystem = (device, format, globalBuffer) => {
  const canvas = document.getElementById('webgpu-canvas');

  const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
  const shaderModule = device.createShaderModule({ code: shaderCode, label: 'HtmlPanel Shader' });

  const pipeline = device.createRenderPipeline({
    label: 'HtmlPanel Pipeline',
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
    // Depth-tested (Reverse-Z): avatars and terrain in front occlude the panel.
    depthStencil: { format: 'depth32float', depthWriteEnabled: false, depthCompare: 'greater' },
  });

  /** @type {Map<string, object>} panel records keyed by element id */
  const panels = new Map();
  const vp = new Float32Array(16);     // cached camera-relative view-projection
  let _cameraUp = null;                // camera up axis (set per-frame by update)
  let _cameraForward = null;           // camera forward axis (set per-frame by update)
  let drag = null;                     // active slider drag descriptor
  let colorPicker = null;              // lazily-loaded colorPicker.js module
  let colorPickerPending = false;      // in-flight colorPicker import

  /** Project a camera-relative point to clip space [X,Y,W]; null if behind. */
  const projectClip = (x, y, z) => {
    const m = vp;
    const w = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (w <= 1e-6) return null;
    return [
      m[0] * x + m[4] * y + m[8] * z + m[12],
      m[1] * x + m[5] * y + m[9] * z + m[13],
      w,
    ];
  };

  /**
   * Re-parent a panel into the canvas subtree, ready to render in-world.
   * @returns {object|null} The panel record, or null if the element is missing.
   */
  const makeRecord = (element) => {
    if (!element) return null;
    ensureStyle();
    element.classList.add('ovg-inworld-panel');
    element.removeAttribute('inert');
    canvas.setAttribute('layoutsubtree', '');
    canvas.appendChild(element);

    return {
      id: element.id || `panel-${panels.size}`,
      element,
      texture: null, bindGroup: null,
      instanceBuffer: device.createBuffer({
        size: 48,                      // center3 alpha1 right3 sizeW1 up3 sizeH1
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        label: 'HtmlPanel Instance',
      }),
      instanceData: new Float32Array(12),
      texW: 0, texH: 0, cssW: 0, cssH: 0, sizeW: 0, sizeH: 0,
      active: false, visible: false, needsAnchor: false, lateralIndex: 0,
      anchored: false, anchorFromEarth: null, anchorUp: null,
      curCenter: null, curRight: null, curUp: null, painted: false,
      mode: 'world', camCenter: null,   // 'camera' mode trails the camera with inertia
    };
  };

  /** Allocate a panel's GPU texture + bind group once its size is known. */
  const createTexture = (rec, w, h) => {
    rec.texW = w; rec.texH = h;
    rec.texture = device.createTexture({
      size: [w, h],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
      label: `HtmlPanel Texture (${rec.id})`,
    });
    rec.bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: globalBuffer } },
        { binding: 1, resource: { buffer: rec.instanceBuffer } },
        { binding: 2, resource: rec.texture.createView() },
        { binding: 3, resource: sampler },
      ],
    });
  };

  /** Capture a panel's world anchor from the player's current position. */
  const captureAnchor = (rec, avatarSphere, ec) => {
    const px = avatarSphere[0] - ec[0];
    const py = avatarSphere[1] - ec[1];
    const pz = avatarSphere[2] - ec[2];
    const pl = Math.hypot(px, py, pz) || 1;
    const ux = px / pl, uy = py / pl, uz = pz / pl;            // radial up

    // Direction player → camera (camera sits at the origin in this frame).
    let tx = -avatarSphere[0], ty = -avatarSphere[1], tz = -avatarSphere[2];
    const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;

    // right = normalize(cross(up, toCamera)) — places the panel to the side.
    let rx = uy * tz - uz * ty, ry = uz * tx - ux * tz, rz = ux * ty - uy * tx;
    const rl = Math.hypot(rx, ry, rz) || 1; rx /= rl; ry /= rl; rz /= rl;

    const lateral = LATERAL_OFFSET + rec.lateralIndex * LATERAL_STEP;
    // Anchor by the panel's BOTTOM edge — a tall panel grows upward and never
    // sinks into the terrain, whatever its height.
    const height = HEIGHT_OFFSET + rec.sizeH / 2;
    rec.anchorFromEarth = [
      px + rx * lateral + ux * height,
      py + ry * lateral + uy * height,
      pz + rz * lateral + uz * height,
    ];
    rec.anchorUp = [ux, uy, uz];
    rec.anchored = true;
  };

  /**
   * Raycast a client point against a panel's billboard quad.
   * @returns {{u:number,v:number}|null} Panel UV (0..1, top-left origin) or null.
   */
  const hitTestPanel = (rec, clientX, clientY, canvasRect) => {
    // curCenter is set once the panel is placed — true for both anchor modes
    // ('world' sets `anchored`, 'camera' does not, so don't gate on that).
    if (!rec.curCenter) return null;
    if (canvasRect.width < 1 || canvasRect.height < 1) return null;
    const nx = ((clientX - canvasRect.left) / canvasRect.width) * 2 - 1;
    const ny = 1 - ((clientY - canvasRect.top) / canvasRect.height) * 2;

    const c = rec.curCenter, r = rec.curRight, u = rec.curUp;
    const sw = rec.sizeW, sh = rec.sizeH;
    const corner = (lx, ly) => projectClip(
      c[0] + r[0] * lx * sw + u[0] * ly * sh,
      c[1] + r[1] * lx * sw + u[1] * ly * sh,
      c[2] + r[2] * lx * sw + u[2] * ly * sh,
    );
    const tl = corner(-0.5, 0.5), tr = corner(0.5, 0.5);
    const br = corner(0.5, -0.5), bl = corner(-0.5, -0.5);
    if (!tl || !tr || !br || !bl) return null;
    return solveUV(nx, ny, tl, tr, br, bl);
  };

  /** Resolve which interactive control sits under a panel UV point. */
  const controlAt = (rec, u, v, panelRect) => {
    const px = u * panelRect.width, py = v * panelRect.height;
    for (const c of detectControls(rec.element)) {
      const r = c.hit.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;       // hidden (e.g. inactive tab)
      const x0 = r.left - panelRect.left, y0 = r.top - panelRect.top;
      if (px >= x0 && px <= x0 + r.width && py >= y0 && py <= y0 + r.height) {
        return { ...c, panelX: px, panelY: py };
      }
    }
    return null;
  };

  /** Drive a range input from a panel-local X, then fire `input` for the wiring. */
  const applySlider = (ctrl, panelX, panelRect) => {
    const sr = ctrl.input.getBoundingClientRect();
    const x0 = sr.left - panelRect.left;
    const w = sr.width || 1;
    const t = Math.max(0, Math.min(1, (panelX - x0) / w));
    const min = parseFloat(ctrl.input.min) || 0;
    const max = parseFloat(ctrl.input.max);
    const step = parseFloat(ctrl.input.step) || 1;
    let val = min + t * (max - min);
    val = Math.round(val / step) * step;
    val = Math.max(min, Math.min(max, val));
    ctrl.input.value = String(val);
    ctrl.input.dispatchEvent(new Event('input', { bubbles: true }));
  };

  /** Show/hide a panel. */
  const setActive = (rec, on) => {
    rec.active = on;
    if (!on) {
      rec.visible = false;
      if (drag && drag.rec === rec) drag = null;
      // Close the colour popover too, if it lives in this panel.
      if (colorPicker && rec.element.querySelector('.cp-popover')) {
        colorPicker.detachColorPicker();
      }
    } else if (typeof canvas.requestPaint === 'function') {
      canvas.requestPaint();
    }
  };

  /** Get or create the panel record for an element. */
  const getRecord = (element) => {
    const key = element.id || element;
    let rec = panels.get(key);
    if (!rec) {
      rec = makeRecord(element);
      if (rec) panels.set(key, rec);
    }
    return rec;
  };

  /** Show a panel: assign the lowest free lateral slot, request a fresh anchor. */
  const activate = (rec) => {
    const used = new Set([...panels.values()].filter((r) => r.active).map((r) => r.lateralIndex));
    let slot = 0;
    while (used.has(slot)) slot++;
    rec.lateralIndex = slot;
    rec.needsAnchor = true;
    // Clear the eased centre so the panel re-plays its fly-in animation
    // (spawns farther back and glides forward into place) on every open.
    rec.camCenter = null;
    setActive(rec, true);
  };

  /** Attach the shared colour picker inside a panel, bound to a colour <input>. */
  const openColorPicker = (rec, input) => {
    if (colorPicker) { colorPicker.attachColorPicker(rec.element, input); return; }
    if (colorPickerPending) return;
    colorPickerPending = true;
    import('../ui/colorPicker.js').then((mod) => {
      colorPicker = mod;
      colorPickerPending = false;
      mod.attachColorPicker(rec.element, input);
    }).catch((e) => {
      colorPickerPending = false;
      console.error('[HtmlPanel] Failed to load colorPicker:', e);
    });
  };

  /** Per-frame work for one active panel: size, anchor, billboard instance. */
  const updateRec = (rec, avatarSphere, ec) => {
    // Lazily size the GPU texture once the panel has a layout box.
    if (!rec.texture) {
      const r = rec.element.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      rec.cssW = Math.round(r.width);
      rec.cssH = Math.round(r.height);
      rec.sizeW = rec.cssW * PANEL_PX_TO_WORLD;
      rec.sizeH = rec.cssH * PANEL_PX_TO_WORLD;
      createTexture(rec, rec.cssW * TEX_SCALE, rec.cssH * TEX_SCALE);
    }

    // Unified placement for every panel: centred directly in front of the
    // camera, at a distance scaled to the panel's own size so any panel —
    // current or future — frames the same way. The camera sits at the origin
    // in this floating-origin frame, so the panel centre is simply
    // cameraForward * panelDistance.
    //
    // panelDistance is the larger of the distance needed to fit the panel
    // height in the vertical FOV and the distance needed to fit its width in
    // the horizontal FOV — whichever axis is the tighter fit wins, so the panel
    // never spills off-screen regardless of its aspect ratio.
    if (!_cameraForward || !_cameraUp) { rec.visible = false; return; }
    const aspect = (canvas.width / Math.max(1, canvas.height)) || 1.777;
    const distH = (rec.sizeH * 0.5) / (PANEL_FRAME_FILL * PANEL_HALF_TAN_FOVY);
    const distW = (rec.sizeW * 0.5) / (PANEL_FRAME_FILL * PANEL_HALF_TAN_FOVY * aspect);
    const panelDist = Math.max(distH, distW);
    const tx0 = _cameraForward[0] * panelDist;
    const ty0 = _cameraForward[1] * panelDist;
    const tz0 = _cameraForward[2] * panelDist;
    // Fly-in: the panel spawns farther back (PANEL_SPAWN_FACTOR × the target
    // distance) and then eases forward into place. The same lerp also makes it
    // trail the camera smoothly when you turn.
    if (!rec.camCenter) {
      rec.camCenter = [tx0 * PANEL_SPAWN_FACTOR, ty0 * PANEL_SPAWN_FACTOR, tz0 * PANEL_SPAWN_FACTOR];
    }
    rec.camCenter[0] += (tx0 - rec.camCenter[0]) * CAMERA_PANEL_DAMP;
    rec.camCenter[1] += (ty0 - rec.camCenter[1]) * CAMERA_PANEL_DAMP;
    rec.camCenter[2] += (tz0 - rec.camCenter[2]) * CAMERA_PANEL_DAMP;
    let cx = rec.camCenter[0], cy = rec.camCenter[1], cz = rec.camCenter[2];
    // Camera up keeps the panel's vertical edge perfectly aligned to screen.
    let up = _cameraUp;

    // Camera-facing right axis (Floating Origin: the camera is the origin).
    let tx = -cx, ty = -cy, tz = -cz;
    const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
    let rx = up[1] * tz - up[2] * ty;
    let ry = up[2] * tx - up[0] * tz;
    let rz = up[0] * ty - up[1] * tx;
    const rl = Math.hypot(rx, ry, rz) || 1; rx /= rl; ry /= rl; rz /= rl;

    rec.curCenter = [cx, cy, cz];
    rec.curRight = [rx, ry, rz];
    rec.curUp = up;

    const d = rec.instanceData;
    d[0] = cx; d[1] = cy; d[2] = cz; d[3] = 1.0;
    d[4] = rx; d[5] = ry; d[6] = rz; d[7] = rec.sizeW;
    d[8] = up[0]; d[9] = up[1]; d[10] = up[2]; d[11] = rec.sizeH;
    device.queue.writeBuffer(rec.instanceBuffer, 0, d);

    rec.visible = true;
  };

  // Pointer input — window-capture so the panel wins over the canvas/game
  // listeners when actually hit, and stays transparent otherwise.
  const onPointerDown = (e) => {
    const canvasRect = canvas.getBoundingClientRect();
    for (const rec of panels.values()) {
      if (!rec.active || !rec.visible) continue;
      const hit = hitTestPanel(rec, e.clientX, e.clientY, canvasRect);
      if (!hit) continue;
      e.stopImmediatePropagation();
      e.preventDefault();
      const panelRect = rec.element.getBoundingClientRect();
      const ctrl = controlAt(rec, hit.u, hit.v, panelRect);
      if (!ctrl) return;
      if (ctrl.type === 'close') { setActive(rec, false); return; }
      if (ctrl.type === 'colorclose') { if (colorPicker) colorPicker.detachColorPicker(); return; }
      if (ctrl.type === 'button') { ctrl.hit.click(); return; }
      if (ctrl.type === 'checkbox') { ctrl.input.click(); return; }
      if (ctrl.type === 'color') { openColorPicker(rec, ctrl.input); return; }
      if (ctrl.type === 'slider') {
        drag = { rec, ctrl, panelRect, canvasRect };
        applySlider(ctrl, ctrl.panelX, panelRect);
      }
      return;
    }
  };

  const onPointerMove = (e) => {
    if (!drag) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    const hit = hitTestPanel(drag.rec, e.clientX, e.clientY, drag.canvasRect);
    if (hit) applySlider(drag.ctrl, hit.u * drag.panelRect.width, drag.panelRect);
  };

  const onPointerUp = (e) => {
    if (drag) { e.stopImmediatePropagation(); drag = null; }
  };

  const onClick = (e) => {
    const canvasRect = canvas.getBoundingClientRect();
    for (const rec of panels.values()) {
      if (!rec.active || !rec.visible) continue;
      if (hitTestPanel(rec, e.clientX, e.clientY, canvasRect)) {
        e.stopImmediatePropagation();
        e.preventDefault();
        return;
      }
    }
  };

  window.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('pointermove', onPointerMove, true);
  window.addEventListener('pointerup', onPointerUp, true);
  window.addEventListener('click', onClick, true);

  // Rasterize every active panel into its texture once it has laid out.
  canvas.addEventListener('paint', () => {
    for (const rec of panels.values()) {
      if (!rec.active || !rec.texture) continue;
      try {
        device.queue.copyElementImageToTexture(rec.element, rec.texW, rec.texH, { texture: rec.texture });
        if (!rec.painted) {
          rec.painted = true;
          console.log('[HtmlPanel]', rec.id, 'rasterized into GPU texture');
        }
      } catch (err) {
        console.error('[HtmlPanel] copyElementImageToTexture failed:', rec.id, err);
      }
    }
  });

  return {
    /**
     * Show or hide a panel in the 3D world (adopting it on first use).
     * @param {HTMLElement} element - The panel element built by its UI module.
     * @param {'world'|'camera'} [mode='world'] - 'world' pins the panel beside
     *   the player; 'camera' keeps it on the camera's eye line with inertia.
     */
    toggle(element, mode = 'world') {
      if (!element) return;
      const rec = getRecord(element);
      if (!rec) return;
      rec.mode = mode;
      if (rec.active) setActive(rec, false);
      else { rec.camCenter = null; activate(rec); }
    },

    /** @returns {boolean} Whether any panel is currently shown. */
    hasActivePanel() {
      for (const rec of panels.values()) if (rec.active) return true;
      return false;
    },

    /**
     * Place every active panel billboard and refresh its texture.
     * @param {number[]} avatarSphere - Player position (camera-relative).
     * @param {number[]} earthCenterRel - Earth centre (camera-relative).
     * @param {Float32Array} viewProjection - Camera-relative view-projection.
     * @param {number[]} [cameraUp] - Camera up axis; panels align their vertical
     *        edge to the screen so they stay perfectly upright (no tilt).
     * @param {number[]} [cameraForward] - Camera forward axis; panels centre
     *        themselves directly in front of the camera.
     */
    update(avatarSphere, earthCenterRel, viewProjection, cameraUp, cameraForward) {
      if (viewProjection) vp.set(viewProjection);
      _cameraUp = (cameraUp && cameraUp.length === 3) ? cameraUp : null;
      _cameraForward = (cameraForward && cameraForward.length === 3) ? cameraForward : null;
      let anyActive = false;
      for (const rec of panels.values()) {
        if (!rec.active) { rec.visible = false; continue; }
        anyActive = true;
        updateRec(rec, avatarSphere, earthCenterRel);
      }
      if (anyActive && typeof canvas.requestPaint === 'function') canvas.requestPaint();
    },

    /**
     * Draw every visible panel billboard.
     * @param {GPURenderPassEncoder} passEncoder
     */
    render(passEncoder) {
      let pipelineSet = false;
      for (const rec of panels.values()) {
        if (!rec.visible || !rec.bindGroup) continue;
        if (!pipelineSet) { passEncoder.setPipeline(pipeline); pipelineSet = true; }
        passEncoder.setBindGroup(0, rec.bindGroup);
        passEncoder.draw(6, 1);
      }
    },

    /** Detach the pointer listeners. */
    destroy() {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('pointermove', onPointerMove, true);
      window.removeEventListener('pointerup', onPointerUp, true);
      window.removeEventListener('click', onClick, true);
    },
  };
};
