/**
 * Boot requirements gate.
 *
 * OVGrid renders its in-world UI — nameplates, the Debug/Calendar panels and
 * parcel tooltips — with the experimental HTML-in-Canvas feature
 * (`GPUQueue.copyElementImageToTexture`, exposed by Chromium's "Experimental Web
 * Platform features" flag). It is a HARD requirement: if WebGPU or that feature
 * is missing the game does not boot — a blocking modal explains how to enable it.
 *
 * @module core/requirements
 */

// The Chromium flag that exposes the HTML-in-Canvas APIs. Kept as a single
// constant so it is trivial to update if the feature graduates to its own flag.
const HTML_IN_CANVAS_FLAG = 'chrome://flags/#enable-experimental-web-platform-features';

const GATE_ID = 'requirements-gate';

/**
 * Whether the running browser exposes the HTML-in-Canvas rasterization API the
 * UI depends on. Definitive — it probes the exact method the systems call.
 * @param {GPUDevice} device - The live WebGPU device.
 * @returns {boolean}
 */
export const hasHtmlInCanvas = (device) =>
  typeof device?.queue?.copyElementImageToTexture === 'function';

/** @type {Record<string, {title:string, intro:string, steps:string[], flag:?string}>} */
const CONTENT = {
  'html-in-canvas': {
    title: 'One step to enter',
    intro: 'OVGrid draws its in-world UI with an experimental browser feature (HTML-in-Canvas) that is currently off. Turn it on once to play:',
    flag: HTML_IN_CANVAS_FLAG,
    steps: [
      'Paste the link above into a new tab and press Enter.',
      'Set the flag to <strong>Enabled</strong>.',
      'Relaunch the browser when prompted.',
      'Come back and reload this page.',
    ],
  },
  'webgpu': {
    title: 'WebGPU is required',
    intro: 'OVGrid renders with WebGPU, which this browser does not expose. Use a recent Chrome or Edge (113+) or Safari 18+, and make sure hardware acceleration is enabled.',
    flag: null,
    steps: [],
  },
};

/**
 * Show the blocking requirements modal and keep the world from booting. Safe to
 * call more than once (idempotent).
 * @param {{reason:'html-in-canvas'|'webgpu', detail?:string}} opts
 */
export const showRequirementGate = ({ reason, detail }) => {
  if (document.getElementById(GATE_ID)) return;
  const c = CONTENT[reason] ?? CONTENT.webgpu;

  const flagRow = c.flag
    ? `<div class="req-flag"><code id="req-flag-text">${c.flag}</code><button class="req-copy" id="req-copy">Copy</button></div>`
    : '';
  const stepsList = c.steps.length
    ? `<ol class="req-steps">${c.steps.map((s) => `<li>${s}</li>`).join('')}</ol>`
    : '';
  const detailRow = detail ? `<p class="req-detail">${detail}</p>` : '';

  const gate = document.createElement('div');
  gate.id = GATE_ID;
  gate.className = 'req-gate';
  gate.innerHTML = `
    <div class="req-card">
      <div class="req-logo">OVGRID</div>
      <h1 class="req-title">${c.title}</h1>
      <p class="req-text">${c.intro}</p>
      ${flagRow}
      ${stepsList}
      ${detailRow}
      <button class="req-reload" id="req-reload">Reload</button>
    </div>`;
  document.body.appendChild(gate);

  document.getElementById('req-reload')?.addEventListener('click', () => location.reload());

  const copyBtn = document.getElementById('req-copy');
  copyBtn?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(c.flag);
      copyBtn.textContent = 'Copied';
    } catch {
      // Clipboard blocked (no secure context / permission) — the user copies manually.
    }
  });
};
