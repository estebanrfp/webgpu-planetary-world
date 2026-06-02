/**
 * Voxel avatar editor — a self-contained, embeddable editor that mounts into any
 * container element (the profile modal, a standalone page, …). It builds the
 * voxel avatar with the shared `voxel-builder` and previews it animated with the
 * engine's animation system, so what you see matches the in-game render.
 *
 * All CSS is scoped under `.vxe` so it never bleeds into the host UI. The preview
 * uses its own WebGPU device; `destroy()` tears it down (RAF + GPU) on close.
 *
 * @module ui/voxel-avatar-editor
 */

import { loadGLB, extractSkeleton, extractAnimations, createAnimationSystem } from '../avatar/index.js';
import { buildVoxelAvatar, DEFAULT_VOXEL_PARAMS, randomVoxelParams } from '../avatar/voxel-builder.js';
import { AVATAR_CONFIG } from '../config/avatarConfig.js';

const STRIDE = 19;

const OPTS = {
  hair: ['none', 'short', 'flat', 'side', 'mohawk', 'long', 'spikes'],
  beard: ['none', 'goatee', 'full', 'mustache', 'stubble'],
  glasses: ['none', 'classic', 'sun', 'visor'],
  hat: ['none', 'cap', 'beanie', 'helmet', 'crown', 'tophat'],
  nose: ['none', 'small', 'long'],
  ears: ['none', 'human', 'elf'],
  pattern: ['none', 'stripes', 'grid', 'tech', 'diamond', 'gradient'],
};

const CSS = `
.vxe{--field:#172033;--fb:#314158;--text:#e8eefc;--muted:#9fb0cc;--accent:#3b82f6;--accent2:#60a5fa;
  position:absolute;inset:0;display:grid;grid-template-columns:300px 1fr 280px;background:#0b0f17;color:var(--text);
  font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;font-size:13px}
.vxe *{box-sizing:border-box}
.vxe .pane{background:#111827;border:0 solid #263244;padding:14px;overflow:auto}
.vxe .pane.l{border-right-width:1px}.vxe .pane.r{border-left-width:1px}
.vxe h1{font-size:16px;margin:0 0 2px;font-weight:700}
.vxe .sub{font-size:12px;color:var(--muted);margin:0 0 12px}
.vxe h2{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin:16px 0 9px}
.vxe .row{display:grid;grid-template-columns:1fr 92px;gap:9px;align-items:center;margin:8px 0}
.vxe .row3{display:grid;grid-template-columns:1fr 64px 40px;gap:7px;align-items:center;margin:8px 0}
.vxe label{font-size:13px;color:#c9d4e8}
.vxe select,.vxe input[type=color],.vxe input[type=range],.vxe button{width:100%;border:1px solid var(--fb);background:var(--field);color:var(--text);border-radius:9px;padding:8px}
.vxe input[type=color]{height:34px;padding:3px;cursor:pointer}
.vxe .btns{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin:9px 0}
.vxe .primary{background:var(--accent);border-color:var(--accent2);color:#fff;font-weight:600;cursor:pointer}
.vxe button{cursor:pointer}.vxe .small{font-size:12px;padding:7px}
.vxe .toggle{display:flex;align-items:center;gap:8px;margin:9px 0;font-size:13px;color:#c9d4e8;cursor:pointer}
.vxe .toggle input{width:auto}
.vxe .stage{position:relative;background:radial-gradient(circle at 50% 32%,#253244 0,#101722 44%,#070b10 100%)}
.vxe canvas{display:block;width:100%;height:100%}
.vxe .animbar{position:absolute;left:14px;top:12px;display:flex;gap:6px;flex-wrap:wrap}
.vxe .animbar button{width:auto;padding:6px 11px;font-size:12px;background:#0b1220cc;border:1px solid #22314a}
.vxe .animbar button.on{background:var(--accent);border-color:var(--accent2);color:#fff}
.vxe .hint{position:absolute;left:14px;bottom:12px;color:#93a4be;font-size:11.5px;background:#0b1220cc;border:1px solid #22314a;border-radius:999px;padding:7px 11px}
.vxe .badge{display:inline-flex;gap:6px;align-items:center;margin:3px 5px 3px 0;padding:5px 8px;border:1px solid #334155;border-radius:999px;background:#151f31;font-size:11.5px}
.vxe .sw{width:11px;height:11px;border-radius:4px;border:1px solid #ffffff55}
.vxe .mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;color:var(--muted);white-space:pre-wrap;line-height:1.5}
.vxe .err{margin-top:10px;font-size:12px;color:#fca5a5;line-height:1.4}
`;

const SHADER = /* wgsl */`
struct U { viewProj : mat4x4f }
@group(0) @binding(0) var<uniform> u : U;
@group(0) @binding(1) var<storage, read> bones : array<mat4x4f>;
struct VIn { @location(0) pos : vec3f, @location(1) nrm : vec3f, @location(3) joints : vec4f, @location(4) weights : vec4f, @location(5) color : vec3f }
struct VOut { @builtin(position) pos : vec4f, @location(0) wpos : vec3f, @location(1) color : vec3f }
@vertex fn vs(in : VIn) -> VOut {
  var sp = vec3f(0.0);
  let tw = in.weights.x + in.weights.y + in.weights.z + in.weights.w;
  if (tw > 0.001) {
    sp += (bones[u32(in.joints.x)] * vec4f(in.pos, 1.0)).xyz * in.weights.x;
    sp += (bones[u32(in.joints.y)] * vec4f(in.pos, 1.0)).xyz * in.weights.y;
    sp += (bones[u32(in.joints.z)] * vec4f(in.pos, 1.0)).xyz * in.weights.z;
    sp += (bones[u32(in.joints.w)] * vec4f(in.pos, 1.0)).xyz * in.weights.w;
  } else { sp = in.pos; }
  var out : VOut; out.pos = u.viewProj * vec4f(sp, 1.0); out.wpos = sp; out.color = in.color; return out;
}
@fragment fn fs(in : VOut) -> @location(0) vec4f {
  let n = normalize(cross(dpdx(in.wpos), dpdy(in.wpos)));
  let key = max(dot(n, normalize(vec3f(-0.5, 0.9, 0.45))), 0.0);
  let fill = max(dot(n, normalize(vec3f(0.45, 0.25, -0.5))), 0.0) * 0.22;
  let rim = pow(1.0 - abs(n.z), 3.0) * 0.14;
  return vec4f(in.color * (0.34 + key * 0.62 + fill + rim), 1.0);
}`;

const mat4 = {
  perspective: (f, a, n, fa) => { const t = 1 / Math.tan(f / 2), nf = 1 / (n - fa); return new Float32Array([t / a, 0, 0, 0, 0, t, 0, 0, 0, 0, (fa + n) * nf, -1, 0, 0, 2 * fa * n * nf, 0]); },
  lookAt: (e, c, up) => { let zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2]; let l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l; let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx; l = Math.hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l; const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx; return new Float32Array([xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0, -(xx * e[0] + xy * e[1] + xz * e[2]), -(yx * e[0] + yy * e[1] + yz * e[2]), -(zx * e[0] + zy * e[1] + zz * e[2]), 1]); },
  mul: (a, b) => { const o = new Float32Array(16); for (let c = 0; c < 4; c++) { const bi = c * 4; for (let r = 0; r < 4; r++) o[bi + r] = b[bi] * a[r] + b[bi + 1] * a[4 + r] + b[bi + 2] * a[8 + r] + b[bi + 3] * a[12 + r]; } return o; },
};

/** Retarget animation tracks onto the avatar skeleton (strip mixamorig: prefixes). */
const retarget = (skel, animSkel, anims) => {
  const strip = (s) => s.replace(/^mixamorig:/i, '').toLowerCase().replace(/[_.\s]/g, '');
  const map = {};
  for (const av of skel.joints) {
    if (animSkel.joints.includes(av)) { map[av] = av; continue; }
    const an = strip(av);
    for (const ab of animSkel.joints) if (strip(ab) === an) { map[ab] = av; break; }
  }
  const out = {};
  for (const [name, a] of Object.entries(anims)) out[name] = { ...a, tracks: a.tracks.map((t) => ({ ...t, nodeName: map[t.nodeName] || t.nodeName })) };
  return out;
};

const buildHTML = (showActions) => `
  <aside class="pane l">
    <h1>Editor de avatar</h1><p class="sub">Voxel · riggeado a Mixamo · animado</p>
    ${showActions ? '<div class="btns"><button data-act="apply" class="primary">Aplicar</button><button data-act="close">Cerrar</button></div>' : ''}
    <div class="btns"><button data-act="random" class="primary">Random coherente</button><button data-act="reset">Reset</button></div>
    <div class="btns"><button data-act="export" class="small">Export JSON</button><button data-act="copy" class="small">Copiar</button></div>
    <label class="toggle"><input data-k="articulated" type="checkbox" checked> Articulado (codo/rodilla)</label>
    <h2>Color</h2>
    ${[['skin', 'Piel'], ['hairColor', 'Pelo'], ['eyeColor', 'Ojos'], ['mouthColor', 'Boca'], ['shirtColor', 'Camiseta'], ['pantsColor', 'Pantalón'], ['shoeColor', 'Zapatos']]
    .map(([k, l]) => `<div class="row"><label>${l}</label><input data-k="${k}" type="color"></div>`).join('')}
    <h2>Rasgos</h2>
    ${[['hair', 'Pelo'], ['beard', 'Barba'], ['glasses', 'Gafas'], ['hat', 'Sombrero'], ['nose', 'Nariz'], ['ears', 'Orejas'], ['pattern', 'Patrón']]
    .map(([k, l]) => `<div class="row"><label>${l}</label><select data-k="${k}">${OPTS[k].map((v) => `<option value="${v}">${v}</option>`).join('')}</select></div>`).join('')}
    <h2>Cuerpo</h2>
    <div class="row3"><label>Altura</label><input data-k="height" type="range" min="0.85" max="1.2" step="0.01"><span data-v="height"></span></div>
    <div class="row3"><label>Cabeza</label><input data-k="head" type="range" min="0.85" max="1.15" step="0.01"><span data-v="head"></span></div>
    <div class="row3"><label>Anchura</label><input data-k="width" type="range" min="0.85" max="1.2" step="0.01"><span data-v="width"></span></div>
    <div class="err" data-el="err"></div>
  </aside>
  <main class="stage"><canvas data-el="canvas"></canvas><div class="animbar" data-el="animbar"></div><div class="hint">Arrastra para rotar · rueda para zoom</div></main>
  <aside class="pane r"><h2>Partes activas</h2><div data-el="parts"></div><h2>JSON</h2><div class="mono" data-el="json"></div></aside>
`;

/**
 * Mount the voxel avatar editor into a container.
 * @param {HTMLElement} container
 * @param {{initialParams?:object, onApply?:(params:object)=>void, onClose?:()=>void, rigUrl?:string, animUrl?:string}} [opts]
 * @returns {{destroy:()=>void}}
 */
export const mountVoxelEditor = (container, opts = {}) => {
  const showActions = !!(opts.onApply || opts.onClose);
  const abs = (p) => new URL(String(p).replace(/^\.\//, ''), location.origin + '/').href;
  const rigUrl = opts.rigUrl || abs(AVATAR_CONFIG.url);
  const animUrl = opts.animUrl || abs(AVATAR_CONFIG.animationsUrl);

  if (!document.getElementById('vxe-css')) {
    const st = document.createElement('style'); st.id = 'vxe-css'; st.textContent = CSS; document.head.appendChild(st);
  }
  const root = document.createElement('div'); root.className = 'vxe'; root.innerHTML = buildHTML(showActions);
  container.appendChild(root);

  const q = (sel) => root.querySelector(sel);
  const inputs = [...root.querySelectorAll('[data-k]')];
  const canvas = q('[data-el="canvas"]');
  const state = { ...DEFAULT_VOXEL_PARAMS, ...(opts.initialParams || {}) };

  let device, ctx, format, pipeline, bindGroup, mvpBuf, boneBuf, vBuf, iBuf, depthTex;
  let skeleton, animSystem, indexCount = 0, jointCount = 0;
  let angle = 0, pitch = 0.15, zoom = 2.7, drag = false, last = [0, 0], lastT = 0, currentAnim = 'Idle', raf = 0, destroyed = false;

  const syncInputs = () => inputs.forEach((el) => { const k = el.dataset.k; if (el.type === 'checkbox') el.checked = state[k] !== false; else if (state[k] !== undefined) el.value = state[k]; });
  const updatePanels = () => {
    ['height', 'head', 'width'].forEach((k) => { const s = root.querySelector(`[data-v="${k}"]`); if (s) s.textContent = Number(state[k]).toFixed(2); });
    q('[data-el="json"]').textContent = JSON.stringify(state, null, 2);
    q('[data-el="parts"]').innerHTML = ['hair', 'beard', 'glasses', 'hat', 'nose', 'ears', 'pattern']
      .map((k) => `<span class="badge"><span class="sw" style="background:${state[k] === 'none' ? '#334155' : state.hairColor}"></span>${k}: ${state[k]}</span>`).join('');
  };
  const rebuild = () => { if (!skeleton) return; const { vertices, indices } = buildVoxelAvatar(state, skeleton); indexCount = indices.length; device.queue.writeBuffer(vBuf, 0, vertices); device.queue.writeBuffer(iBuf, 0, indices); updatePanels(); };

  const setAnim = (name) => { currentAnim = name; animSystem.play(name); root.querySelectorAll('[data-anim]').forEach((b) => b.classList.toggle('on', b.dataset.anim === name)); };

  const resize = () => { const r = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio, 2); canvas.width = Math.max(1, r.width * dpr | 0); canvas.height = Math.max(1, r.height * dpr | 0); depthTex?.destroy(); depthTex = device.createTexture({ size: [canvas.width, canvas.height], format: 'depth24plus', usage: GPUTextureUsage.RENDER_ATTACHMENT }); };
  const ro = new ResizeObserver(() => { if (!destroyed && device) resize(); });

  const frame = (t) => {
    if (destroyed) return;
    raf = requestAnimationFrame(frame);
    if (!depthTex) return;
    const dt = lastT ? Math.min((t - lastT) / 1000, 0.05) : 0; lastT = t;
    animSystem.update(dt);
    device.queue.writeBuffer(boneBuf, 0, animSystem.getBoneMatrices());
    const center = [0, 0.95, 0];
    const eye = [center[0] + Math.sin(angle) * zoom, center[1] + pitch * zoom, center[2] + Math.cos(angle) * zoom];
    const proj = mat4.perspective(0.7, canvas.width / canvas.height, 0.05, 100);
    device.queue.writeBuffer(mvpBuf, 0, mat4.mul(proj, mat4.lookAt(eye, center, [0, 1, 0])));
    const enc = device.createCommandEncoder();
    const pass = enc.beginRenderPass({
      colorAttachments: [{ view: ctx.getCurrentTexture().createView(), clearValue: { r: 0.05, g: 0.07, b: 0.1, a: 1 }, loadOp: 'clear', storeOp: 'store' }],
      depthStencilAttachment: { view: depthTex.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' },
    });
    pass.setPipeline(pipeline); pass.setBindGroup(0, bindGroup);
    pass.setVertexBuffer(0, vBuf); pass.setIndexBuffer(iBuf, 'uint32');
    pass.drawIndexed(indexCount, 1); pass.end();
    device.queue.submit([enc.finish()]);
  };

  // Events
  inputs.forEach((el) => el.addEventListener('input', (e) => {
    const k = el.dataset.k;
    state[k] = el.type === 'checkbox' ? e.target.checked : (el.type === 'range' ? Number(e.target.value) : e.target.value);
    rebuild();
  }));
  root.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => {
    const act = b.dataset.act;
    if (act === 'random') { Object.assign(state, randomVoxelParams(), { articulated: state.articulated }); syncInputs(); rebuild(); }
    else if (act === 'reset') { Object.assign(state, DEFAULT_VOXEL_PARAMS); syncInputs(); rebuild(); }
    else if (act === 'export') { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })); a.download = 'voxel-avatar.json'; a.click(); URL.revokeObjectURL(a.href); }
    else if (act === 'copy') navigator.clipboard?.writeText(JSON.stringify(state, null, 2));
    else if (act === 'apply') opts.onApply?.({ ...state });
    else if (act === 'close') opts.onClose?.();
  }));
  canvas.addEventListener('pointerdown', (e) => { drag = true; last = [e.clientX, e.clientY]; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointerup', () => drag = false);
  canvas.addEventListener('pointermove', (e) => { if (!drag) return; angle += (e.clientX - last[0]) * 0.008; pitch = clamp(pitch + (e.clientY - last[1]) * 0.004, -0.4, 0.7); last = [e.clientX, e.clientY]; });
  canvas.addEventListener('wheel', (e) => { zoom = clamp(zoom + Math.sign(e.deltaY) * 0.2, 1.4, 6); e.preventDefault(); }, { passive: false });

  syncInputs(); updatePanels();

  (async () => {
    try {
      if (!navigator.gpu) throw new Error('WebGPU no disponible (usa Chrome/Edge actual).');
      const adapter = await navigator.gpu.requestAdapter();
      device = await adapter.requestDevice();
      if (destroyed) { device.destroy?.(); return; }
      ctx = canvas.getContext('webgpu'); format = navigator.gpu.getPreferredCanvasFormat();
      ctx.configure({ device, format, alphaMode: 'opaque' });

      const rig = await loadGLB(rigUrl); skeleton = extractSkeleton(rig.json, rig.bin); jointCount = skeleton.jointCount;
      const ag = await loadGLB(animUrl);
      animSystem = createAnimationSystem(skeleton, retarget(skeleton, extractSkeleton(ag.json, ag.bin), extractAnimations(ag.json, ag.bin)));

      mvpBuf = device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      boneBuf = device.createBuffer({ size: jointCount * 64, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
      vBuf = device.createBuffer({ size: 2_000_000, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
      iBuf = device.createBuffer({ size: 1_000_000, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
      const mod = device.createShaderModule({ code: SHADER });
      pipeline = device.createRenderPipeline({
        layout: 'auto',
        vertex: { module: mod, entryPoint: 'vs', buffers: [{ arrayStride: STRIDE * 4, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x3' }, { shaderLocation: 3, offset: 32, format: 'float32x4' }, { shaderLocation: 4, offset: 48, format: 'float32x4' }, { shaderLocation: 5, offset: 64, format: 'float32x3' }] }] },
        fragment: { module: mod, entryPoint: 'fs', targets: [{ format }] },
        primitive: { topology: 'triangle-list', cullMode: 'none' },
        depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
      });
      bindGroup = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: mvpBuf } }, { binding: 1, resource: { buffer: boneBuf } }] });

      // Animation buttons
      q('[data-el="animbar"]').innerHTML = Object.keys(animSystem.animations).map((n) => `<button data-anim="${n}">${n}</button>`).join('');
      root.querySelectorAll('[data-anim]').forEach((b) => b.addEventListener('click', () => setAnim(b.dataset.anim)));
      setAnim(animSystem.animations['Idle'] ? 'Idle' : Object.keys(animSystem.animations)[0]);

      rebuild(); resize(); ro.observe(canvas);
      raf = requestAnimationFrame(frame);
    } catch (err) { q('[data-el="err"]').textContent = err.message; console.error('[VoxelEditor]', err); }
  })();

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  return {
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      try { depthTex?.destroy(); device?.destroy?.(); } catch {}
      root.remove();
    },
  };
};
