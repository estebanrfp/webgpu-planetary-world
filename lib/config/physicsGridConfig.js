/**
 * PHYSICS GRID CONFIGURATION
 * 
 * Centralized configuration for the GPU terrain height grid used for physics/collision.
 * This defines the "treadmill" bake area that follows the avatar.
 * 
 * All dependent files should import these constants:
 * - lib/shaders/terrainHeightGrid.compute.wgsl.js (WGSL shader)
 * - lib/systems/PhysicsSystem.js
 * - lib/terrain/renderer.js
 */

export const PHYSICS_GRID_CONFIG = {
  // Grid dimensions (64×64 = 4,096 points, 8m spacing = 512m coverage)
  GRID_SIZE: 64,
  GRID_SPACING: 8.0,

  // Derived values (calculated for convenience)
  get GRID_POINTS() { return this.GRID_SIZE * this.GRID_SIZE; },
  get GRID_HALF_SIZE() { return (this.GRID_SIZE * this.GRID_SPACING) / 2; }, // 256.0m
  get GRID_COVERAGE() { return this.GRID_SIZE * this.GRID_SPACING; },       // 512.0m

  // Re-bake threshold (when avatar moves this far from center, trigger new bake)
  REBAKE_THRESHOLD_M: 200.0,        // 200 meters (safe margin for 512m grid)
  get REBAKE_THRESHOLD_KM() { return this.REBAKE_THRESHOLD_M / 1000; },

  // Altitude gate (only bake when within 500m of surface — start early for smooth landing)
  MAX_BAKE_ALTITUDE_M: 500.0,
  get MAX_BAKE_ALTITUDE_KM() { return this.MAX_BAKE_ALTITUDE_M / 1000; },
  
  // Buffer sizes for GPU (calculated from grid size)
  // heights: GRID_POINTS * 4 bytes (f32)
  // normals: GRID_POINTS * 16 bytes (vec3f with padding)
  get HEIGHTS_BUFFER_SIZE() { return this.GRID_POINTS * 4; },               
  get NORMALS_BUFFER_SIZE() { return this.GRID_POINTS * 16; },              
  get TOTAL_BUFFER_SIZE() { 
    // Ensure 256-byte alignment for WebGPU requirements
    const total = this.HEIGHTS_BUFFER_SIZE + this.NORMALS_BUFFER_SIZE;
    return Math.ceil(total / 256) * 256;
  },
  
  // Compute shader dispatch groups (GRID_SIZE / workgroup_size)
  WORKGROUP_SIZE: 8,
  get DISPATCH_GROUPS() { return this.GRID_SIZE / this.WORKGROUP_SIZE; },   // 8
};

/**
 * Returns the WGSL const declarations for the grid configuration.
 * Import this in terrainHeightGrid.compute.wgsl.js
 */
export const getGridConstantsWGSL = () => `
// Grid configuration (from physicsGridConfig.js)
const GRID_SIZE: u32 = ${PHYSICS_GRID_CONFIG.GRID_SIZE}u;
const GRID_SPACING: f32 = ${PHYSICS_GRID_CONFIG.GRID_SPACING.toFixed(1)};
const GRID_HALF_SIZE: f32 = ${PHYSICS_GRID_CONFIG.GRID_HALF_SIZE.toFixed(1)};
`;

/**
 * Returns the WGSL struct declaration for GridOutput with correct array sizes.
 */
export const getGridOutputStructWGSL = () => `
// Output: Grid of heights (${PHYSICS_GRID_CONFIG.GRID_POINTS} values for ${PHYSICS_GRID_CONFIG.GRID_SIZE}x${PHYSICS_GRID_CONFIG.GRID_SIZE} grid)
struct GridOutput {
  heights : array<f32, ${PHYSICS_GRID_CONFIG.GRID_POINTS}>,
  normals : array<vec3f, ${PHYSICS_GRID_CONFIG.GRID_POINTS}>,
}
`;
