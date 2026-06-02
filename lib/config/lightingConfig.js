/**
 * lightingConfig.js - Centralized Lighting Constants
 * 
 * Shared photometric and color constants for all environment shaders.
 * CPU passes these values but they can also be used for documentation/injection.
 */

export const LIGHTING_CONFIG = {
  // --- Solar Irradiance ---
  // Solar constant components (Radiance)
  SOLAR_IRRADIANCE_BASE: [1.474, 1.850, 1.912],
  
  // Power multipliers for various systems
  SUN_INTENSITY_TERRAIN: 0.7,
  SUN_INTENSITY_AVATAR: 0.7,
  SUN_INTENSITY_SPACE: 10.0,
  
  // --- Post-Processing Weights ---
  // Standard Rec.709 luminance weights for grayscale conversion
  LUMINANCE_WEIGHTS: [0.299, 0.587, 0.114],
  
  // --- Shadow Defaults ---
  CLOUD_SHADOW_INTENSITY: 0.1, // Moving towards 0.0 makes shadows darker
  
  // --- Night Floor ---
  NIGHT_AMBIENT_FLOOR: 0.15,
};
