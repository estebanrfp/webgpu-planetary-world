# World & Planet

The physical frame of the world: planet dimensions, the camera-following physics grid, scene
collider sizes and the keys used to persist state. ← back to [index](./README.md)

---

## `planetConfig.js` — physical constants

The single source of truth for the planet's size and coordinate system. Changing `PLANET_RADIUS`
rescales gravity, atmosphere and the whole Floating Origin frame, so treat it as a foundational
constant. **Source:** [`lib/config/planetConfig.js`](../../lib/config/planetConfig.js).

| Constant | Default | Unit | Effect |
|---|---|---|---|
| `PLANET_RADIUS` | `795.0` | km | Planet radius. Matches the atmospheric scattering model; drives gravity scale and horizon. |
| `EARTH_RADIUS` | `= PLANET_RADIUS` | km | Legacy alias. |
| `EARTH_CENTER` | `[0, -795, 0]` | km | Planet center in world space (Y is up), i.e. the surface sits at the origin. |
| `LENGTH_UNIT_IN_METERS` | `1000.0` | m | 1 world unit = 1 km. The conversion behind every "km" value in these docs. |

---

## `physicsGridConfig.js` — the collision "treadmill"

A GPU-baked grid of terrain heights that follows the avatar, giving exact ground for collision,
camera and NPC swim/walk. It is a 64×64 grid at 8 m spacing (512 m square) that re-bakes when the
avatar drifts 200 m from its center. **Source:** [`lib/config/physicsGridConfig.js`](../../lib/config/physicsGridConfig.js).
**Architecture:** [GPU_PHYSICS_GRID.md](../GPU_PHYSICS_GRID.md).

| Field | Default | Unit | Effect |
|---|---|---|---|
| `GRID_SIZE` | `64` | points | Grid resolution per side (64×64 = 4 096 sample points). |
| `GRID_SPACING` | `8.0` | m | Distance between sample points. |
| `GRID_HALF_SIZE` | `256.0` *(derived)* | m | Half the coverage — the **precise-ground radius** around the avatar (used for NPC LOD). |
| `GRID_COVERAGE` | `512.0` *(derived)* | m | Full square side. |
| `REBAKE_THRESHOLD_M` | `200.0` | m | Avatar drift that triggers a fresh bake (safe margin inside the 256 m radius). |
| `MAX_BAKE_ALTITUDE_M` | `500.0` | m | Only bake within this altitude of the surface (starts early for a smooth landing). |
| `WORKGROUP_SIZE` | `8` | — | Compute workgroup size; `DISPATCH_GROUPS = GRID_SIZE / 8 = 8`. |

> Buffer sizes (`HEIGHTS_BUFFER_SIZE`, `NORMALS_BUFFER_SIZE`, `TOTAL_BUFFER_SIZE`) and
> `DISPATCH_GROUPS` are **derived getters** — they recompute from the fields above, so you only
> ever edit `GRID_SIZE` / `GRID_SPACING`. The helpers `getGridConstantsWGSL()` /
> `getGridOutputStructWGSL()` inject these into the WGSL shader so CPU and GPU never disagree.

---

## `sceneConfig.js` — scene colliders

Capsule sizes for the renderable actors. CPU owns existence/position/size; the GPU receives
camera-relative offsets. **Source:** [`lib/config/sceneConfig.js`](../../lib/config/sceneConfig.js).

| Object | Field | Default | Unit | Effect |
|---|---|---|---|---|
| `avatar` | `radius` / `height` | `0.005` / `0.02` | km | Capsule (5 m / 20 m) used for collision framing. |
| `avatar` | `albedo` | `[0.8, 0.8, 0.8]` | rgb | Placeholder color. |
| `vehicle` | `radius` / `height` | `0.008` / `0.005` | km | Vehicle placeholder capsule (8 m / 5 m). |
| `vehicle` | `albedo` | `[0.3, 0.6, 1.0]` | rgb | Blue-ish placeholder. |

> `_reserved0` is a padding slot for uniform-buffer alignment — not rendered.

---

## `storageConfig.js` — persistence keys

`localStorage` keys for state that survives reloads. **Source:** [`lib/config/storageConfig.js`](../../lib/config/storageConfig.js).

| Key constant | Value | Persists |
|---|---|---|
| `TERRAIN` | `ovgrid_terrain_params` | Edited terrain generation params (Debug panel). |
| `AVATAR` | `ovgrid_avatar_state` | Avatar voxel customization. |
| `VEHICLE` | `ovgrid_vehicle_state` | Last vehicle state. |
| `NAVIGATION_MODE` | `ovgrid_navigation_mode` | Walk / fly / vehicle mode. |
| `RPM_AVATAR` | `ovgrid_rpm_avatar` | Ready Player Me avatar URL (if used). |

---

← [index](./README.md) · related: [floating-origin-guide.md](../floating-origin-guide.md) · [GPU_PHYSICS_GRID.md](../GPU_PHYSICS_GRID.md)
