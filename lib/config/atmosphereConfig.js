/**
 * atmosphereConfig.js - Atmosphere and Cloud Configuration
 * 
 * Centralized defaults for atmospheric rendering and cloud optimizations.
 */

export const ATMOSPHERE_CONFIG = {
  // Cloud rendering optimization thresholds
  cloudMaxAltitude: 30.0,   // km - Clouds disabled above this altitude (perf optimization)
  cloudFadeStart: 3.0,      // km - Clouds begin fading at this altitude
  cloudFadeEnd: 12.0,       // km - Clouds fully transparent at this altitude
  
  // Cloud Layer Defaults
  cloudCoverage: 0.5,       // 0.0 to 1.0 (Refined Hard-Shift scale)
  cloudSpeed: 0.2,          // Cloud movement speed multiplier
  cloudsEnabled: true,
  cloudShadowsEnabled: true,
  // Volumetric Shadows (God Rays)
  volumetricShadowsEnabled: true,
  volumetricShadowSteps: 4.0,
  volumetricShadowMaxDist: 15.0,
  volumetricShadowAmbient: 0.05,
  volumetricShadowBias: 0.0005,
  
  // Layer Opacities
  cloudLayer1Opacity: 0.4,
  cloudLayer2Opacity: 0.4,
  cloudLayer3Opacity: 0.2,
  
  // Layer Tints (RGB)
  cloudLayer1R: 1.0, cloudLayer1G: 1.0, cloudLayer1B: 1.0,
  cloudLayer2R: 1.0, cloudLayer2G: 1.0, cloudLayer2B: 1.0,
  cloudLayer3R: 1.0, cloudLayer3G: 1.0, cloudLayer3B: 1.1,
  
  // Other effects
  snowEnabled: false,
  rainIntensity: 0.0,
  stormEnabled: false,
  
  // Visual defaults
  // Fixed engine-wide exposure. A sunlit sky reads correctly at 1.0; 2.0 washed
  // the terrain textures out. No longer user-adjustable — tuned only here.
  exposure: 1.0,
  
  // Artistic Stylization
  skySaturation: 1.0,       // 0.0 to 2.0
  skyVibrance: 0.0,         // 0.0 to 1.0
  auroraIntensity: 0.0,     // 0.0 to 1.0 - Procedural aurora borealis
  auroraSpeed: 0.5,         // 0.0 to 2.0 - Animation speed
  auroraBaseR: 0.08,        // Base color (green by default)
  auroraBaseG: 0.95,
  auroraBaseB: 0.25,
  auroraTopR: 0.75,         // Top color (magenta by default)
  auroraTopG: 0.08,
  auroraTopB: 0.55,
  auroraAltitude: 0.5,      // 0.0 to 1.0 - Curtain height on sky
  skyTintR: 1.0,            // 0.0 to 2.0
  skyTintG: 1.0,            // 0.0 to 2.0
  skyTintB: 1.0,            // 0.0 to 2.0
  
  // Sun position defaults (radians)
  sunZenithAngleRadians: 1.2,
  sunAzimuthAngleRadians: 2.0,
  dayCycleEnabled: false,
  dayCycleSpeed: 1.0,
  
  // Sun Parameters
  SUN_ANGULAR_RADIUS: 0.00935 / 2.0, // Radians (~0.26 degrees)
  
  // Cloud altitude (km above sea level)
  cloudAltitude: 4.0,
  
  // Shadow Factor (1.0 = clear, 0.1 = very dark)
  cloudShadowIntensity: 0.1,

  // Layer 1 (Primary)
  cloudLayer1Scale: 0.004,
  cloudLayer1Speed: 0.1,
  cloudLayer1Threshold: 0.68,
  cloudLayer1CoverageScale: 0.28,

  // Layer 2 (Broad)
  cloudLayer2Scale: 0.0025,
  cloudLayer2Speed: 0.15,
  cloudLayer2Threshold: 0.71,
  cloudLayer2CoverageScale: 0.26,

  // Layer 3 (Stratospheric)
  cloudLayer3Scale: 0.001,
  cloudLayer3Speed: 0.05,
  cloudLayer3Threshold: 0.74,
  cloudLayer3CoverageScale: 0.24,
};
