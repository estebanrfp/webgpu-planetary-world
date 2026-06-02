This project implements a **hybrid, dual-stage culling system** to efficiently render planetary-scale terrain. Stage 1 operates on the **CPU Quadtree** for coarse culling, while Stage 2 runs on a **GPU Compute Shader** for fine-grained instance culling. Both stages work together to minimize both CPU and GPU workload by discarding invisible terrain quads.

---

## 1. Horizon Culling (First Stage)

### What It Does
Horizon culling removes terrain quads that are on the **far side of the planet** (beyond the visible horizon from the camera's perspective). This is geometrically correct for spherical surfaces.

### Algorithm

The algorithm uses the fundamental property of spherical geometry:

```
A point P on the planet surface is visible from camera C if:
    dot(normalize(P), normalize(C)) > R / |C|

Where:
- P = mesh center (relative to planet center)
- C = camera position (relative to planet center)
- R = planet radius
- |C| = distance from planet center to camera
```

### Implementation (GPU Compute Shader)

The core culling logic has been moved from JavaScript to a **Compute Shader** (`frustumCull.compute.wgsl.js`) for massive parallelism.

```wgsl
// GPU Compute Implementation
let planetToCamera = -params.earthCenterOffset;
let planetToChunk = cameraRelativeCenter - params.earthCenterOffset;

let camDist = length(planetToCamera);
let chunkDist = length(planetToChunk);

if (camDist > params.planetRadius) {
  let horizonCos = params.planetRadius / camDist;
  let dotProduct = dot(planetToCamera / camDist, planetToChunk / chunkDist);
  
  // High-precision adaptive margin
  if (dotProduct < (horizonCos - margin)) {
    isVisible = false; // CULLED ON GPU
  }
}
```

### Adaptive Margin

| LOD Level | Level Factor | Margin | Purpose |
|-----------|--------------|--------|---------|
| 0 (root)  | 1.0          | 0.30   | Large quads need larger margin |
| 5         | 0.5          | 0.275  | Intermediate margin |
| 10+       | 0.0          | 0.25   | Minimal margin for detail |

This prevents **popping** where a quad's corners are visible but center is behind horizon.

---

## 2. Frustum Culling (Second Stage)

### What It Does
Frustum culling removes terrain quads that are **outside the camera's view frustum** (viewport). Even if a quad is above the horizon, if it's behind the camera or to the side, it won't be rendered.

### Algorithm Options

The system implements **two frustum culling approaches**:

#### A. GPU-Accelerated Back-Cone Culling

In the compute shader, we check if a quad is roughly in front of the camera using its camera-relative center:

```wgsl
// GPU Compute Pass (2nd Stage)
let toChunkNorm = cameraRelativeCenter / dist;
let dotForward = dot(toChunkNorm, params.cameraForward);
let angularRadius = chunk.radius / dist;

// Adaptive 127° back-cone (dotForward > -0.6 + angularRadius)
if (dotForward < -0.6 - angularRadius) {
  isVisible = false; // CULLED ON GPU
}
```

**Why 143°?** This creates a cone that excludes quads directly behind the camera while keeping quads at the edges of peripheral vision. The wide margin prevents popping during fast camera rotation.

#### B. Full 6-Plane Frustum Culling (Used in Mesh Rendering)

The precise method that tests bounding spheres against all 6 frustum planes:

```javascript
// Extract frustum planes from view-projection matrix
// Each plane: [nx, ny, nz, d] where nx*x + ny*y + nz*z + d = 0

const planes = extractFrustumPlanes(viewProjection);
// planes = [left, right, bottom, top, near, far]

// Test mesh bounding sphere against each plane
for (const plane of planes) {
  const distance = 
    plane[0] * center.x + 
    plane[1] * center.y + 
    plane[2] * center.z + 
    plane[3];
  
  // If center is behind plane by more than radius, cull
  if (distance < -boundingRadius) return false;
}
```

---

## Culling Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│                     ALL TERRAIN QUADS                       │
│                        (Quadtree)                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              STAGE 1: HORIZON CULLING                       │
│                                                             │
│   ✓ dot(C, P) > R/|C| - margin  →  PASS                    │
│   ✗ dot(C, P) < R/|C| - margin  →  CULL (behind planet)    │
│                                                             │
│   Cost: ~10 operations per quad                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              STAGE 2: FRUSTUM CULLING (GPU)                 │
│                                                             │
│   Compute Pass: Back-cone (143°)                            │
│   Compute Pass: Horizon Intersection Test                   │
│                                                             │
│   ✓ PASS → Write to visibleIndicesBuffer                    │
│   ✗ FAIL → Skip atomicAdd                                   │
│                                                             │
│   Cost: Massive parallelism on GPU                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   VISIBLE QUADS ONLY                        │
│          Drawn via Indirect Draw (no CPU CPU readback)      │
└─────────────────────────────────────────────────────────────┘
```

---

## Performance Statistics

The `FrustumCuller` class tracks culling statistics per frame:

```javascript
{
  total: 150,         // Total quads tested
  horizonCulled: 80,  // Removed by horizon culling (~53%)
  frustumCulled: 30,  // Removed by frustum culling (~20%)
  rendered: 40        // Actually rendered (~27%)
}
```

Typical culling rates:
- **Horizon Culling**: Removes 40-60% of quads (entire far hemisphere)
- **Frustum Culling**: Removes 10-30% of remaining quads
- **Total Reduction**: 60-80% of quads never reach GPU

---

## Key Implementation Files

| File | Component | Description |
|------|-----------|-------------|
| `lib/terrain/quadtree.js` | `isVisible()` | Combined horizon + back-cone culling |
| `lib/systems/frustum.js` | `FrustumCuller` | Full 6-plane extraction and testing |
| `lib/systems/frustum.js` | `isAboveHorizon()` | Standalone horizon test |
| `lib/terrain/mesh.js` | `isInFrustum()` | Per-mesh plane testing |

---

## Configuration Constants

```javascript
// In lib/config/index.js (Consolidated from terrainConfig/planetConfig)
const HORIZON_GROUND_MARGIN = 0.25; // Minimum margin for high-LOD quads
const HORIZON_SPACE_MARGIN = 0.30;  // Maximum margin for root quads (L0)
const BACK_CONE_THRESHOLD = -0.6;   // ~127° back-cone
const CLOSE_DISTANCE_FACTOR = 3.0;  // Always render if dist < size * 3
```

---

## Important Notes

1. **Order Matters**: Horizon culling is faster, so it runs first
2. **Conservative Margins**: Better to render a few extra quads than have holes
3. **Bounding Sphere Inflation**: Terrain meshes inflate radius by 8km for mountain peaks
4. **Floating Origin**: All calculations use camera-relative coordinates

---

## Visual Debug

Enable debug visualization in UI to see culling in action:
- **Quads checkbox**: Shows chunk borders
- **Grid mode**: Shows wireframe with culled areas absent
- Culling stats displayed in real-time HUD

---

## Related — Planetary rendering

Part of OVGrid's planetary-rendering research set:

- [floating-origin-guide.md](floating-origin-guide.md) — Float64 CPU → camera-relative Float32 GPU (jitter-free up to LOD 22)
- [terrain-mesh.md](terrain-mesh.md) — procedural planetary terrain (quadtree + LOD)
- [clouds-performance.md](clouds-performance.md) — GPU-baked triple-layer clouds
- [rain-system.md](rain-system.md) — weather pipeline (rain / snow / storm)

← back to the [README](../README.md#documentation)

---

## Author

Esteban Fuster Pozzi (@estebanrfp) — Full Stack JavaScript Developer
