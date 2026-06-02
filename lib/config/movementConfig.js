/**
 * MOVEMENT CONFIGURATION - Logarithmic Speed System
 * Speed scales naturally with altitude for smooth navigation across 22 LOD levels
 */
export const MOVEMENT_CONFIG = {
  // === Altitude limits ===
  minAltitude: 0,                 // Allow ground-level movement
  maxAltitude: 20,                // Maximum flight altitude in km (20 km AGL ceiling)
  ceilingSoftZone: 5,             // Soft transition zone before ceiling (km) - speed fades from 15-20km
  
  // === LOGARITHMIC SPEED PARAMETERS ===
  // Speed formula: altitude * speedPerKmAltitude * (1 + logScaleFactor * log10(altitude + 1))
  speedPerKmAltitude: 0.4,       // Final tuning: Smoother atmospheric entry
  logScaleFactor: 0.3,           // Logarithmic scaling factor
  minSpeed: 0.10,                // Ground walk speed (tuned for the 1.8m rigged avatar — less foot-sliding). Run = minSpeed × boostMultiplier.
  maxSpeedCap: 4000,             // REDUCED: cap for stability

  // === Acceleration scales with altitude too ===
  accelPerKmAltitude: 2.0,       // Base acceleration per km altitude
  minAcceleration: 0.04,         // Matches the higher ground speed so it's reached responsively
  maxAcceleration: 4000,         
  
  // === SHIFT key boost ===
  boostMultiplier: 2.25,         // Run = walk × this. 2.25 = run a touch faster than walk (player + NPCs).
  
  // === PHYSICS ===
  gravity: 0.004,                // Proportional to 795km planet (1/8 of Earth)
  jumpVelocity: 0.005,           // Proportional to 795km planet
  groundedThreshold: 0.002,     // INCREASED: 2m threshold (was 10cm) to prevent animation loop at high speeds
  airTimeThreshold: 0.5,        // Seconds before fall animation triggers (avoids flickering on slopes)
  
  // === ATMOSPHERE TRANSITION ===
  atmosphereBoundary: 100,       // Altitude (km) where smooth braking begins
  
  // === Legacy thresholds (for UI zone display) ===
  lowOrbitAltitude: 100,         
  highOrbitAltitude: 15000,      // > 15,000km = Deep Space zone
};
