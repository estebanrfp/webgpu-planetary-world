# Weather

Rain & lightning, snowfall, and the curated **presets** the autonomous weather system distributes
across the world. ← back to [index](./README.md) · architecture: [rain-system.md](../rain-system.md) ·
[WEATHER_SYSTEM_PLAN.md](../WEATHER_SYSTEM_PLAN.md).

---

## `rainConfig.js` — rain & lightning

A world-anchored particle "treadmill": a small disk of drops centered on the camera, drops re-enter
from the opposite side as you walk so it reads as rain everywhere at a fraction of the cost.
**Source:** [`lib/config/rainConfig.js`](../../lib/config/rainConfig.js).

| Param | Default | Unit | Effect |
|---|---|---|---|
| `particleCount` | `25000` | drops | ~5 drops/m² at R=40 m. |
| `baseFallSpeed` | `28.0` | m/s | Fall speed (stormier than the 12 m/s reference). |
| `baseLength` | `0.5` | m | Streak length. |
| `baseWidth` | `0.025` | m | Streak width (2.5 cm). |
| `baseSpawnRadius` | `40.0` | m | Disk radius around the camera. |
| `baseSpawnHeight` | `40.0` | m | Spawn height above/below (cycle ≈ 80 m / 28 ≈ 2.9 s). |
| `windStrength` | `0.8` | — | Horizontal jitter amplitude. |
| `color` | `[0.8, 0.85, 0.95]` | rgb | Bright blue-white. |
| `opacity` | `0.7` | 0–1 | Base drop opacity. |

### Lightning (`lightning`)

| Param | Default | Effect |
|---|---|---|
| `minBurstInterval` / `maxBurstInterval` | `4.0` / `15.0` s | Time between lightning bursts. |
| `minFlashesPerBurst` / `maxFlashesPerBurst` | `2` / `4` | Flashes per burst. |
| `flashDuration` / `flashGap` | `0.1` / `0.08` s | Flash timing. |
| `flashIntensity` | `1.8` | Flash brightness. |
| `boltDuration` | `0.22` s | Visible bolt lifetime. |
| `thunderDelayMin` / `thunderDelayRange` | `0.01` / `0.2` s | Delay before thunder. |
| `thunderChance` | `0.98` | Probability thunder follows a strike. |
| `branchCount` | `8` | Bolt branch complexity. |
| `strikeRadius` | `2.0` km | How near strikes land (close enough to read clearly). |
| `cloudGlowRadius` | `10.0` km | Radius of the cloud flash glow. |
| `boltGlowWidth` | `0.055` | Atmospheric glow width. |
| `audio.rainVolume` | `0.5` | Rain loop volume. |

---

## `snowConfig.js` — snowfall

Uses the **exact same world-anchored treadmill** as rain — only the flake shape and fall speed
differ. Values are in **km** by historical convention (the shader ×1000 to metres).
**Source:** [`lib/config/snowConfig.js`](../../lib/config/snowConfig.js).

| Param | Default | Unit | Effect |
|---|---|---|---|
| `particleCount` | `6000` | flakes | ~1.2 flakes/m² (a quarter of rain). |
| `baseSpawnRadius` | `0.040` | km | 40 m disk around the camera. |
| `baseSpawnHeight` | `0.040` | km | 40 m above/below (cycle ≈ 80 m). |
| `baseFallSpeed` | `5.0` | m/s | Faster than real snow so the fall stays visible (cycle ≈ 16 s). |
| `color` | `[1.0, 1.0, 1.0]` | rgb | Pure white. |
| `opacity` | `0.9` | 0–1 | Flake opacity. |
| `maxAltitude` / `minAltitude` | `10.0` / `0.0` | km | Legacy thresholds (intensity now driven by the WeatherSystem). |

---

## `presets.js` — weather, sky & autonomous scheduling

A preset is a complete climate + sky state (32-field schema) the weather system distributes. The
sun is **not** part of a preset — the astronomical model drives it.
**Source:** [`lib/config/presets.js`](../../lib/config/presets.js).

### `WEATHER_PRESETS`

Six curated states. Each sets cloud coverage/speed, the three layer opacities & tints, and the
precipitation flags, then spreads `NEUTRAL_SKY`.

| Preset | `cloudCoverage` | `cloudSpeed` | Precipitation |
|---|---|---|---|
| `clean` | `0.0` | 0.3 | none |
| `normal` | `0.5` | 0.5 | none |
| `storm` | `1.0` | 2.0 | `rainIntensity 1.0`, `stormEnabled` |
| `snow` | `0.85` | 0.4 | `snowEnabled` |
| `rain` | `0.95` | 0.8 | `rainIntensity 0.8` |
| `overcast` | `1.0` | 0.15 | none |

### `SKY_PRESETS` (cinematic color grades)

Ten grades over `skySaturation` / `skyVibrance` / `skyTint{R,G,B}`: `reset`, `cinematic`, `alien`,
`blood`, `midnight`, `sunset`, `vintage`, `cyberpunk`, `noir`, `gold`.

### `AUTONOMOUS_SKY`

| Param | Default | Effect |
|---|---|---|
| `everyNDays` | `6` | Average spacing between "special sky" days (~1/N chance per day). |
| `pool` | `['cinematic','sunset','gold','midnight','vintage','alien','cyberpunk','blood']` | Which `SKY_PRESETS` can surprise the player on a special day. |

---

← [index](./README.md) · related: [rain-system.md](../rain-system.md) · [WEATHER_SYSTEM_PLAN.md](../WEATHER_SYSTEM_PLAN.md) · [sky-atmosphere.md](./sky-atmosphere.md)
