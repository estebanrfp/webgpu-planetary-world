/**
 * UI Configuration
 * 
 * Centralized constants for UI behavior, bitflags, and layout.
 */

export const UI_CONFIG = {
  // Terrain Debug Bitflags (must match shaders/terrain.wgsl)
  DEBUG_FLAGS: {
    QUADS: 1,
    SUBQUADS: 2,
    SKIRTS: 4,
    COLOR: 8,
    TEXTURES: 16,
    NOISE: 32,
    BUMP: 128
  },

  // Perf bypass bits — packed into earthCenter.w (NOT whitePoint.w) so
  // they stay clear of the float32-fraction reserved for sun angular size.
  // earthCenter.w = terrainDebugMode + bypassFlags * 100.
  BYPASS_FLAGS: {
    TEXTURES: 1,
    LIGHTING: 2,
    SHADOWS: 4
  },

  // Default active flags: Color (8) | Textures (16) | Bump (128)
  DEFAULT_DEBUG_FLAGS: 8 | 16 | 128,
  
  // Throttle/Debounce settings
  SAVE_DEBOUNCE_MS: 500,
  STATS_UPDATE_INTERVAL_MS: 100
};
