/**
 * rainConfig.js - Rain and Lightning Configuration
 */

export const RAIN_CONFIG = {
  // Ported from reference/ovgrid-webgpu/lib/core/config.js (heavyParticles preset)
  particleCount: 25000,      // ~5 drops/m² at R=40 m — matches the Peter-Adams
                             // port density. With the world-anchored tile wrap
                             // a smaller disk still reads as "rain everywhere"
                             // (drops re-enter from the opposite side as the
                             // avatar walks), so we go small and save the GPU
                             // ~6× vs the R=100 variant.
  baseFallSpeed: 28.0,       // m/s — faster than reference (12) so the rain feels stormier
  baseLength: 0.5,           // Streak length in metres (world units, not km)
  baseWidth: 0.025,          // 2.5cm streak width
  // Tight disk centered on the camera. The world-anchored wrap in the shader
  // makes drops drift past as the avatar walks (cinta-caminadora) — the disk
  // doesn't need to be wide for the rain to feel everywhere, only wide enough
  // that the radial fade boundary (~0.5 R to 0.95 R) sits beyond the avatar
  // in the third-person camera cone.
  baseSpawnRadius: 40.0,     // 40m radius around camera (metres)
  baseSpawnHeight: 40.0,     // 40m above and below camera — cycle time
                             // 80m / 28 m/s ≈ 2.9 s, so individual drops feel
                             // snappy, not lingering.
  windStrength: 0.8,         // Subtle horizontal jitter amplitude
  color: [0.8, 0.85, 0.95],  // Bright blue-white
  opacity: 0.7,              // Base opacity
  
  // Lightning bolt parameters
  lightning: {
    minBurstInterval: 4.0,   // Min seconds between lightning bursts
    maxBurstInterval: 15.0,  // Max seconds between lightning bursts
    minFlashesPerBurst: 2,   // Minimum flashes in a burst
    maxFlashesPerBurst: 4,   // Maximum flashes in a burst
    flashDuration: 0.1,      // Duration of single flash (very quick)
    flashGap: 0.08,          // Gap between flashes in a burst
    flashIntensity: 1.8,     // Brightness of flash
    boltDuration: 0.22,
    thunderDelayMin: 0.01,   // Practically instant for the initial strike
    thunderDelayRange: 0.2,  // Very tight window
    thunderChance: 0.98,     
    branchCount: 8,          // More complex branching
    strikeRadius: 2.0,       // 2 km — close enough that bolts are clearly
                             // visible from the avatar. The previous 10 km
                             // put strikes so far away the sky bolt rendered
                             // as a 1-pixel line on the horizon and the cloud
                             // flash glow was barely perceptible.
    cloudGlowRadius: 10.0,    
    boltGlowWidth: 0.055,    // Wide atmospheric glow
  },
  
  // Audio
  audio: {
    rainVolume: 0.5
  }
};
