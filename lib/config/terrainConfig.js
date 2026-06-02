/**
 * terrainConfig.js - Terrain Texture and Material Configuration
 * 
 * Centralized paths for terrain texture arrays and fallback colors.
 */

export const TERRAIN_TEXTURE_CONFIG = {
  /**
   * Named Normal Map paths for terrain biomes.
   * Consolidated: 5 unique textures (down from 8)
   */
  normalMaps: {
    grass: './assets/textures/sources-textures/grass/Grass001_1K-PNG/normal.ktx2',
    rock:  './assets/textures/sources-textures/sand/sand_002/normal.ktx2',
    // rock:  './assets/textures/sources-textures/rock/Rock035_1K-PNG/normal.ktx2',
    sand:  './assets/textures/sources-textures/sand/sand_002/normal.ktx2',
    snow:  './assets/textures/sources-textures/snow/Snow010A_1K-PNG/normal.ktx2',
    water: './assets/textures/sources-textures/water/waternormals.ktx2'
  },

  /**
   * GPU Texture Array binding order (5 unique textures).
   * Shader index mapping:
   *   0: grass (also used for ground/arid)
   *   1: rock  (also used for deep seabed)
   *   2: sand  (also used for shallow seabed)
   *   3: snow
   *   4: water (ocean waves)
   */
  textureOrder: [
    'grass', // 0 - Land + Ground/Arid
    'rock',  // 1 - Cliffs + Deep Seabed
    'sand',  // 2 - Beach + Shallow Seabed
    'snow',  // 3 - High altitude
    'water'  // 4 - Ocean waves
  ],

  // Default flat normal [128, 128, 255, 255]
  flatNormal: [128, 128, 255, 255]
};

/**
 * Quadtree LOD System Configuration
 * Controls terrain subdivision, chunk size, and LOD behavior
 */
export const QUADTREE_CONFIG = {
  // Maximum LOD level (LOD 22 = ground level detail)
  MAX_LOD_LEVEL: 16,
  
  // Minimum quad size in km (1 meter)
  MIN_QUAD_SIZE: 0.001,
  
  // Vertices per quad edge (24×24 cells = 25×25 vertices)
  QUAD_GRID_SIZE: 24,
  
  // Split threshold multiplier
  SPLIT_FACTOR: 1.5,

  // Hysteresis: merge threshold = splitRadius * factor (reduces LOD pop)
  HYSTERESIS_FACTOR: 1.3,
  
  // Maximum vertices to process per frame
  DEFAULT_VERTICES_PER_FRAME: 32768,
  
  // Elevation at which LOD 0 starts (km) - controls quad size
  LOD_BASE_ELEVATION: 10000,

  // Radius of central quads for subdivision (5.0 = 10x10 block)
  LOD_RING_RADIUS: 5.0, // 2.0 is default

  // Max distance for any terrain LOD (km)
  LOD_MAX_DISTANCE: 3000,// was 2000 (sparse trees/plants out to ~5 km need terrain reaching further)
  
  // Horizon Culling (Dynamic based on altitude)
  // Ground margin: Higher = less aggressive culling near ground
  HORIZON_GROUND_MARGIN: 0.02,

  // Space margin: conservative culling in space
  HORIZON_SPACE_MARGIN: 0.03,

  // GPU Horizon Safety Margin (km) - Prevents high mountains from being culled
  HORIZON_CULL_GPU_MARGIN: 3.0,

  // Transition altitude (km): Below this = ground mode, above = space mode
  HORIZON_TRANSITION_ALT: 25,

  // Culling Heuristics
  HORIZON_BASE_MARGIN: 0.03,
  HORIZON_ALTITUDE_SCALE: 0.05,
  BACK_CONE_THRESHOLD: -0.6,    // GPU Culling
  BACK_CONE_THRESHOLD_JS: -0.6, // Quadtree logic
  BACK_CONE_FAR_MULT: 0.0,
  CULL_SAFETY_RADIUS_MULT: 2.0,
  CULL_NEAR_LIMIT: 5.0,         // km
  CULL_FAR_LIMIT: 25.0,         // km
};

export const TERRAIN_LIMITS = {
  MIN_ALTITUDE_CLAMP: -20.0,
  MAX_ALTITUDE_CLAMP: 40.0,
  SKIRT_DEPTH: 0.5, // 500 meters safety seal
};

export const TERRAIN_GENERATION_PARAMS = {
  warpFactor: 0.0,
  mountMaskFreq: 0.1,
  baseAmplitude: 0.3,
  baseFrequency: 15.1,
  persistence: 0.59,
  lacunarity: 2.0,
  contrastExp: 1.0,
  contrastScale: 0.5,
  seaLevelOffset: 0.0,
  ridgeDetail: 1.0,
  abyssDetail: 2.9,
  detailScale: 1.4,
  showNoise: true,
  grassCoverage: 1.0,
  sandCoverage: 1.0,
  snowCoverage: 1.0,
  rockCoverage: 0.67,
  octaves: 8.0,
  warpScale: 1.5,
  warpStrength2: 0.0,
  peakSoftness: 0.0,
  // --- Planetary Style ---
  terraceAmount: 0.0,
  terraceSmooth: 0.01,
  mountainSharpness: 0.5,
  shelfWidth: 1.0,
  beachWidth: 0.001,
  snowLine: 0.35,
  sandSharpness: 1.0,
  rockThreshold: 0.1,
  grassThreshold: 0.39,
  globalMoisture: 0.33,
  lakeDetail: 0.35,
  // --- Biome Colors ---
  colGrass: [0.15, 0.45, 0.12],
  colForest: [0.04, 0.25, 0.05],
  colRock: [0.4, 0.38, 0.35],
  colSnow: [0.85, 0.85, 0.9],
  colSand: [0.78, 0.68, 0.48],
  colGround: [0.55, 0.45, 0.35],
  colShallowSea: [0.12, 0.75, 0.78],
  colDeepSea: [0.06, 0.25, 0.55]
};

/**
 * Terrain Scale and Resolution Constants
 */
export const TERRAIN_SCALES = {
  HEIGHT_SCALE: 27.5,       // Vertical exaggeration factor (halved with planet radius)
  M_TO_KM: 0.001,          // Meters to Kilometers conversion
  MESH_RESOLUTION: 25,     // 24x24 cells (25x25 vertices)
  MAX_CHUNKS: 4096,        // Maximum total chunks allowed in memory
};
