/**
 * shadowConfig.js - Cascaded Shadow Map Configuration
 * 
 * Centralized parameters for 4-cascade shadow mapping system.
 * All radii are in kilometers to match the Floating Origin coordinate system.
 */

export const SHADOW_CONFIG = {
  // Number of shadow cascades
  CASCADE_COUNT: 4,
  
  // Shadow map resolution per cascade
  MAP_SIZE: 2048,
  
  // Cascade definitions (radius in km)
  // Each cascade covers a larger area with the same resolution
  CASCADES: [
    { radius: 0.15, nearClip: -1.5, farClip: 1.5 },    // 150m - Avatar detail
    { radius: 1.0,  nearClip: -10.0, farClip: 10.0 },   // 1km - Nearby terrain
    { radius: 4.0,  nearClip: -40.0, farClip: 40.0 },   // 4km - Hills & palms
    { radius: 10.0, nearClip: -100.0, farClip: 100.0 }  // 10km - Mountains & distant scatter
  ],

  // Max cascade index for vegetation/rock/palm shadow casters (0-based, inclusive)
  // 0 = cascade 0 only, 1 = +cascade 1, 2 = +cascade 2, 3 = all cascades
  SCATTER_SHADOW_MAX_CASCADE: 3,

  // PCF shadow sampling configuration
  PCF: {
    SAMPLES: 9,           // 3x3 kernel
    BIAS_BASE: 0.0003,    // Base depth bias
    BIAS_NORMAL_SCALE: 0.0012  // Normal-based bias multiplier
  },
  
  // Split depth calculation method
  SPLIT_SCHEME: 'practical',
  SPLIT_LAMBDA: 0.95  // INCREASED to 0.95: Logarithmic distribution matches radiuses much better
};

/**
 * Calculate view-space split depths for cascade selection
 * @param {number} nearPlane - Camera near plane distance
 * @param {number} farPlane - Maximum shadow distance
 * @returns {number[]} Array of 4 split depths
 */
export const calculateCascadeSplits = (nearPlane = 0.001, farPlane = 25.0) => {
  const { CASCADE_COUNT, SPLIT_LAMBDA } = SHADOW_CONFIG;
  const splits = new Array(CASCADE_COUNT);
  
  for (let i = 0; i < CASCADE_COUNT; i++) {
    const p = (i + 1) / CASCADE_COUNT;
    
    // Logarithmic distribution (more detail near camera)
    const log = nearPlane * Math.pow(farPlane / nearPlane, p);
    
    // Linear distribution (uniform)
    const linear = nearPlane + (farPlane - nearPlane) * p;
    
    // Practical split scheme (blend of both)
    splits[i] = SPLIT_LAMBDA * log + (1 - SPLIT_LAMBDA) * linear;
  }
  
  return splits;
};
