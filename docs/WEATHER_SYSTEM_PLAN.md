# Autonomous Weather System — Design & Implementation Plan

> Status: implemented (Phases 1–3). Drafted 2026-05-18, shipped 2026-05-19.

## Goal

Replace the manual Environment weather panel with an **autonomous, planetary,
localized, seasonal** weather system. Weather generates itself, happens in
specific zones of the world tied to the avatar's presence, and changes or
clears as the avatar walks. The `v` panel is kept, but becomes a
**preset-authoring tool**, not the runtime source of truth.

## Implemented (2026-05-19)

Phases 1–3 shipped. The defects below (frozen sun, phaseless moon) are fixed,
and the manual weather described in "Current state" is now the authoring path,
not the runtime one.

- **`WorldClock`** (`lib/systems/WorldClock.js`) — astronomical clock derived
  from the real wall clock: world-space sun arc, moon orbit + phases, season by
  latitude. Exposes `localCalendar(lat)` (season, day-in-season, year),
  `moonPhaseAt(day)`, `seasonAt`, `climateBandAt`. Dials: day = 20 min,
  season = 28 days, year = 112 days, lunar cycle = 7 days.
- **`WeatherSystem`** (`lib/systems/WeatherSystem.js`) — autonomous controller.
  A drifting 4-octave FBM front is sampled at the avatar; each season owns a
  profile (`SEASON_DECKS`: a calm and an active preset plus `onset` / `range` /
  `precipOnset`) onto which the noise maps. Calibrated against the real noise
  field for Stardew-like seasons — summer ~80 % clear, winter snow-dominated,
  autumn a grey transition, spring temperate. Clear days take a colour from a
  5-stop harmonic sky palette. `forecast(pos, day, season)` reuses the same
  deterministic field, so the calendar predicts exactly what each day brings.
- **`CalendarUI`** (`lib/ui/CalendarUI.js`) — an always-on date widget (HUD,
  top-right) and an in-world calendar panel: a 4×7 month grid (one season),
  season tabs, the current day highlighted, a weather forecast icon per day.
- **Camera-facing panels** — `HtmlPanelSystem` gained a `'camera'` anchor mode
  (eye-line anchored, eased with inertia); the calendar opens with it.
- **Time-scale-aware transitions** — the env→targetEnv smoothing scales with
  the time scale, so accelerated time fast-forwards weather to match.

Differs from the original design: the WeatherSystem does **not** draw a preset
per day via `hash(day, region)` (§7). Instead each season blends a fixed
calm→active pair by the continuous FBM factor — simpler, and it gives smooth
moving fronts for free. The hash-draw deck remains a possible future layer.

## Current state (today)

- Weather is **global and manual**: an `env` object (plus a `targetEnv` mirror
  for smooth transitions via `WEATHER_TRANSITION_RATE`, ~2 %/frame) driven by
  the `v` panel (`EnvironmentUI.js`).
- Sky/atmosphere (`AtmosphereSystem.js`): precomputed scattering, global.
- Clouds: a noise texture baked at init; a single global `cloudCoverage` scalar.
- Rain (`RainSystem.js`, 196 k particles) and snow (`SnowSystem.js`, 5 k): GPU
  particles **already centered on the camera** (~100 m radius).
- Lightning: a subsystem inside `RainSystem`.
- `WEATHER_PRESETS` and `SKY_PRESETS` exist but are partial (subset of fields)
  and divorced from each other.

## Known defects to fix (verified in code)

- **Sun**: the day/night cycle (`mainPlanet.js:964-970`) only advances the
  azimuth — the sun's height is frozen, so it circles horizontally with no real
  diurnal arc (sunrise low → noon high → sunset low).
- **Moon** (`AtmosphereSystem.js:251-257`): computed as the exact opposite of
  the sun (`azimuth + π`, inverted zenith). It is therefore always full —
  phases are impossible. The moon needs its own orbit.

## Design — the mechanism (8 pieces)

### 1. Weather preset schema

A preset = a complete, curated climate + sky state. ~32 fields:

- **Clouds (14)**: `cloudCoverage`, `cloudSpeed`, `cloudLayer1/2/3Opacity`,
  `cloudLayer1/2/3 R/G/B`.
- **Precipitation (3)**: `rainIntensity`, `snowEnabled`, `stormEnabled`.
- **Sky (6)**: `exposure`, `skySaturation`, `skyVibrance`, `skyTint R/G/B`.
- **Aurora (9)**: `auroraIntensity`, `auroraSpeed`, `auroraAltitude`,
  `auroraBase R/G/B`, `auroraTop R/G/B`.

Each numeric field accepts a **fixed value OR a range `[min, max]`**. Ranges are
resolved per `(day, zone)` with a deterministic hash → variety (no two storms
identical) while staying reproducible.

Out of the preset: sun position (astronomical model), God Rays (global
performance setting), ocean. Each preset must be **complete** (all fields),
never partial.

### 2. Calendar

- Time is **derived, not accumulated**: `worldTime = (now − EPOCH) × scale`.
  No drift, multiplayer-safe by construction.
- Two angles govern everything: `rotation` (day) and `orbit` (year), kept in
  `[0, 2π)` → immune to Float32 precision loss.
- Fixed dials: **day = 20 min real**, **season = 28 days** (4 weeks),
  **year = 112 days** (4 seasons), **axial tilt = 23.5°**,
  **lunar cycle = 7 days** (one per week). All configurable in one place.

### 3. Seasons + probability table

- The **local season** is derived from `(latitude, orbit)` — opposite
  hemispheres, temperate equator, extreme poles. Not stored, computed.
- 4 discrete seasons with a ~1-day smooth transition.
- Each season has a weighted "deck" of presets; each day, each region draws one
  via `hash(day, region)` — deterministic and reproducible.
- Climate driven by season/latitude for now; biomes (terrain influences the
  deck) are a later layer.

### 4. Astronomical model

- **Solar declination** `= 23.5° × sin(orbit)` — drives all seasonal mechanics.
- **Sun direction** `= f(latitude, declination, rotation)` → real diurnal arc.
- Emerges for free: variable day length, midnight sun, polar night.
- Replaces the toy sun + `dayCycle`.

### 5. Moon + phases

- A third clock: the lunar orbit, derived from `worldTime`.
- Moon position computed like the sun; **phase** = angle between the
  moon→planet and sun→planet directions (new / quarters / full).
- The lunar cycle also gives the calendar a natural "month".

### 6. Spatial weather field

- An FBM noise field over the planet surface; low frequency → large cells.
- A time-drift term → fronts move on their own.
- Modulates **local intensity** (0..1), interpolating between "clear" and the
  day's preset, so the avatar walks in and out of showers.

### 7. WeatherSystem controller

Per frame, for the avatar position:

1. `worldClock` → day, hour, orbit.
2. Avatar latitude → local season.
3. Region + day → `hash` → the day's preset (from the season's deck).
4. FBM field at the exact position → local intensity factor.
5. Resolve the preset's ranges with `hash(day, zone)` → concrete values.
6. Blend preset × intensity, smooth region borders.
7. Write `targetEnv` → the existing transition does the fade.

It is the only writer of `targetEnv` in autonomous mode — replacing the panel
callbacks as the source of truth.

### 8. Panel: auto / authoring

A toggle: **auto** (the `WeatherSystem` drives) / **authoring** (the panel
drives, for curating presets without the system overwriting values). Add a snow
checkbox to the Weather tab and an "Export preset" button that dumps the current
state in the 32-field schema.

## Implementation plan — phases

> Phases 1–3 are complete (see "Implemented" above). Phase 4 remains future work.

### Phase 1 — Preset schema + authoring panel

- Redesign `lib/config/presets.js`: `WEATHER_PRESETS` with the complete 32-field
  schema; each numeric field accepts `value` or `[min, max]`. Rebuild the
  existing presets as complete presets.
- `lib/ui/EnvironmentUI.js`: add the snow checkbox and the "Export preset"
  button.
- Deliverable: the panel produces and exports well-formed presets — unblocks
  climate authoring.

### Phase 2 — `WorldClock` (clock + astronomical model)

- New module `lib/systems/WorldClock.js`: time derived from the real clock;
  three angles (rotation, orbit, lunar orbit).
- Astronomical model: solar declination, real sun arc, moon position + phase,
  local season by latitude.
- Query API (`season`, `timeOfDay`, `isNight`, `sunElevation`, `moonPhase`,
  `seasonAt(lat)`…) and events (`dayChange`, `seasonChange`, `sunrise`…).
- Replace: the `dayCycle` (`mainPlanet.js:964-970`) and the sun/moon
  computations (`AtmosphereSystem.js:213-217` and `251-257`).
- Deliverable: real day/night with a sun arc, moon phases, seasons by latitude.

### Phase 3 — `WeatherSystem` (autonomous controller)

- New module `lib/systems/WeatherSystem.js`: per-season probability decks,
  deterministic `hash(day, region)` draw, FBM weather field (cells + front
  drift), range resolver, per-frame assembly that writes `targetEnv`.
- The auto / authoring toggle in the panel.
- Wire `WorldClock.update()` and `WeatherSystem.update()` into the
  `mainPlanet.js` render loop.
- Deliverable: autonomous, localized, seasonal weather in production.

### Phase 4 — (future, optional)

- Localized clouds visible at a distance (weather field on the GPU).
- **Latitudinal biomes** — driven by `WorldClock.climateBandAt(latitude)`, the
  shared per-latitude warmth signal:
  - terrain biome colour shifts toward snow near the poles and toward
    desert/sand in hot bands (Guild Wars 2-style world zones);
  - the weather probability deck (terrain/biome influences the draw);
  - later, biome-specific vegetation (snowy tree variants, etc.).

## Reused untouched

`RainSystem`, `SnowSystem` (particles already camera-local), the
`targetEnv` / `WEATHER_TRANSITION_RATE` smoothing, the `AtmosphereSystem` core
and scattering, `parcelPicker` (avatar latitude/region).

## Performance

The clock, the astronomical model and the weather field are all evaluated at a
**single point** (the avatar) — a handful of operations per frame, negligible
cost. The precipitation particles already live within ~100 m of the camera, so
the area of effect is small by design. The autonomous system adds no
appreciable load. Localized clouds (Phase 4) are the only GPU-side cost.

## Implementation constraints

Every change must respect the existing engine architecture and the research
already captured in `docs/`. The aim is to *improve* — performance included —
without disturbing anything that already works. Before modifying a subsystem,
consult its reference document:

- `docs/floating-origin-guide.md` — camera-relative coordinates. The
  astronomical model computes sun, moon and weather positions; all of it must
  stay in the floating-origin frame, never absolute world space.
- `docs/clouds-performance.md` — cloud rendering cost. The weather field must
  not regress cloud performance; localized clouds (Phase 4) must follow it.
- `docs/culling-system.md` — visibility culling, for any new billboards or
  particles.
- `docs/GPU_PHYSICS_GRID.md` — the GPU height grid, if weather ever touches the
  terrain surface.
- `docs/architectural-report.md`, `docs/terrain-mesh.md` — overall structure.

Shadows (volumetric God Rays, cascaded shadow maps, cloud shadows) keep their
current behavior — the new astronomical sun feeds them exactly as the manual
sun does today; only the *source* of the sun direction changes.

Principles:

- **Do not alter working behavior.** The sun/moon swap and the `dayCycle`
  replacement must be clean substitutions on the current render path.
- **Reuse, do not duplicate** — `targetEnv` smoothing, camera-local particles,
  `AtmosphereSystem`, `parcelPicker` are existing infrastructure.
- **Performance is a deliverable** — the autonomous system must match or beat
  the current cost, never add to it.
