/**
 * oceanConfig.js — Ocean Rendering Configuration
 *
 * Config-driven ocean: these values seed the GPU uniforms (slots 64-79) via
 * `env.ocean` and are not exposed as runtime UI controls — tune the look here.
 * Geographic variation (arctic / temperate / tropical water by latitude) is
 * the planned next step and will extend this file.
 */

/**
 * Ocean rendering configuration. Numeric fields map 1:1 to GPU uniform slots
 * (parenthesised ranges are sane bounds); `reflectionsEnabled` is a
 * compile-time toggle that switches a shader code branch.
 */
export const OCEAN_CONFIG = {
  // Compile-time toggle (shader code branch)
  reflectionsEnabled: true,

  // Waves — oceanParams
  waveScale: 3.0,         // oceanParams.x  (0.5-8.0)
  waveSpeed: 0.5,         // oceanParams.y  (0.0-2.0)
  reflectionStr: 0.4,     // oceanParams.z  (0.0-1.0)
  foamIntensity: 0.6,     // oceanParams.w  (0.0-1.0)

  // Shallow water — oceanColors1
  shallowR: 0.10,         // oceanColors1.x
  shallowG: 0.55,         // oceanColors1.y
  shallowB: 0.70,         // oceanColors1.z
  clarity: 0.4,           // oceanColors1.w  (0.0-1.0)

  // Deep water — oceanColors2
  deepR: 0.06,            // oceanColors2.x
  deepG: 0.35,            // oceanColors2.y
  deepB: 0.60,            // oceanColors2.z
  specularPower: 128.0,   // oceanColors2.w  (32-256)

  // Foam & normals — oceanMisc
  foamStart: -0.5,        // oceanMisc.x  (-1.0-0.0)
  waveNormalStr: 0.7,     // oceanMisc.y  (0.0-1.0)
};
