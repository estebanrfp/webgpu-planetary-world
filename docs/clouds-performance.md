# Cloud System Performance Summary

This document outlines the optimization techniques used in the triple-layer cloud system to achieve high visual quality with minimal performance impact.

## 1. GPU Texture Baking

- **Mechanism**: Instead of calculating complex fractal noise (Perlin/Simplex) for every pixel in every frame, the cloud pattern is generated **once** during initialization using a GPU Compute Shader.
- **Benefit**: The result is stored in a 2D texture. During rendering, the GPU only needs to perform a simple texture sample instead of expensive mathematical computations. Read operations are significantly faster than real-time noise generation.

## 2. Triplanar Cloud Projection

- **Mechanism**: Cloud UVs are computed using **triplanar mapping** on the normalized direction vector from the planet center to the cloud hit point. Three orthogonal planes (YZ, XZ, XY) are sampled and blended using cubic weights (`abs(normal)^3`), eliminating polar singularity entirely.
- **Previous approach**: Spherical lon/lat projection suffered from UV compression near the zenith, causing visible streaks on small planets (795 km radius). The triplanar method is singularity-free at any latitude.
- **Auto-scaling**: UV scales are computed as `configScale * 1000 / acos(R / (R + cloudAlt))`, which automatically adapts to any planet radius. On a 795 km planet with 4 km cloud altitude, the visible cloud dome subtends only ~5.7 degrees, so scales are amplified accordingly.
- **Cost**: 9 texture samples per fragment (3 layers x 3 planes) vs 3 with the old spherical method. However, `textureSampleLevel` with a fixed mip level is very cheap, and the elimination of `atan2`/`asin` trigonometric functions partially compensates. Net impact is ~0.1-0.3 ms per frame on modern GPUs.

## 3. Triple-Layer Parallax with Single Texture

- **Mechanism**: All three cloud layers share the **same baked noise texture**. Parallax and variety are achieved by varying the scale (UV coordinates), speed, and opacity for each layer within the shader.
- **Layer roles**: Layer 1 (Primary) provides sharp cloud structure, Layer 2 (Broad) adds mid-frequency detail, Layer 3 (Stratospheric Cirrus) acts as a diffuse connector between the other layers.
- **Benefit**: By reusing a single texture, the system minimizes GPU memory usage and maximizes cache hits, reducing memory bandwidth pressure while creating a complex, multi-depth appearance.

## 4. Zero-Cost Cinematic Interpolation

- **Mechanism**: Smooth transitions between weather states (presets) are handled by a frame-based linear interpolation (`lerp`) engine on the CPU.
- **Benefit**: The CPU calculates the transition values (a negligible task) and sends only the final per-frame parameters to the GPU. For the GPU, rendering a storm cloud is just as efficient as rendering a clear sky, as it only involves receiving different float values in its uniform buffer.

## 5. Precomputed Lighting Integration

- **Mechanism**: The cloud system is integrated with the project's precomputed atmospheric scattering LUTs (Look-Up Tables).
- **Benefit**: Instead of calculating light scattering and transmittance for every cloud particle, the shader samples pre-calculated transmittance data. This allows clouds to correctly tint during sunset or darken in shadows with extreme efficiency.

## 6. Real-Time Cloud Shadows (Triplanar)

- **Mechanism**: The terrain shader (`sampleCloudShadow`) uses the same triplanar projection to sample the cloud texture and modulate terrain lighting. All 3 layers are sampled at mip level 2.0 for performance. The atmosphere volumetric shadow function (`SampleCloudShadow`) samples only Layer 1 with triplanar for god-ray calculations.
- **Benefit**: Cloud shadows on the planet surface perfectly match the visual sky layers in pattern and movement, with zero projection mismatch between sky and ground.

## 7. Early Exit & Culling

- **Mechanism**: The system includes baked-in logic to handle "early exits" based on camera altitude and atmospheric density.
- **Benefit**: When the camera moves into outer space, the cloud rendering workload is naturally minimized or skipped where atmosphere density is zero, freeing up resources for other planetary rendering tasks.

---

### Conclusion

The triple-layer cloud system represents a "Sweet Spot" in graphics programming: it delivers a cinematic, dynamic sky using high-performance techniques that preserve a stable and high frame rate across various hardware configurations.

---

## Related — Planetary rendering

Part of this project's planetary-rendering research set:

- [floating-origin-guide.md](floating-origin-guide.md) — Float64 CPU → camera-relative Float32 GPU (jitter-free up to LOD 22)
- [terrain-mesh.md](terrain-mesh.md) — procedural planetary terrain (quadtree + LOD)
- [culling-system.md](culling-system.md) — hybrid CPU + GPU culling
- [rain-system.md](rain-system.md) — weather pipeline (rain / snow / storm)

← back to the [README](../README.md#documentation)

---

## Author

Esteban Fuster Pozzi (@estebanrfp) — Full Stack JavaScript Developer
*Updated - February 9, 2026*
