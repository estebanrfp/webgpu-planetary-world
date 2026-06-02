# Vegetation & Scatter

Procedural placement of palms, rocks, trees and flowers across the planet, plus the biome latitude
bands that decide what grows where. All in
[`lib/config/scatterConfig.js`](../../lib/config/scatterConfig.js). Each system scatters instances on
a grid of cells around the camera; **reach = `gridSide × cellSpacingKm / 2`**, unified to ~3 km
(past which instances become sub-pixel noise). ← back to [index](./README.md).

> Disabled wholesale by the `low` performance profile (`scatterEnabled: false`) — see
> [performance.md](./performance.md).

---

## `PALM_CONFIG` — tropical palms

| Param | Default | Effect |
|---|---|---|
| `proceduralVariants` | `8` | Palm variations generated on the GPU (zero HTTP, no model files). |
| `gridSide` | `20` | Cells per side. |
| `cellSpacingKm` | `0.30` | Cell size → reach `20 × 0.30 / 2 = 3 km`. |

## `ROCK_CONFIG` — rocks

Eight procedural variants. Colors are **pre-baked** to match the terrain's rocky cliffs at the same
lighting angle (≈ `colRock × 0.75`), so scattered rocks don't look sun-bleached next to the terrain.

| Param | Default | Effect |
|---|---|---|
| `variants` | 8 entries | `{ color: [r,g,b,a] (0–255), displacement }` — e.g. boulder, flat_stone, tall_rock, wide_jagged, round_stone, formation, mound (grass-green), pergola. |
| `gridSide` | `10` | Cells per side. |
| `cellSpacingKm` | `0.6` | Wider spacing so the 4–20× rock sizes never overlap → reach `10 × 0.6 / 2 = 3 km`. |

## `TREE_CONFIG` — temperate & polar forest

| Param | Default | Effect |
|---|---|---|
| `mode` | `'glb'` | Mesh source mode. |
| `variants` | 9 entries | `{ template, seed, sizeScale }` — pine_tall, pine_medium, fir, cypress, oak, maple, cherry, birch, and a `jungle` variant (sizeScale 2.5) for tropical interiors. |
| `gridSide` | `20` | Cells per side. |
| `cellSpacingKm` | `0.30` | Reach `20 × 0.30 / 2 = 3 km`. |

> Palms cover the tropical beach band; trees cover temperate/polar zones and the tropical *interior*.

## `PLANT_CONFIG` — flowers

Seven colored flowers (red, yellow, blue, white, purple, pink, orange). Trimmed to flowers only;
tuned for ~20 active flowers per visible zone.

| Param | Default | Effect |
|---|---|---|
| `variants` | 7 entries | `{ freq }` per flower color. |
| `gridSide` | `16` | 16×16 = 256 cells; after altitude/density/moisture/slope passes ≈ 21 flowers. |
| `cellSpacingKm` | `0.30` | Reach `16 × 0.30 / 2 = 2.4 km`. |

---

## `BIOME_LATITUDE` — where things grow

Thresholds on `abs(normal.y) ≈ sin|latitude|` that gate biomes from equator (0) to pole (1).

| Param | Default | Effect |
|---|---|---|
| `tropicalEnd` | `0.35` | End of the tropical band (palms, jungle). |
| `temperateStart` | `0.40` | Start of the temperate forest band. |
| `temperateEnd` | `0.75` | End of temperate forest. |
| `polarStart` | `0.80` | Start of the polar/snow zone. |
| `noiseScale` | `5.0` | Frequency of the boundary-jitter noise (breaks straight biome lines). |
| `noiseAmplitude` | `0.08` | How far the biome borders wobble. |

---

← [index](./README.md) · related: [terrain.md](./terrain.md) · [lighting-shadows.md](./lighting-shadows.md) (scatter shadow cascades) · [performance.md](./performance.md)
