# Player: Avatar, Camera, Movement, Vehicles

The character model, the orbit camera, the logarithmic locomotion system, and the vehicle registry.
← back to [index](./README.md).

---

## `avatarConfig.js` — `AVATAR_CONFIG`

The character: a blocky **voxel** mesh built at runtime from `voxelParams`, rigged to a Mixamo
skeleton loaded from `avatar-rig.glb`, animated by `avatar-anims.glb`.
**Source:** [`lib/config/avatarConfig.js`](../../lib/config/avatarConfig.js).

| Param | Default | Effect |
|---|---|---|
| `url` | `avatar-rig.glb` | Rigged skeleton (only the rig is used in voxel mode). |
| `animationsUrl` | `avatar-anims.glb` | Baked clips (Idle/Walk/Run/Jump/Floating + idles/emotes). |
| `voxel` | `true` | Build a voxel avatar from `voxelParams` (false = render the GLB mesh). |
| `voxelParams` | object | Default look: skin/hair/eye/mouth/shirt/pants/shoe colors, `hair/beard/glasses/hat/nose/ears/pattern`, `articulated` (bend limbs), `height/head/width`. |
| `scale` | `0.051` | Renders the 1.80 m rig at ~0.092 world units (calibrated to HUD/camera framing). |
| `headHeight` | `1.43` | Camera target (local units) — upper-chest framing. |
| `heightOffset` | `0.0001` | Vertical offset in km (+floats / −sinks); 10 cm. |
| `swimSubmerge` | `0.045` | How far a swimmer's root sinks below sea level (km) — waterline at the torso. |
| `maxBones` | `128` | Skinning bone cap. |
| `npcWalkBuckets` | `6` | Staggered locomotion phases so the NPC crowd doesn't move in lockstep (slots = 2 + 2×this). |
| `rotationSmoothing` | `8.0` | Avatar turn smoothing. |
| `subdomain` / `modelParams` | `ovgrid` / `lod=2&…` | Ready Player Me integration params. |

Shader-pattern fields (when `vertexPaint`/`voxel`): `baseColor`, `pattern` (6 = Pulse Grid),
`lineScale 20`, `lineWidth 0.06`, `lineGlow 0.5`, `lineColor [0,1,1]`, `lineColor2 [1,0,1]`,
`multiColor true`, `animSpeed 1.0`, `glowMul 3.0`.

> `modelRotationXDeg 0` / `modelGroundToFeet false` are **load-bearing** — the rig is already Y-up
> with feet at the origin; baking rotation/shift onto a skinned mesh desyncs it from the skeleton
> and explodes the deformation. Keep them at `0` / `false`.

---

## `cameraConfig.js` — `CAMERA_CONFIG`

Orbital third-person camera. Distances in km. **Source:** [`lib/config/cameraConfig.js`](../../lib/config/cameraConfig.js).

| Param | Default | Unit | Effect |
|---|---|---|---|
| `defaultDistance` | `0.12` | km | Initial orbit distance. |
| `minDistance` / `maxDistance` | `0.045` / `0.6` | km | Zoom limits (closest frames face+chest). |
| `orbitPitchMin` / `orbitPitchMax` | `-1.57` / `1.57` | rad | Vertical orbit limits (±90°). |
| `groundClearance` | `0.003` | km | Gap the camera keeps above terrain (3 m) when the probe pulls it in. |
| `orbitSmoothing` / `zoomSmoothing` | `12.0` / `6.0` | — | Inertia (lower = smoother). |
| `orbitSpeed` / `orbitSpeedVertical` | `0.008` / `0.016` | — | Mouse drag sensitivity (vertical 2×). |
| `zoomSpeed` | `0.2` | — | Wheel zoom sensitivity. |
| `interiorOrbitSpeed` / `…Vertical` | `0.012` / `0.024` | — | Faster orbit inside a cockpit. |
| `NEAR` / `FAR` | `0.0005` / `100000.0` | km | Clip planes. |

---

## `movementConfig.js` — `MOVEMENT_CONFIG`

Logarithmic speed that scales with altitude across all LOD levels. `minSpeed` is also the NPC walk
speed; run = `minSpeed × boostMultiplier`. **Source:** [`lib/config/movementConfig.js`](../../lib/config/movementConfig.js).

| Param | Default | Unit | Effect |
|---|---|---|---|
| `minAltitude` / `maxAltitude` | `0` / `20` | km | Ground movement to a 20 km flight ceiling. |
| `ceilingSoftZone` | `5` | km | Speed fades over 15–20 km. |
| `speedPerKmAltitude` | `0.4` | — | Base of the altitude→speed curve. |
| `logScaleFactor` | `0.3` | — | Logarithmic scaling term. |
| `minSpeed` | `0.10` | — | Ground **walk** speed (also NPC walk). |
| `maxSpeedCap` | `4000` | — | Speed cap (stability). |
| `accelPerKmAltitude` | `2.0` | — | Acceleration vs altitude. |
| `minAcceleration` / `maxAcceleration` | `0.04` / `4000` | — | Accel bounds. |
| `boostMultiplier` | `2.25` | × | **Shift** boost / run multiplier. |
| `gravity` | `0.004` | — | ~1/8 Earth (proportional to a 795 km planet). |
| `jumpVelocity` | `0.005` | — | Jump impulse. |
| `groundedThreshold` | `0.002` | km | 2 m grounded window (avoids anim looping at speed). |
| `airTimeThreshold` | `0.5` | s | Delay before the fall animation triggers. |
| `atmosphereBoundary` | `100` | km | Where smooth braking begins. |

---

## `vehicleConfig.js` — `VEHICLE_CONFIGS`

A registry of vehicle types (default `ship`), each with its own `controls`, `movement` and `hud`
blocks. `applyAliases()` flattens nested fields for backward compatibility.
**Source:** [`lib/config/vehicleConfig.js`](../../lib/config/vehicleConfig.js).

| Vehicle | Size (W×L×H, m) | `boostMultiplier` | `gravity` | Hover springs | HUD base/boost |
|---|---|---|---|---|---|
| `ship` (Scout) | 10×20×8 | `5.0` | `0.05` | `springStrength 10`, `hoverHeight 0.005` | `0.3` / `0.75` |
| `speeder` (ground) | 4×8×3 | `3.0` | `0.15` | `springStrength 20`, `hoverHeight 0.002` | `0.15` / `0.45` |

Per-vehicle `controls` cover steering (`orbitSpeedH/V`, `steeringSmoothing`), banking
(`bankEnabled`, `maxBankAngle`, `bankMultiplier`…) and inertia (`acceleration`, `inertiaDecay`).
Per-vehicle `movement` mirrors `MOVEMENT_CONFIG` plus hover (`useHoverSprings`, `springStrength`,
`springDamping`, `hoverHeight`) and `terrainAlignment`. Add a vehicle by adding an entry wrapped in
`applyAliases({...})`.

Helpers: `getVehicleConfig(type)`, `getVehicleTypes()`, `DEFAULT_VEHICLE_TYPE = 'ship'`.

---

← [index](./README.md) · related: [interface.md](./interface.md) · [world.md](./world.md)
