/**
 * CAMERA CONFIGURATION
 * Controls orbital camera behavior around the reference point
 */
export const CAMERA_CONFIG = {
  // === Distance from reference point ===
  defaultDistance: 0.12,        // Initial orbit distance (calibrated for current avatar size)
  minDistance: 0.045,           // Closest zoom — frames face+chest, stays outside the mesh
  maxDistance: 0.6,             // Farthest zoom
  
  // === Orbit angle limits ===
  // Soft limit on either end; the actual ground-clipping protection is handled by
  // the dynamic terrain probe in CameraSystem.getOrbitalState (shrinks the orbit
  // distance whenever the requested camera position would be inside the terrain).
  orbitPitchMin: -1.57,         // Min vertical angle: -90° (orbit fully under)
  orbitPitchMax: 1.57,          // Max vertical angle: +90° (nadir / look straight down)

  // Safety margin (km) the camera must keep above the terrain when the orbit probe
  // pulls it in. Set to 3 m so the camera stops a noticeable gap before the ground
  // instead of grazing it.
  groundClearance: 0.003,
  
  // === Camera inertia and smoothing ===
  // Lower values = more inertia/smoother movement, higher = faster response
  orbitSmoothing:12.0,          // Camera rotation smoothing (was 8.0, now more inertia)
  zoomSmoothing: 6.0,           // Zoom smoothing factor
  
  // === Mouse sensitivity ===
  orbitSpeed: 0.008,            // Mouse drag sensitivity for horizontal rotation
  orbitSpeedVertical: 0.016,    // Mouse drag sensitivity for vertical (pitch) - 2x higher
  zoomSpeed: 0.2,               // Mouse wheel zoom sensitivity (Doubled)
  
  // === Interior/Ship mode ===
  interiorOrbitSpeed: 0.012,    // Faster horizontal in cockpit
  interiorOrbitSpeedVertical: 0.024, // Much faster vertical in cockpit
  
  // Clip Planes (km)
  NEAR: 0.0005,
  FAR: 100000.0
};
