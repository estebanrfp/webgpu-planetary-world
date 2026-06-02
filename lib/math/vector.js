/**
 * vectorMath.js - Shared Vector Math Utilities
 * 
 * Provides Float64-precision vector operations for CPU-side calculations.
 * Used by PlanetQuadtree.js for LOD decisions and distance calculations.
 * 
 * 🔑 FLOATING_ORIGIN: All CPU calculations should use Float64 for precision.
 */

// ============================================================
// VEC3 UTILITIES
// ============================================================

export const vec3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (v, s) => [v[0] * s, v[1] * s, v[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  length: (v) => Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]),
  normalize: (v) => {
    const len = vec3.length(v);
    return len > 0 ? [v[0] / len, v[1] / len, v[2] / len] : [0, 0, 0];
  },
  distance: (a, b) => vec3.length(vec3.sub(a, b)),
  cross: (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ],
  lerp: (a, b, t) => [
    a[0] + t * (b[0] - a[0]),
    a[1] + t * (b[1] - a[1]),
    a[2] + t * (b[2] - a[2])
  ],
};
