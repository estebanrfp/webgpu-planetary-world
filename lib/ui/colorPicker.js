/**
 * colorPicker.js — reusable in-world colour picker component.
 *
 * A single shared popover (`.cp-popover`) that attaches INSIDE whichever panel
 * owns the `<input type="color">` being edited: `attachColorPicker(hostPanel,
 * input)` moves the popover into that panel and binds it to the input;
 * `detachColorPicker()` removes it. The popover is `position:absolute`, so it
 * overlays the panel without changing its layout box, and renders as part of
 * that panel's HTML-in-Canvas billboard — it never leaves the panel.
 *
 * H/S/V sliders + a live swatch; every change is written straight back to the
 * bound input (firing `input`/`change`). The native OS colour dialog is never
 * opened.
 *
 * @module ui/colorPicker
 */

const POPOVER_HTML = `
    <div class="cp-popover">
      <div class="cp-title">
        <span>🎨 Color</span>
        <button class="cp-close" type="button">×</button>
      </div>
      <div class="cp-preview">
        <div class="cp-swatch" id="cp-swatch"></div>
        <span class="cp-hex" id="cp-hex">#ffffff</span>
      </div>
      <div class="slider-row">
        <span class="slider-label">Tono:</span>
        <div class="slider-container"><input type="range" class="slider-input cp-hue" id="cp-h" min="0" max="360" step="1" value="0"></div>
        <span class="slider-value" id="cp-h-val">0</span>
      </div>
      <div class="slider-row">
        <span class="slider-label">Saturación:</span>
        <div class="slider-container"><input type="range" class="slider-input" id="cp-s" min="0" max="100" step="1" value="100"></div>
        <span class="slider-value" id="cp-s-val">100</span>
      </div>
      <div class="slider-row">
        <span class="slider-label">Brillo:</span>
        <div class="slider-container"><input type="range" class="slider-input" id="cp-v" min="0" max="100" step="1" value="100"></div>
        <span class="slider-value" id="cp-v-val">100</span>
      </div>
    </div>
`;

/** Inject the picker stylesheet once. */
const ensureColorPickerStyle = () => {
  if (document.getElementById('ovgrid-color-picker-style')) return;
  const style = document.createElement('style');
  style.id = 'ovgrid-color-picker-style';
  style.textContent = `
    .cp-popover {
      position: absolute;
      top: 44px;
      left: 50%;
      transform: translateX(-50%);
      width: 268px;
      box-sizing: border-box;
      padding: 12px 14px 14px;
      background: linear-gradient(165deg, rgba(40, 42, 54, 0.98), rgba(24, 25, 33, 0.99));
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 12px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6);
      z-index: 50;
    }
    .cp-title {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.6px;
      color: #ffffff;
    }
    .cp-close {
      background: none;
      border: none;
      color: #aaa;
      cursor: pointer;
      font-size: 16px;
    }
    .cp-preview {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 12px;
    }
    .cp-swatch {
      width: 52px;
      height: 34px;
      border-radius: 6px;
      border: 1px solid rgba(255, 255, 255, 0.25);
      background: #ffffff;
    }
    .cp-hex {
      font-family: ui-monospace, Menlo, monospace;
      font-size: 13px;
      letter-spacing: 0.5px;
      color: #e0e0e0;
    }
    .cp-hue::-webkit-slider-runnable-track {
      background: linear-gradient(to right,
        #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000);
    }
  `;
  document.head.appendChild(style);
};

// --- colour maths --------------------------------------------------------

const clamp255 = (n) => Math.max(0, Math.min(255, Math.round(n)));

/** "#rrggbb" → {r,g,b} (0-255). Falls back to white on a bad value. */
const hexToRgb = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return { r: 255, g: 255, b: 255 };
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
};

/** {r,g,b} (0-255) → "#rrggbb". */
const rgbToHex = (r, g, b) =>
  '#' + [r, g, b].map((c) => clamp255(c).toString(16).padStart(2, '0')).join('');

/** {r,g,b} (0-255) → {h:0-360, s:0-100, v:0-100}. */
const rgbToHsv = (r, g, b) => {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: (max === 0 ? 0 : d / max) * 100, v: max * 100 };
};

/** {h:0-360, s:0-100, v:0-100} → {r,g,b} (0-255). */
const hsvToRgb = (h, s, v) => {
  s /= 100; v /= 100;
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
};

// --- component -----------------------------------------------------------

let popoverEl = null;
let targetInput = null;          // the <input type="color"> currently being edited
let sliders = null;              // { h, s, v } range inputs
let render = null;               // recompute the display, optionally writing back

/** Build the popover element once and wire its sliders. */
const buildPopover = () => {
  if (popoverEl) return popoverEl;
  ensureColorPickerStyle();
  const temp = document.createElement('div');
  temp.innerHTML = POPOVER_HTML;
  popoverEl = temp.firstElementChild;

  sliders = {
    h: popoverEl.querySelector('#cp-h'),
    s: popoverEl.querySelector('#cp-s'),
    v: popoverEl.querySelector('#cp-v'),
  };
  const swatch = popoverEl.querySelector('#cp-swatch');
  const hexLabel = popoverEl.querySelector('#cp-hex');
  const valEls = {
    h: popoverEl.querySelector('#cp-h-val'),
    s: popoverEl.querySelector('#cp-s-val'),
    v: popoverEl.querySelector('#cp-v-val'),
  };

  render = (writeBack) => {
    const h = parseFloat(sliders.h.value);
    const s = parseFloat(sliders.s.value);
    const v = parseFloat(sliders.v.value);
    valEls.h.textContent = String(Math.round(h));
    valEls.s.textContent = String(Math.round(s));
    valEls.v.textContent = String(Math.round(v));
    const { r, g, b } = hsvToRgb(h, s, v);
    const hex = rgbToHex(r, g, b);
    swatch.style.background = hex;
    hexLabel.textContent = hex;
    if (writeBack && targetInput) {
      targetInput.value = hex;
      targetInput.dispatchEvent(new Event('input', { bubbles: true }));
      targetInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
  };

  for (const el of Object.values(sliders)) {
    el.addEventListener('input', () => render(true));
  }
  return popoverEl;
};

/**
 * Attach the shared picker inside a host panel, bound to a colour input.
 * @param {HTMLElement} hostEl - The panel that owns the colour input.
 * @param {HTMLInputElement} inputEl - An `<input type="color">`.
 * @returns {HTMLElement} The popover element.
 */
export const attachColorPicker = (hostEl, inputEl) => {
  buildPopover();
  hostEl.appendChild(popoverEl);          // move the popover into the host panel
  targetInput = inputEl;
  const { r, g, b } = hexToRgb(inputEl.value);
  const { h, s, v } = rgbToHsv(r, g, b);
  sliders.h.value = String(Math.round(h));
  sliders.s.value = String(Math.round(s));
  sliders.v.value = String(Math.round(v));
  render(false);
  return popoverEl;
};

/** Remove the picker popover from whichever panel currently holds it. */
export const detachColorPicker = () => {
  if (popoverEl) popoverEl.remove();
  targetInput = null;
};
