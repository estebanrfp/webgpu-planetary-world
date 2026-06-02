# Sky & Atmosphere

Clouds, volumetric shadows (god rays), aurora, sky color grading and the sun. All in
[`lib/config/atmosphereConfig.js`](../../lib/config/atmosphereConfig.js) as `ATMOSPHERE_CONFIG` —
its fields seed the atmosphere/cloud GPU uniforms. The autonomous **weather system** overrides many
of these per-day from presets ([weather.md](./weather.md)). ← back to [index](./README.md) ·
performance: [clouds-performance.md](../clouds-performance.md).

---

## Clouds — global

| Param | Default | Range / Unit | Effect |
|---|---|---|---|
| `cloudsEnabled` | `true` | bool | Master cloud toggle. |
| `cloudCoverage` | `0.5` | 0.0–1.0 | How much sky is covered (Refined Hard-Shift scale). |
| `cloudSpeed` | `0.2` | × | Global drift-speed multiplier. |
| `cloudAltitude` | `4.0` | km | Cloud-layer altitude above sea level. |
| `cloudMaxAltitude` | `30.0` | km | Above this the clouds are disabled (perf). |
| `cloudFadeStart` | `3.0` | km | Altitude where clouds begin fading as you ascend. |
| `cloudFadeEnd` | `12.0` | km | Altitude where clouds are fully transparent. |
| `cloudShadowsEnabled` | `true` | bool | Cast cloud shadows on the ground. |
| `cloudShadowIntensity` | `0.1` | 1.0 clear → 0.1 dark | Darkness of cloud shadows. |

## Clouds — the three layers

Each layer is an independent noise sheet (primary / broad / stratospheric). Tune scale, speed,
threshold (lower = more cloud), coverage scale, opacity and RGB tint per layer.

| Layer | `…Scale` | `…Speed` | `…Threshold` | `…CoverageScale` | `…Opacity` | Tint (R,G,B) |
|---|---|---|---|---|---|---|
| **1 Primary** | `0.004` | `0.1` | `0.68` | `0.28` | `0.4` | `1.0, 1.0, 1.0` |
| **2 Broad** | `0.0025` | `0.15` | `0.71` | `0.26` | `0.4` | `1.0, 1.0, 1.0` |
| **3 Stratospheric** | `0.001` | `0.05` | `0.74` | `0.24` | `0.2` | `1.0, 1.0, 1.1` |

---

## Volumetric shadows (god rays)

| Param | Default | Effect |
|---|---|---|
| `volumetricShadowsEnabled` | `true` | Master toggle (disabled by the `low` perf profile). |
| `volumetricShadowSteps` | `4.0` | Ray-march sample count — quality vs cost. |
| `volumetricShadowMaxDist` | `15.0` | Max march distance (km). |
| `volumetricShadowAmbient` | `0.05` | Ambient floor inside shadow. |
| `volumetricShadowBias` | `0.0005` | Self-shadowing bias. |

## Sun

| Param | Default | Unit | Effect |
|---|---|---|---|
| `sunZenithAngleRadians` | `1.2` | rad | Sun height (when the day cycle is off). |
| `sunAzimuthAngleRadians` | `2.0` | rad | Sun compass direction. |
| `SUN_ANGULAR_RADIUS` | `0.00935 / 2` | rad | Apparent sun disc size (~0.26°). |
| `dayCycleEnabled` | `false` | bool | Animate the sun (the WeatherSystem/astronomical model usually drives this instead). |
| `dayCycleSpeed` | `1.0` | × | Day-cycle speed when enabled. |

---

## Sky stylization & exposure

| Param | Default | Range | Effect |
|---|---|---|---|
| `exposure` | `1.0` | fixed | Engine-wide exposure. **Not** user-adjustable — 1.0 reads a sunlit sky correctly; 2.0 washed textures out. |
| `skySaturation` | `1.0` | 0.0–2.0 | Sky color saturation. |
| `skyVibrance` | `0.0` | 0.0–1.0 | Selective saturation of muted tones. |
| `skyTintR/G/B` | `1.0` each | 0.0–2.0 | Per-channel sky tint. |

> Curated grades (cinematic, sunset, alien, cyberpunk…) live in `SKY_PRESETS` — see [weather.md](./weather.md).

## Aurora borealis (procedural)

| Param | Default | Range | Effect |
|---|---|---|---|
| `auroraIntensity` | `0.0` | 0.0–1.0 | Aurora strength (0 = off). |
| `auroraSpeed` | `0.5` | 0.0–2.0 | Curtain animation speed. |
| `auroraAltitude` | `0.5` | 0.0–1.0 | Curtain height on the sky dome. |
| `auroraBaseR/G/B` | `0.08, 0.95, 0.25` | rgb | Bottom color (green by default). |
| `auroraTopR/G/B` | `0.75, 0.08, 0.55` | rgb | Top color (magenta by default). |

## Weather flags (mirrored on the env state)

| Param | Default | Effect |
|---|---|---|
| `snowEnabled` | `false` | Snowfall on/off (see [weather.md](./weather.md)). |
| `rainIntensity` | `0.0` | Rain strength 0–1. |
| `stormEnabled` | `false` | Storm tier (heavy rain + lightning). |

---

← [index](./README.md) · related: [clouds-performance.md](../clouds-performance.md) · [weather.md](./weather.md) · [lighting-shadows.md](./lighting-shadows.md)
