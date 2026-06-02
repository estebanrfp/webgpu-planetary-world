# Weather System — Rain, Snow, Storm, Ambient

> Status: shipped 2026-05-20 (rain treadmill) → 2026-05-21 (snow, storm sky, audio, forecast tiers, local solar time).
>
> This doc started as the rain-only spec; it now covers the full weather pipeline. Section 1 is the original world-anchored treadmill technique (rain + snow particles); sections 2-7 cover everything we layered on top.

## Goal

Rain that reads as **anchored to the ground** in third-person view — when the avatar walks forward, drops drift past as if standing still in the world — while the visible volume **stays around the camera** so we never waste particles far away.

The previous implementation pinned each drop to a position in a disk centered on the camera. When the camera moved, the disk moved with it, so the drops moved with the camera too. From a third-person POV this read as "rain glued to my head", not as walking through real rain.

## Technique — treadmill tile-wrap

Each drop has a stable **world tangent position** (`baseX_m`, `baseZ_m`) computed from its instance index via golden-angle disk distribution. Per frame we accumulate the avatar's **tangent-plane displacement in metres** (`camOff_m`) on the planet's local tangent basis (`gridRight`, `gridForward`). The shader then renders the drop at its **visible position** relative to the camera:

```wgsl
visX_m = fract((baseX_m - camOffX_m) / (2 * R) + 0.5) * (2 * R) - R;
visZ_m = fract((baseZ_m - camOffZ_m) / (2 * R) + 0.5) * (2 * R) - R;
```

This is a tile-wrap of cell size `2 * R`. As the camera walks +X, every drop's visible X slides −X. When a drop would exit `[−R, +R]`, `fract` wraps it to the opposite side — it re-enters from the front while its old position fades out the back. The wrap happens **at the boundary where the radial fade is already 0**, so the jump is invisible.

The drop that "wraps" is effectively a new draw with the same seed at a new world point. To the player the disk feels continuously full and the rain feels anchored to the ground.

## Damping

A literal 1:1 anchor (drops slide at exactly the avatar's tangent speed) is physically correct but reads as "rain shot sideways" instead of falling — the brain treats fall + slide as a single diagonal motion vector. We multiply the per-frame tangent delta by `WORLD_ANCHOR_DAMPING = 0.1`:

```js
// mainPlanet.js, render loop
const deltaTangentX_m = (...) * 1000 * WORLD_ANCHOR_DAMPING;
```

At 0.1, walking at 5 m/s yields a 0.5 m/s slide — barely 1° off vertical in the combined vector, but enough that you see drops drift past as you walk. The treadmill cue is preserved without compromising the perception of fall. Adjust between 0.05 (almost camera-locked) and 0.5 (very pronounced slide).

## Avatar position, not camera position

The accumulator tracks `pos` (from `physicsSystem.getPosition()`), **not** `cam.position`. The third-person camera orbits around the avatar — using camera deltas would slide the drops every time the player rotates the view without actually walking. Avatar position only changes when the avatar physically moves, which is the correct trigger.

## Tunables

In [`lib/config/rainConfig.js`](../lib/config/rainConfig.js):

| Field | Current | Effect |
|---|---|---|
| `baseSpawnRadius` | 40 m | Radius of the visible disk (centered on camera). Core visible area is the inner ~50% (the outer half is faded by `farFade`). |
| `baseSpawnHeight` | 40 m | Half-height of the cylinder. Fall cycle = `2 * H / fallSpeed` ≈ 2.9 s — taller columns make drops linger and read as falling slower. |
| `particleCount` | 25 000 | Total drops. Density at the current volume = `particleCount / (π * R²)` ≈ 4.97 drops/m² — the floor for the rain to read as "heavy" instead of drizzle. |
| `baseFallSpeed` | 28 m/s | Vertical fall speed. Real terminal velocity is ~9 m/s; we use 28 because faster drops read as stormier. |

In [`mainPlanet.js`](../mainPlanet.js) (`WORLD_ANCHOR_DAMPING`):

| Damping | Visual |
|---|---|
| 0.05 | Almost camera-locked (very subtle drift) |
| **0.1** (current) | Treadmill cue clearly visible, fall reads as vertical |
| 0.3 | Pronounced slide; fall feels diagonal |
| 1.0 | Physical truth; reads as "shot sideways" |

## Volume sizing

Density should be ~5 drops/m² for the rain to read as "heavy"; less than 1 drop/m² reads as drizzle. Particle count scales with R² to maintain density:

```
particleCount ≈ density_target * π * R²
```

Examples (at 5 drops/m²):
- **R=40 m → 25 k particles** ← shipped (matches the original Peter-Adams port density, plus the world-anchor wrap)
- R=60 m → 56 k particles
- R=100 m → 157 k particles
- R=250 m → 982 k particles (overkill — disk follows the camera, no point spawning drops 250 m away)

The visible disk does **not** need to be large for the rain to feel "everywhere" — the tile wrap creates the illusion of infinite rain. The disk only needs to be wide enough that the visible "edge fade" (at `farFade` = 0) is beyond the camera's near-foreground view. With third-person camera ~4 m behind the avatar, R=40 m gives ~36 m of visible rain in front of the avatar, which feels generous.

## Performance

Measured at 25 k particles, R=40 m, h=40 m on Apple M-class:

| Stage | Cost |
|---|---|
| CPU per frame | ~25 FLOPS (avatar delta, basis projection, modulo wrap, single multiplication) |
| GPU vertex | 150 k invocations × ~180 ALU ops = ~27 M ops/frame → 1.6 GFLOPS @ 60 fps |
| GPU fragment | ~250 k pixel updates/frame, overdraw ~0.07× — negligible |
| Memory | 128-byte uniform buffer |

Of an Apple M1 integrated GPU (2.6 TFLOPs): **~0.06 %**. Of a discrete RTX 3060 (13 TFLOPs): **~0.012 %**. The rain is not on the performance budget.

Drop count scales automatically with intensity: `currentParticleCount = ceil(maxParticles * rainIntensity)`. Light rain costs proportionally less than heavy rain.

This is the **practical equilibrium** — going lower (R < 30, or particles < 15 k) starts to read as drizzle, and the marginal GPU saving is invisible against the terrain/atmosphere/cloud workload that dominates the frame. Free-perf knobs that don't affect visual quality (triangle-strip instead of triangle-list, simpler hash) save another ~30 % of an already-negligible cost; not worth the surface-area change unless explicitly profiling.

## Files

- [`lib/shaders/rain.wgsl.js`](../lib/shaders/rain.wgsl.js) — the WGSL vs/fs shaders. The wrap math is in `vs_main`, around the `camOffX_m` / `camOffZ_m` block.
- [`lib/systems/RainSystem.js`](../lib/systems/RainSystem.js) — uniform buffer construction, lightning state machine, audio loop. The `cameraPos` slot at offset 28 carries the world-anchor offset.
- [`lib/config/rainConfig.js`](../lib/config/rainConfig.js) — all rain tunables (volume, particle count, fall speed, lightning).
- [`mainPlanet.js`](../mainPlanet.js) — the render loop. The `gridData` block (search "World-anchored rain") computes the avatar-tangent accumulator and damping; the `R` key toggles `forceRain` for testing.

## Snow particles — same technique, different look

The snow shader ([`lib/shaders/snow.wgsl.js`](../lib/shaders/snow.wgsl.js)) is now a 1:1 clone of the rain world-anchored treadmill, swapping streak math for soft circular flakes. Differences from rain that are purely cosmetic:

- **Flake motion**: per-flake gentle spiral that opens to ~1.5 m at mid-fall and closes again at top and ground, plus a side-to-side wobble on top — ported from `reference/ovgrid-webgpu`. Reads as drifting much more naturally than a single sine.
- **Size tiers**: three discrete bins (60 % small / 30 % medium / 10 % large) — real snow is mostly tiny dust with the occasional fat flake; uniform sampling looks too "uniform-sized".
- **Sparkle**: fragment adds a `pow(1 − dist, 3) · 0.3` highlight at the centre of every flake. Subtle but lifts each one from a flat disc.
- **Slower fall**: `baseFallSpeed = 5 m/s` (vs rain's 28) — closer to real terminal velocity, gives drifting feel.

Snow reads from the same `gridData.rainCamOffsetMeters` field as rain (was previously consuming the structurally-zero `localCamOffset`, which is why pre-rework snow looked camera-locked even though the wrap math was already there). Config in [`lib/config/snowConfig.js`](../lib/config/snowConfig.js): same scale as rain (R=40 m, h=40 m), `particleCount: 6000` — snow flakes are an order of magnitude bigger on screen than rain streaks, so a quarter of rain's density reads with the same perceptual fullness.

## Snow accumulation on terrain

A separate effect from the falling flakes: when `globals.rainParams.z` (snowIntensity) is non-zero, the terrain fragment shader paints a procedural snow cover. Lives in [`lib/shaders/terrain.wgsl.js`](../lib/shaders/terrain.wgsl.js) right after lighting, before aerial perspective. The build-up is gated by:

- **`snowLandMask = smoothstep(-0.0001, 0.0001, in.rawHeight)`** — zero in the ocean, one on land, smooth at the shoreline so the beach edge fades to bare sand.
- **`horizontalSnow = pow(dot(detailNormal, p), 3.5)`** — accumulates on flat ground, leaves cliffs and steep faces bare.
- **Two-scale patch noise** breaks up the uniform white wash so it doesn't look painted.
- **`snowCoverage = pow(snowIntensity, 2) · horizontalSnow · snowPatch · snowLandMask`** clamped to 0.92 so peaks of rock/grass still poke through.

The `pow(snowIntensity, 2)` term makes the cover *build up* gradually as the autonomous lerp ramps in — at intensity 0.5 the visual is 25 %, at 0.8 it's 64 %. Combined with the env→targetEnv lerp upstream (~3.7 s), pressing Ñ goes through a "dusting → light cover → full mantle" sequence instead of a hard plateau. ~80 ALU ops per land terrain fragment, gated. Negligible.

## Rain splashes on terrain

The terrain shader also paints animated rain-impact ripples on the ground when `rainIntensity > 0.01`. Procedural — no particles. Lives in [`lib/shaders/terrain.wgsl.js`](../lib/shaders/terrain.wgsl.js) just before the snow block. Key tunables and their current values:

| Field | Current | What it controls |
|---|---|---|
| `splashGridSize` | 18 m | Spacing — 1 splash per ~320 m². Smaller = denser field of dots. |
| `maxRadius` (ripple) | `4 + idx · 3` m | Per-ripple max expansion (4 m for the first ripple, 7 m for the second). |
| `impactRadius` | `0.8 · life` m | Centre-dot diameter at the moment of impact. |
| `splashRange` | 1 km | Intentionally wider than the rain disk so distant terrain stays "wet". |

Impact glisten contributions were dialled back (`* 4` from `* 10`; sparkle from `* 200` to `* 60`) so the centre dots read as subtle wet specks instead of white spotlights. The final colour is multiplied by `pow(rainIntensity, 2)` so the splash field fades out in ~1 s when rain stops, instead of waiting for the underlying ripple animation to play through.

## Storm sky — flashes, tinting, sky-bolt

Lives in [`lib/shaders/atmosphere.wgsl.js`](../lib/shaders/atmosphere.wgsl.js). Three independent effects gated by `globals.rainParams.x` (rainIntensity acting as a "storminess" knob, equivalent to the reference's `skyDarkening`):

1. **Multi-layer cloud glow** around the active lightning strike. Four concentric cones in angular space (core / inner / outer / ambient) scaled by `cloudInfluence = density²`. Reads as "a flash lit up half the cloud ceiling" instead of a flat ball. The flash direction is built from the strike's azimuth + a fixed +0.25 elevation — the raw strike is on the ground, so naively normalizing points the glow at the horizon floor; we lift it into the sky.
2. **Daytime-aware storm tint** — five-step recipe: darken → partial desaturate → push toward steel-blue → contrast tweak → night-only extra dim. The `isDaytime` factor (smoothstep on current sky brightness) gates the gray wash so night storms stay correctly dark instead of beige fog. Applied to `final_radiance` before artistic stylization.
3. **Procedural sky bolt** — zigzag rendered as a vertical line in the sky shader so the lightning is visible from any distance (the particle bolt fades by ~100 m). All angles computed in the avatar's LOCAL tangent frame (not world Y/X/Z) — without this the bolt comes out tilted/horizontal as the avatar walks around the planet's curvature. Gated by `stormFactor > 0.3` so it only appears during heavy rain.

`RAIN_CONFIG.lightning.strikeRadius` is **2 km** (down from the original 10 km). Strikes 10 km away render as a 1-pixel line on the horizon; 2 km makes them clearly visible while still feeling distant.

## Weather forecast — 3 rain tiers + snow + cloud states

`WeatherSystem.forecast(avatarNormal, worldDay, seasonName)` ([`lib/systems/WeatherSystem.js`](../lib/systems/WeatherSystem.js)) returns one of seven categories matched 1:1 to icons in the calendar ([`lib/ui/CalendarUI.js`](../lib/ui/CalendarUI.js)):

| Category | Icon | When |
|---|---|---|
| `clear` | ☀️ | clouds < 15 % |
| `partly` | ⛅ | clouds 15–50 % |
| `cloudy` | ☁️ | clouds > 50 % without precipitation |
| `drizzle` | 🌦️ | blendedRain 0.05–0.5 (any season) |
| `heavy` | 🌧️ | blendedRain > 0.5 without storm flag (spring/autumn) |
| `storm` | ⛈️ | precip > 0.5 AND `stormEnabled` (summer) |
| `snow` | 🌨️ | precip > 0.5 AND `snowEnabled` (winter) |

The classification mirrors the same blend `update()` applies, so the calendar icon always matches what the engine renders for that day.

## Force-rain cycle (R) and force-snow toggle (Ñ)

Pressing **R** cycles `forceRainMode` through `0 → 1 → 2 → 3 → 0`:

| Mode | Preset basis | rainIntensity | Exposure | Sky tint | Lightning |
|---|---|---|---|---|---|
| 1 — Drizzle | `WEATHER_PRESETS.normal` | 0.5 | 1.6 | 0.92 / 0.94 / 0.98 | off |
| 2 — Moderate | `WEATHER_PRESETS.rain` | 0.7 | 1.4 | 0.80 / 0.85 / 0.93 | off |
| 3 — Storm | `WEATHER_PRESETS.storm` | 0.9 | 1.3 | 0.72 / 0.78 / 0.90, sat 0.25 | on |

Each tier writes a *complete* `targetEnv` so the look matches the strength: drizzle stays bright with thin clouds, moderate rain greys the sky, storm brings the full thunderhead. The env↔targetEnv lerp does the smooth fade (~3 s) between tiers. A persistent HUD chip shows the current tier.

**Ñ** toggles `forceSnow` on/off, applying `WEATHER_PRESETS.snow` with a slightly muted cool sky. Snow and rain modes are mutually exclusive — entering one clears the other.

## Local solar time

The HUD/calendar shows `localTimeOfDay`, **not** the global `timeOfDay` ([`lib/systems/WorldClock.js`](../lib/systems/WorldClock.js)). Reason: the planet rotates in world space, so an avatar at longitude L sees the sun at a different sky position at the same wall-clock instant than an avatar at longitude L + π. The calendar would otherwise show "14:53" while the local sun is at midnight (and vice versa).

```js
const avatarLong = Math.atan2(avatarNormal[2], avatarNormal[0]);
let delta = ((sunAzimuth - avatarLong) % TAU + TAU) % TAU;
localTimeOfDay = (12 + delta / TAU * 24) % 24;
```

Noon = sun crosses the avatar's meridian; afterwards localTime advances toward 18 (sunset), 24/0 (midnight), 6 (sunrise). The global `timeOfDay` is still exposed via `worldClock.timeOfDay` for systems that need a shared planet-wide clock.

## Audio

All audio assets are bundled local under [`assets/sounds/`](../assets/sounds/) (bundling avoids a runtime fetch as a single point of failure). Four loops, one one-shot:

| File | Used by | Trigger | Volume scaling |
|---|---|---|---|
| `Rain/rain.mp3` (light rain) | RainSystem | `rainIntensity > 0.1` | Master × (1 − stormBlend) |
| `Rain/storm.mp3` (heavy rain + wind) | RainSystem | same | Master × stormBlend |
| `Rain/thunder.mp3` | AudioManager via RainSystem lightning strikes | per-strike one-shot, spatial | Per AUDIO_CONFIG override |
| `Snow/snow.mp3` (cold wind) | SnowSystem | `snowIntensity > 0.1` | `intensity * 0.4` |
| `Beach/beach.mp3` (trees + breeze) | mainPlanet | terrainAltitude near sea level | Fade-in 0-3 m, off above 25 m |

`stormBlend = smoothstep(0.5, 0.8, rainIntensity)` crossfades between the light rain and heavy rain+wind tracks, so transitioning between R-modes (drizzle ↔ moderate ↔ storm) blends instead of stuttering.

## Files

- [`lib/shaders/rain.wgsl.js`](../lib/shaders/rain.wgsl.js) — rain particle shader + lightning particle bolt.
- [`lib/shaders/snow.wgsl.js`](../lib/shaders/snow.wgsl.js) — snow particle shader (same wrap technique as rain).
- [`lib/shaders/terrain.wgsl.js`](../lib/shaders/terrain.wgsl.js) — splash effects on terrain + snow accumulation.
- [`lib/shaders/atmosphere.wgsl.js`](../lib/shaders/atmosphere.wgsl.js) — storm sky tint, multi-layer cloud glow, procedural sky bolt.
- [`lib/systems/RainSystem.js`](../lib/systems/RainSystem.js) — rain uniform buffer, lightning state machine, dual rain audio (light + storm crossfade).
- [`lib/systems/SnowSystem.js`](../lib/systems/SnowSystem.js) — snow uniform buffer, cold-wind audio.
- [`lib/systems/WeatherSystem.js`](../lib/systems/WeatherSystem.js) — autonomous FBM-driven weather + `forecast()` for the calendar.
- [`lib/systems/WorldClock.js`](../lib/systems/WorldClock.js) — global + local solar time, sun/moon orbits.
- [`lib/config/rainConfig.js`](../lib/config/rainConfig.js), [`snowConfig.js`](../lib/config/snowConfig.js), [`audioConfig.js`](../lib/config/audioConfig.js), [`presets.js`](../lib/config/presets.js) — tunables.
- [`lib/ui/CalendarUI.js`](../lib/ui/CalendarUI.js) — calendar HUD + 4×7 grid with per-day forecast icons.
- [`mainPlanet.js`](../mainPlanet.js) — R/Ñ key cycle, beach ambient, env↔targetEnv lerp, force-mode overrides.
- [`assets/sounds/Rain/`](../assets/sounds/Rain/), [`Snow/`](../assets/sounds/Snow/), [`Beach/`](../assets/sounds/Beach/) — bundled local audio.

---

## Related — Planetary rendering

Part of OVGrid's planetary-rendering research set:

- [floating-origin-guide.md](floating-origin-guide.md) — Float64 CPU → camera-relative Float32 GPU (jitter-free up to LOD 22)
- [terrain-mesh.md](terrain-mesh.md) — procedural planetary terrain (quadtree + LOD)
- [culling-system.md](culling-system.md) — hybrid CPU + GPU culling
- [clouds-performance.md](clouds-performance.md) — GPU-baked triple-layer clouds

See also [WEATHER_SYSTEM_PLAN.md](WEATHER_SYSTEM_PLAN.md) (design) — this doc is the shipped implementation.

← back to the [README](../README.md#documentation)
