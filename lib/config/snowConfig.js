/**
 * snowConfig.js - Snow Particle System Configuration
 * 
 * Sparse, beautiful snowflakes (like reference: ~5000 particles)
 */

export const SNOW_CONFIG = {
  // Matched 1:1 to rain (lib/config/rainConfig.js) so the snow uses the exact
  // same world-anchored treadmill technique — only the flake shape and fall
  // speed differ. See docs/rain-system.md.
  particleCount: 6000,            // ~1.2 flakes/m² at R=40 m — a quarter of
                                  // rain's density. Big flakes with spiral +
                                  // wobble motion + per-flake sparkle read as
                                  // a full snowfall even at this sparse rate;
                                  // higher densities just stack overdraw.

  // Base parameters — values are in KM by historical convention; the shader
  // multiplies by 1000 to work in metres for the wrap math.
  baseSpawnRadius: 0.040,         // 40m radius around the camera
  baseSpawnHeight: 0.040,         // 40m above/below camera (cycle = 80m)
  baseFallSpeed: 5.0,             // m/s — terminal velocity of real snow is
                                  // ~1.5 m/s, but 5 keeps the fall visible
                                  // and the cycle time around 16 s.

  // Visuals
  color: [1.0, 1.0, 1.0],         // Pure white
  opacity: 0.9,

  // Altitude thresholds (unused since the WeatherSystem drives intensity)
  maxAltitude: 10.0,
  minAltitude: 0.0,
};
