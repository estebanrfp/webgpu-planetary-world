/**
 * SCATTER SYSTEMS CONFIGURATION
 *
 * Centralized asset paths and grid parameters for all procedural scatter systems
 * (palms, rocks, vegetation). Edit paths here to swap models/textures without
 * touching system code.
 *
 * @module config/scatterConfig
 */

/** Palm scatter configuration */
export const PALM_CONFIG = {
    // Palms are generated procedurally on the GPU (zero HTTP, no model files):
    // 8 variations from one template in ProceduralTreeGenerator's palm family.
    proceduralVariants: 8,

    // Unified ~3 km reach across all scatter systems (see TREE_CONFIG /
    // ROCK_CONFIG below). Past 3 km the palms become sub-pixel noise, so
    // the older 3.6 km radius wasted compute on invisible instances.
    gridSide: 20,
    cellSpacingKm: 0.30,
};

/** Rock scatter configuration (procedural — no GLB paths needed)
 *
 * Colours track the terrain shader's mid-shade for rocky cliffs.
 * `colRock=[0.4, 0.38, 0.35]` (rgb 102,97,89) is the BASE — the terrain
 * then multiplies by 0.7-1.4 + applies atmospheric scattering, so the
 * average pixel on the mountain ends up ≈ colRock × 0.75. We pre-bake
 * that factor here so the scatter rocks match the terrain rock at the
 * same lighting angle instead of looking sun-bleached next to it.
 */
export const ROCK_CONFIG = {
    variants: [
        { color: [ 82,  78,  71, 255], displacement: 0.12 },   // 0 boulder
        { color: [ 71,  69,  64, 255], displacement: 0.15 },   // 1 flat_stone (darker)
        { color: [ 86,  78,  67, 255], displacement: 0.10 },   // 2 tall_rock  (warm)
        { color: [ 75,  71,  66, 255], displacement: 0.18 },   // 3 wide_jagged
        { color: [ 78,  75,  67, 255], displacement: 0.14 },   // 4 round_stone
        { color: [ 67,  63,  58, 255], displacement: 0.10 },   // 5 formation  (cool/dark)
        { color: [ 38, 115,  30, 255], displacement: 0.08 },   // 6 mound      (grass green — kept)
        { color: [ 90,  82,  75, 255], displacement: 0.06 },   // 7 pergola    (warm light)
    ],
    // Cell spacing widened (0.2 → 0.6 km) so the new 4–20× rock sizes
    // never overlap with their grid neighbours. Grid side trimmed to
    // gridSide=10 (10×0.6 = 6 km diameter → 3 km radius) so the rocks
    // share the unified 3 km reach with trees/palms instead of wasting
    // compute on instances no one can see.
    gridSide: 10,
    cellSpacingKm: 0.6,
};

/** Tree scatter configuration (temperate & polar zones) */
export const TREE_CONFIG = {
    mode: 'glb',
    // Pure procedural mixed forest — pines + fractal broadleaf.
    // Palms live in PalmSystem (tropical biome), not here.
    variants: [
        { template: 'pine_tall',   seed: 17,    sizeScale: 2 },
        { template: 'pine_medium', seed: 4099,  sizeScale: 2 },
        { template: 'fir',         seed: 8181,  sizeScale: 2 },
        { template: 'cypress',     seed: 11423, sizeScale: 2 },
        { template: 'oak',         seed: 419,   sizeScale: 2 },
        { template: 'maple',       seed: 593,   sizeScale: 2 },
        { template: 'cherry',      seed: 233,   sizeScale: 2 },
        { template: 'birch',       seed: 859,   sizeScale: 2 },
        // Tropical interior — single jungle variant placed in tropical
        // latitudes outside the beach band (where palms live).
        { template: 'jungle',      seed: 9133,  sizeScale: 2.5 },
    ],
    // Unified 3 km radius (20×0.30 / 2). The previous 4.8 km radius
    // ran the compute on 1024 cells, but past ~3 km the trees fade to
    // sub-pixel noise — the extra dispatch + VS work bought nothing.
    gridSide: 20,
    cellSpacingKm: 0.30,
};

/** Biome latitude thresholds (abs(normal.y) ≈ sin|latitude|) */
export const BIOME_LATITUDE = {
    tropicalEnd: 0.35,
    temperateStart: 0.40,
    temperateEnd: 0.75,
    polarStart: 0.80,
    noiseScale: 5.0,
    noiseAmplitude: 0.08,
};

/** Plant scatter configuration — coloured flowers only. Grass, mushrooms,
 *  alien spikes and jungle blades were trimmed; the player only wants
 *  flowers on the ground. Targeted active count: ~20 per visible zone. */
export const PLANT_CONFIG = {
    variants: [
        { freq: 1 },  // 0 flower_red
        { freq: 1 },  // 1 flower_yellow
        { freq: 1 },  // 2 flower_blue
        { freq: 1 },  // 3 flower_white
        { freq: 1 },  // 4 flower_purple
        { freq: 1 },  // 5 flower_pink
        { freq: 1 },  // 6 flower_orange
    ],
    // Tuned for ~20 active flowers in a visible zone:
    //   16×16 = 256 cells × ~50 % altitude pass × ~25 % density
    //          × ~90 % moisture × ~75 % slope ≈ 21 flowers.
    gridSide: 16,
    cellSpacingKm: 0.30,
};

