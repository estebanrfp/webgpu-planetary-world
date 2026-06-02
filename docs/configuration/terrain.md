# Terrain

Everything that shapes, colors, textures and subdivides the ground. All five exports live in
[`lib/config/terrainConfig.js`](../../lib/config/terrainConfig.js). The **generation params** are
also runtime-editable in the Debug panel (`G`) and persisted under `ovgrid_terrain_params`.
← back to [index](./README.md) · architecture: [terrain-mesh.md](../terrain-mesh.md).

---

## `TERRAIN_GENERATION_PARAMS` — the noise & biome model

The heart of the terrain look. These feed the GPU height/biome shader. Heights are in km **before**
the `HEIGHT_SCALE` exaggeration (see below).

### Shape (noise)

| Param | Default | Effect |
|---|---|---|
| `octaves` | `8.0` | FBM octave count — overall detail richness. |
| `baseFrequency` | `15.1` | Base noise frequency — feature size (higher = smaller, busier features). |
| `baseAmplitude` | `0.3` | Base height amplitude. |
| `persistence` | `0.59` | Amplitude falloff per octave (roughness). |
| `lacunarity` | `2.0` | Frequency growth per octave. |
| `detailScale` | `1.4` | High-frequency detail multiplier. |
| `ridgeDetail` | `1.0` | Ridged-noise contribution (mountain crests). |
| `abyssDetail` | `2.9` | Detail amplitude in deep ocean trenches. |
| `warpFactor` / `warpScale` / `warpStrength2` | `0.0` / `1.5` / `0.0` | Domain warping (distorts noise for organic shapes). |
| `mountMaskFreq` | `0.1` | Frequency of the mask deciding where mountains rise. |
| `contrastExp` / `contrastScale` | `1.0` / `0.5` | Height contrast curve. |

### Style (planetary sculpting)

| Param | Default | Effect |
|---|---|---|
| `mountainSharpness` | `0.5` | Peak sharpness (0 = rounded, 1 = jagged). |
| `peakSoftness` | `0.0` | Softens summits. |
| `terraceAmount` / `terraceSmooth` | `0.0` / `0.01` | Stepped/terraced terrain (0 = off). |
| `shelfWidth` | `1.0` | Continental-shelf width before the abyss. |
| `beachWidth` | `0.001` | Width of the sand beach band at the shoreline. |
| `snowLine` | `0.35` | Height fraction above which snow appears. |
| `seaLevelOffset` | `0.0` | Raises/lowers global sea level. |
| `lakeDetail` | `0.35` | Inland water carving. |
| `globalMoisture` | `0.33` | Global wetness — shifts biome blending. |

### Biome coverage & thresholds

| Param | Default | Effect |
|---|---|---|
| `grassCoverage` / `sandCoverage` / `snowCoverage` / `rockCoverage` | `1.0` / `1.0` / `1.0` / `0.67` | Per-material coverage multipliers. |
| `grassThreshold` / `rockThreshold` | `0.39` / `0.1` | Slope/height cutoffs for grass vs rock. |
| `sandSharpness` | `1.0` | Hardness of the sand transition. |
| `showNoise` | `true` | Master toggle for procedural displacement. |

### Biome colors (RGB 0–1)

`colGrass` `[0.15,0.45,0.12]` · `colForest` `[0.04,0.25,0.05]` · `colRock` `[0.4,0.38,0.35]` ·
`colSnow` `[0.85,0.85,0.9]` · `colSand` `[0.78,0.68,0.48]` · `colGround` `[0.55,0.45,0.35]` ·
`colShallowSea` `[0.12,0.75,0.78]` · `colDeepSea` `[0.06,0.25,0.55]`.

> `colRock` is also the **base** the scatter rocks track — see [vegetation.md](./vegetation.md).

---

## `TERRAIN_SCALES` — scale & resolution

| Field | Default | Unit | Effect |
|---|---|---|---|
| `HEIGHT_SCALE` | `27.5` | × | Vertical exaggeration of the raw noise (halved when the planet radius was halved). |
| `M_TO_KM` | `0.001` | — | Meters→km helper. |
| `MESH_RESOLUTION` | `25` | verts | 24×24 cells (25×25 vertices) per chunk. |
| `MAX_CHUNKS` | `4096` | — | Hard cap on chunks held in memory. |

## `TERRAIN_LIMITS` — clamps

| Field | Default | Unit | Effect |
|---|---|---|---|
| `MIN_ALTITUDE_CLAMP` | `-20.0` | km | Floor for terrain height (deepest abyss). |
| `MAX_ALTITUDE_CLAMP` | `40.0` | km | Ceiling for terrain height (highest peak). |
| `SKIRT_DEPTH` | `0.5` | km | Downward skirt that seals seams between LOD chunks. |

---

## `QUADTREE_CONFIG` — LOD & culling

Controls terrain subdivision and what gets drawn. **Architecture:** [culling-system.md](../culling-system.md).

| Field | Default | Unit | Effect |
|---|---|---|---|
| `MAX_LOD_LEVEL` | `16` | — | Deepest subdivision level (ground detail). |
| `MIN_QUAD_SIZE` | `0.001` | km | Smallest quad (1 m). |
| `QUAD_GRID_SIZE` | `24` | cells | Vertices per quad edge (24×24 cells). |
| `SPLIT_FACTOR` | `1.5` | × | How eagerly quads split (higher = more detail closer). |
| `HYSTERESIS_FACTOR` | `1.3` | × | Merge threshold margin — reduces LOD popping. |
| `DEFAULT_VERTICES_PER_FRAME` | `32768` | verts | Mesh-build budget per frame. |
| `LOD_BASE_ELEVATION` | `10000` | km | Elevation at which LOD 0 begins. |
| `LOD_RING_RADIUS` | `5.0` | quads | Radius of full-detail central quads (10×10 block). |
| `LOD_MAX_DISTANCE` | `3000` | km | Max distance terrain LOD reaches (kept high so sparse scatter ~5 km still has ground). |

### Horizon / back-cone culling

| Field | Default | Effect |
|---|---|---|
| `HORIZON_GROUND_MARGIN` | `0.02` | Less aggressive culling near the ground. |
| `HORIZON_SPACE_MARGIN` | `0.03` | Conservative culling from space. |
| `HORIZON_CULL_GPU_MARGIN` | `3.0` km | Safety margin so tall mountains aren't culled. |
| `HORIZON_TRANSITION_ALT` | `25` km | Below = ground mode, above = space mode. |
| `HORIZON_BASE_MARGIN` / `HORIZON_ALTITUDE_SCALE` | `0.03` / `0.05` | Culling heuristics. |
| `BACK_CONE_THRESHOLD` / `…_JS` | `-0.6` / `-0.6` | Behind-camera cull cone (GPU & quadtree). |
| `CULL_SAFETY_RADIUS_MULT` | `2.0` | Radius multiplier safety. |
| `CULL_NEAR_LIMIT` / `CULL_FAR_LIMIT` | `5.0` / `25.0` km | Near/far culling band. |

---

## `TERRAIN_TEXTURE_CONFIG` — material textures

KTX2 normal maps and their GPU array order. **Source:** same file.

| Field | Effect |
|---|---|
| `normalMaps` | Paths for `grass`, `rock`, `sand`, `snow`, `water` normal maps (KTX2). |
| `textureOrder` | GPU texture-array binding order: `0 grass · 1 rock · 2 sand · 3 snow · 4 water`. The shader indexes by this order. |
| `flatNormal` | `[128,128,255,255]` — default tangent-space "up" normal. |

---

← [index](./README.md) · related: [terrain-mesh.md](../terrain-mesh.md) · [culling-system.md](../culling-system.md) · [GPU_PHYSICS_GRID.md](../GPU_PHYSICS_GRID.md)
