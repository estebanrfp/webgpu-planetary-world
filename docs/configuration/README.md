# Configuration Reference

OVGrid's entire look, feel and behaviour is **data-driven** from [`lib/config/`](../../lib/config) —
22 files re-exported through [`lib/config/index.js`](../../lib/config/index.js). This section
documents **every tunable parameter**: its default, range, unit, effect and source file. Edit a
value here and the change flows to the engine on the next build — most parameters need no code
changes at all.

> These pages are the *customization* reference. For the *architecture* of each system, see the
> system docs linked at the bottom of every page (e.g. the GPU physics grid, the rain treadmill,
> the weather model).

## Conventions

| Topic | Rule |
|---|---|
| **Distance unit** | **Kilometers (km)** are 1 world unit (`LENGTH_UNIT_IN_METERS = 1000`). So `0.001` = 1 m, `0.092` ≈ avatar height, `795.0` = planet radius. This is the Floating Origin frame — see [floating-origin-guide.md](../floating-origin-guide.md). |
| **Time unit** | **Seconds** everywhere (matches the smart contract for durations). |
| **Colors** | RGB in **0.0–1.0** floats, unless a comment says bytes (`0–255`, e.g. rock/texture colors). |
| **Angles** | **Radians**. |
| **Coordinate frame** | Y is **up**; planet center at `[0, -795, 0]`. |

## How a config reaches the engine

Three delivery paths — each page notes which one a value uses:

1. **Plain constant** — imported and read directly by a system (most configs).
2. **GPU uniform seed** — written into a uniform buffer the shader reads (e.g. `oceanConfig` → uniform slots 64–79; `atmosphereConfig` → cloud/sky uniforms).
3. **Runtime-editable** — exposed in the in-world **Debug panel** (`G` key) and persisted to `localStorage` (e.g. terrain generation params under `ovgrid_terrain_params`). Tune-here-only configs (ocean, lighting) are *not* in the UI.

A startup **performance profile** can override a few heavy toggles: append `?profile=low` to the URL (see [performance.md](./performance.md)).

## Pages by domain

| Page | Covers (`lib/config/*`) | What you tune |
|---|---|---|
| [world.md](./world.md) | `planetConfig`, `sceneConfig`, `physicsGridConfig`, `storageConfig` | Planet size, coordinate frame, the physics/collision grid, persisted state keys |
| [terrain.md](./terrain.md) | `terrainConfig` | Terrain generation (noise, biomes, colors), quadtree LOD, culling, textures |
| [sky-atmosphere.md](./sky-atmosphere.md) | `atmosphereConfig` | Clouds (3 layers), volumetric shadows, aurora, sky stylization, sun position |
| [ocean.md](./ocean.md) | `oceanConfig` | Waves, foam, water color (shallow/deep), reflections |
| [lighting-shadows.md](./lighting-shadows.md) | `lightingConfig`, `shadowConfig` | Sun/moon intensity, night floor, cascaded shadow maps |
| [weather.md](./weather.md) | `rainConfig`, `snowConfig`, `presets` | Rain/lightning, snowfall, weather & sky presets, autonomous sky |
| [vegetation.md](./vegetation.md) | `scatterConfig` | Palms, rocks, trees, flowers — density, reach, biome bands |
| [player.md](./player.md) | `avatarConfig`, `cameraConfig`, `movementConfig`, `vehicleConfig` | Avatar model, orbit camera, locomotion, vehicles |
| [interface.md](./interface.md) | `hudConfig`, `uiConfig`, `audioConfig` | Nameplates, debug flags, sounds & spatial audio |
| [performance.md](./performance.md) | `performanceProfiles`, `marketplaceConfig` | Quality profiles, marketplace/network tuning |

## Related system docs

[floating-origin-guide.md](../floating-origin-guide.md) ·
[GPU_PHYSICS_GRID.md](../GPU_PHYSICS_GRID.md) ·
[terrain-mesh.md](../terrain-mesh.md) ·
[clouds-performance.md](../clouds-performance.md) ·
[rain-system.md](../rain-system.md) ·
[culling-system.md](../culling-system.md) ·
[WEATHER_SYSTEM_PLAN.md](../WEATHER_SYSTEM_PLAN.md)
