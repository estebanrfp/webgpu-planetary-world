# Interface: HUD, UI, Audio

Player nameplates/billboards, terrain debug flags, and the sound system. ← back to [index](./README.md).

---

## `hudConfig.js` — `HUD_CONFIG`

The floating nameplate above each avatar and its distance/altitude fading. Distances are camera
distances in world units (≈ km). **Source:** [`lib/config/hudConfig.js`](../../lib/config/hudConfig.js).

| Param | Default | Effect |
|---|---|---|
| `maxDistance` | `0.9` | Hard cull beyond this camera distance. |
| `fadeStartDistance` / `fadeEndDistance` | `0.25` / `0.5` | Distance fade band (fully gone before the 0.6 zoom-out). |
| `minDistance` | `0.005` | Fade out when too close to the camera. |
| `altitudeFadeStart` / `altitudeFadeEnd` | `0.12` / `0.45` | Nameplate dissolves as the avatar flies up (survives jumps, vanishes on ascent). The avatar mesh stays visible. |
| `heightOffset` | `0.105` | Nameplate height above the head. |
| `baseScale` | `0.05` | Billboard width (world units). |
| `canvasWidth` / `canvasHeight` | `120` / `85` | Nameplate canvas size (px). |
| `style` | object | `fontSize 14`, `statusFontSize 10`, `fontFamily`, `panelAlpha 0.8`, `borderRadius 8`. |

---

## `uiConfig.js` — `UI_CONFIG`

Terrain debug visualisation flags and UI throttling. The bitflags must match
`shaders/terrain.wgsl`. **Source:** [`lib/config/uiConfig.js`](../../lib/config/uiConfig.js).

| Group | Field | Default | Effect |
|---|---|---|---|
| `DEBUG_FLAGS` | QUADS/SUBQUADS/SKIRTS/COLOR/TEXTURES/NOISE/BUMP | `1/2/4/8/16/32/128` | Terrain debug overlays (bitmask). |
| `BYPASS_FLAGS` | TEXTURES/LIGHTING/SHADOWS | `1/2/4` | Perf bypass bits, packed into `earthCenter.w`. |
| — | `DEFAULT_DEBUG_FLAGS` | `8\|16\|128` | Default = Color + Textures + Bump. |
| — | `SAVE_DEBOUNCE_MS` | `500` | Debounce before persisting edits. |
| — | `STATS_UPDATE_INTERVAL_MS` | `100` | Stats refresh interval. |

---

## `audioConfig.js` — `AUDIO_CONFIG`

Sound asset URLs, playback rates, volumes and spatial (3D) audio settings.
**Source:** [`lib/config/audioConfig.js`](../../lib/config/audioConfig.js).

| Group | Field | Default | Effect |
|---|---|---|---|
| `sounds` | footstepsLand/Water, jump, fly, shipEntry/Flight, rain, storm, thunder, snow, beach, aurae | URLs | Sound asset paths (some on the `ovgrid-assets` repo, some local). |
| — | `walkRate` / `runRate` | `0.6` / `1.2` | Footstep playback rate by gait. |
| `volumes` | footstepsLand/Water, jump, fly, shipEntry/Flight, master | `1.5 / 1.5 / 1.5 / 0.15 / 0.8 / 0.5 / 1.0` | Per-sound + master volume. |
| `modifiers` | `jumpWindMultiplier` | `0.5` | Wind volume during a jump arc. |
| `spatial` | `panningModel` | `'HRTF'` | High-quality 3D panning. |
| `spatial` | `distanceModel` | `'inverse'` | Natural falloff. |
| `spatial` | `refDistance` / `maxDistance` / `rolloffFactor` | `0.02` / `10.0` / `0.3` | Full-volume zone (20 m), reach (10 km), falloff. |
| `spatial.overrides.thunder` | refDistance/maxDistance/rolloffFactor | `0.1` / `20.0` / `0.2` | Thunder carries far with a gentle drop-off. |

> In-water detection (for footstep selection) lives in [`lib/terrain/water.js`](../../lib/terrain/water.js), shared by player + NPCs.

---

← [index](./README.md) · related: [player.md](./player.md) · [weather.md](./weather.md)
