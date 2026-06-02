# GPU Physics Grid Architecture (Treadmill Bake)

This document describes the high-precision terrain physics system used to ensure the avatar interacts accurately with the procedurally generated planetary terrain.

## Core Problem: The Precision Gap
In a planetary-scale engine, calculating terrain heights on the CPU (JavaScript `float64`) often leads to subtle discrepancies compared to the GPU (WGSL `float32`) due to differences in noise function implementations and floating-point behavior. This "precision gap" causes the avatar to jitter or fall through the floor.

## The Solution: GPU Treadmill Bake
Instead of sampling height on the CPU, we **bake** a local physics grid directly on the GPU using a Compute Shader.

### 1. 64x64 High-Resolution Grid
- **Resolution**: 64x64 points (4,096 total height samples).
- **Spacing**: 8.0 meters between points.
- **Coverage**: A 512x512 meter area centered on the avatar.
- **Treadmill Logic**: The grid is only re-baked when the avatar moves more than **200 meters** away from the last bake center. This "treadmill" approach minimizes GPU-to-CPU readback overhead.

### 2. Floating Origin Precision (CPU-GPU Hybrid)
To avoid jitter at planetary scales (thousands of km from the center), we compute the local coordinate system on the CPU using `float64` and pass **relative** data to the GPU:
- **Avatar Normal**: The unit vector from Earth center to the avatar (computed with `float64`).
- **Local Axes**: `Right` and `Forward` vectors orthonormal to the normal.
- **Relative Offset**: The Compute Shader calculates positions relative to the avatar using these vectors:
  `gridNormal = normalize(avatarNormal + (right * offsetX + forward * offsetY) / constants.PLANET_RADIUS)`

### 3. Bilinear Interpolation
Physics collision doesn't just snap to the nearest grid point. We use **Bilinear Interpolation** between the 4 closest points in the grid to provide millimetric height accuracy at any position within the 512m coverage area.

### 4. Direct Parity (Shared Logic)
The `terrainHeightGrid.compute.wgsl.js` shader uses the **exact same code** as the visual `terrain.wgsl.js` shader. 
- **Forced Noise**: The physics bake ignores debug flags and always calculates the full noise height to ensure the avatar never falls through "visual-only" debug states.
- **Parameter Sync**: All terrain parameters (warp, frequency, octaves) are synchronized via a uniform buffer before every bake.

## Performance Profile
- **Bake Time**: ~1-5ms (Compute Shader).
- **Readback Latency**: 1-2 frames (Asynchronous).
- **CPU Cost**: Minimal (only interpolation logic).

## Reference Files
- [PhysicsSystem.js](file:///Users/estebanrfp/Projects/Deployments/OVGrid-Project/webgpu-precomputed-atmospheric-scattering/lib/systems/PhysicsSystem.js) - Grid management and interpolation.
- [renderer.js](file:///Users/estebanrfp/Projects/Deployments/OVGrid-Project/webgpu-precomputed-atmospheric-scattering/lib/terrain/renderer.js) - GPU Bake dispatch.
- [terrainHeightGrid.compute.wgsl.js](file:///Users/estebanrfp/Projects/Deployments/OVGrid-Project/webgpu-precomputed-atmospheric-scattering/lib/shaders/terrainHeightGrid.compute.wgsl.js) - The "Truth" of the terrain.
- [physicsGridConfig.js](file:///Users/estebanrfp/Projects/Deployments/OVGrid-Project/webgpu-precomputed-atmospheric-scattering/lib/config/physicsGridConfig.js) - Centralized configuration.
