# Ocean

Waves, foam, water color and reflections. [`lib/config/oceanConfig.js`](../../lib/config/oceanConfig.js)
exports `OCEAN_CONFIG`. These values **seed GPU uniform slots 64–79** via `env.ocean` and are
**tune-here-only** — they are not exposed as runtime UI. The parenthesised ranges below are the sane
bounds noted in the source. ← back to [index](./README.md).

> Geographic variation (arctic / temperate / tropical water by latitude) is the planned next step
> and will extend this file.

---

## Toggle

| Param | Default | Effect |
|---|---|---|
| `reflectionsEnabled` | `true` | Compile-time switch that selects a reflection branch in the shader. |

## Waves — `oceanParams`

| Param | Default | Range | GPU slot | Effect |
|---|---|---|---|---|
| `waveScale` | `3.0` | 0.5–8.0 | `.x` | Wave size / steepness. |
| `waveSpeed` | `0.5` | 0.0–2.0 | `.y` | Wave animation speed. |
| `reflectionStr` | `0.4` | 0.0–1.0 | `.z` | Sky/sun reflection strength. |
| `foamIntensity` | `0.6` | 0.0–1.0 | `.w` | Amount of crest foam. |

## Shallow water — `oceanColors1`

| Param | Default | GPU slot | Effect |
|---|---|---|---|
| `shallowR` | `0.10` | `.x` | Shallow color — red. |
| `shallowG` | `0.55` | `.y` | Shallow color — green. |
| `shallowB` | `0.70` | `.z` | Shallow color — blue. |
| `clarity` | `0.4` (0.0–1.0) | `.w` | Water clarity / transparency. |

## Deep water — `oceanColors2`

| Param | Default | GPU slot | Effect |
|---|---|---|---|
| `deepR` | `0.06` | `.x` | Deep color — red. |
| `deepG` | `0.35` | `.y` | Deep color — green. |
| `deepB` | `0.60` | `.z` | Deep color — blue. |
| `specularPower` | `128.0` (32–256) | `.w` | Sun-glint tightness. |

## Foam & normals — `oceanMisc`

| Param | Default | Range | GPU slot | Effect |
|---|---|---|---|---|
| `foamStart` | `-0.5` | -1.0–0.0 | `.x` | Height where foam begins (relative to crest). |
| `waveNormalStr` | `0.7` | 0.0–1.0 | `.y` | Strength of wave normal perturbation (surface detail). |

---

← [index](./README.md) · related: [sky-atmosphere.md](./sky-atmosphere.md) · [terrain.md](./terrain.md)
