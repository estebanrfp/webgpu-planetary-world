# In-World UI Panels (HTML-in-Canvas)

The world's configuration panels render **inside the 3D world** as billboards,
not as flat DOM overlays. Each panel is real HTML/CSS rasterized into a GPU
texture through the experimental HTML-in-Canvas API, then drawn as a
camera-facing quad anchored beside the player.

In-world panels: the **Debug** panel (`g`) and the **Calendar** (click the
calendar widget). The avatar **nameplates** and **parcel tooltips** use the same
HTML-in-Canvas technique.

> Requires the experimental HTML-in-Canvas flag — see **Requirements** below.

## How it works

`lib/systems/HtmlPanelSystem.js` is a generic manager, created once by the
renderer. `planetRenderer.togglePanel(element)` is the public entry point.

For each panel:

1. **Adopt** — the real `#…-config-panel` element is re-parented into the
   WebGPU `<canvas>` (which carries the `layoutsubtree` attribute). The
   `.ovg-inworld-panel` CSS class forces it to lay out as a visible block
   instead of a hidden bottom-right overlay.
2. **Rasterize** — on every `paint` event, `device.queue.copyElementImageToTexture`
   copies the panel's rendered image into an `rgba8unorm` texture.
3. **Billboard** — the texture is drawn as an upright, camera-facing quad. The
   world anchor is captured once, the frame the panel is shown, so the panel
   stays put while the player walks around it. It is anchored by its **bottom
   edge**, so a tall panel grows upward and never sinks into the terrain. Open
   panels stagger sideways so they do not overlap, and the billboard is
   depth-tested (reverse-Z) — avatars and terrain in front occlude it.

The billboard width scales with the panel's CSS width, so text keeps the same
physical size whatever the panel's dimensions.

## Interaction

The HTML-in-Canvas API does **not** route pointer events to elements drawn in
3D, so interaction is manual:

1. A pointer event is raycast against the billboard quad.
2. The screen point is inverse-mapped to the panel UV — **perspective
   correct**: the mapping is solved in clip space using the `w` component, so
   it stays accurate when the panel is viewed at an angle. (Affine/barycentric
   interpolation drifts under perspective and was the cause of misaligned
   clicks.)
3. The UV → panel-local pixels → hit-tested against the live control rects
   (`getBoundingClientRect`).
4. The hit is replayed as a synthetic DOM event on the real control — a slider
   gets its value set + an `input` event; a checkbox/button gets `.click()`.
   The control's existing wiring (UIManager, NpcUI, …) then runs unchanged.

Controls are detected generically by shared markup — `.slider-row`,
`.checkbox-label`, `<button>`, `input[type="color"]` — so any panel built with
the shared `.config-popup-panel` style works without per-panel code.

While any panel is open, the player avatar and the nameplate HUD are hidden so
they do not obscure the UI.

## Colour picker

`lib/ui/colorPicker.js` is a **reusable component**: a single shared popover
(H/S/V sliders + a live swatch) that any panel's `<input type="color">` drives.
Clicking a colour swatch lazily loads the picker and attaches it *inside* the
host panel as a `position:absolute` overlay (`attachColorPicker(host, input)`).
Moving a slider converts HSV→hex and writes back to the real input, firing
`input`/`change`. The native OS colour dialog is never opened.

## Migrating another panel

1. Build the panel as ordinary DOM with the shared `.config-popup-panel` /
   `.slider-row` / `.checkbox-label` markup.
2. In `mainPlanet.js`, make its `toggleX` call
   `planetRenderer.togglePanel(document.getElementById('…-config-panel'))`
   instead of `.classList.toggle('visible')`.

`HtmlPanelSystem` then adopts, renders and wires it automatically.

## Requirements

This UI **requires the experimental HTML-in-Canvas API** (`copyElementImageToTexture`,
exposed by `CanvasDrawElement`). Enable it once:

1. Open `chrome://flags/#enable-experimental-web-platform-features`
2. Set it to **Enabled** and relaunch the browser.

It is a **hard requirement**: the boot gate (`lib/core/requirements.js`) detects
it (and WebGPU) at startup and shows an instructions modal if either is missing.
The UI systems therefore assume the API is present and do not feature-detect
per-call.

## Limitations

- Text inputs (`<input type="text">`), `<select>` and IME are not handled.
  Panels that need them (Profile, AvatarEditor, the main control panel) render as
  ordinary DOM overlays instead. Real focus/IME for 3D-placed elements needs the
  API's `getElementTransform()` and is a later phase.
- Chromium-based browsers only (the flag is Chromium-specific).

## Key files

| File | Role |
|------|------|
| `lib/systems/HtmlPanelSystem.js` | Panel manager, billboard rendering, raycast interaction |
| `lib/ui/colorPicker.js` | Reusable in-world colour-picker component |
| `lib/systems/HtmlNameplateSystem.js` | Same technique, applied to avatar nameplates |
| `lib/terrain/renderer.js` | Creates the system, exposes `togglePanel()` |
