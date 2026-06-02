# Especificación Técnica: Sistema de Terreno Procedural Planetario

Este documento detalla la implementación actual del sistema de terreno en el motor **OVGrid**, optimizado para renderizado planetario a escala real con precisión milimétrica.

## 1. Arquitectura del Terreno
El sistema utiliza una estructura de **Quadtree Dinámico** para la partición espacial y la gestión del Nivel de Detalle (LOD).

### Componentes Core:
*   **PlanetRenderer:** Fábrica principal (`createPlanetRenderer`). Orquestra el ciclo de vida de los chunks y la comunicación con la GPU.
*   **TerrainChunkPool:** Gestión de reciclaje de IDs de instancia para evitar la fragmentación de memoria en WebGPU.
*   **TerrainChunkBuilder:** Construcción asíncrona de topología (fábrica `createTerrainBuilder`).
*   **Central Config:** El sistema consume constantes de `lib/config/index.js`, asegurando paridad entre el radio planetario visual y el físico.

## 2. Quadtree y LOD Adaptativo
El planeta se divide recursivamente basándose en la proximidad de la cámara.

*   **Subdivisión Dinámica:** Los nodos se subdividen en 4 hijos si la distancia de la cámara es menor que un umbral proporcional al tamaño del nodo.
*   **LOD Progresivo:** Permite hasta 22 niveles visuales de profundidad (centímetros al nivel del suelo) mapeados a 14 niveles físicos de subdivisión, manteniendo la vista del horizonte planetario estable.
*   **Escalones de Resolución:** Solo se subdividen los quads frente a la cámara, creando una "pirámide de detalle" optimizada.

## 3. Implementación WebGPU (Pure GPU-Driven)

El motor utiliza un enfoque de **Instanced Rendering** masivo con **Vertex Pulling** para maximizar el throughput de la GPU.

### Arquitectura de Vértices:
*   **Static Unit Grid:** Un único buffer de vértices estático de 25x25 (625 vértices) reside en la memoria de la GPU.
*   **Vertex Pulling:** El Vertex Shader no recibe atributos tradicionales. En su lugar, "tira" (pulls) los datos del buffer de vértices y del *Instance Storage Buffer* usando `@builtin(vertex_index)` y `@builtin(instance_index)`.
*   **Instancia por Chunk:** Cada chunk visible es una instancia que aporta sus metadatos (centro, escala, LOD).

### Flujo de Transformación (Vertex Shader):
1.  **Proyección Esférica:** El quad plano se proyecta matemáticamente sobre la esfera planetaria usando la normal del vértice.
2.  **Desplazamiento Procedural:** Se calcula el `getTerrainHeight` usando ruido fractal (Gradient Noise + Ridge Noise) directamente en el Vertex Shader.
3.  **Floating Origin Re-centering:** La posición final se calcula relativa a la cámara: `pos = chunkCenter + localPos + (normal * height)`.

## 4. Gestión de Memoria y Rendimiento
*   **Zero CPU-to-GPU Vertex Copy:** No se envían vértices por frame. La CPU solo envía un pequeño buffer de índices de instancias visibles tras el culling.
*   **Object Pooling:** El `TerrainChunkPool` recicla las ID de instancia y los buffers de metadatos, eliminando la latencia de creación de recursos WebGPU.

## 5. Paridad Física
El sistema de física (documentado en `gpu_physics_grid.md`) utiliza los mismos parámetros y algoritmos que el sistema visual, garantizando que el avatar nunca se hunda ni flote sobre el terreno generado.

---
*Documentación técnica actualizada - Diciembre 2025*

---

## Related — Planetary rendering

Part of OVGrid's planetary-rendering research set:

- [floating-origin-guide.md](floating-origin-guide.md) — Float64 CPU → camera-relative Float32 GPU (jitter-free up to LOD 22)
- [culling-system.md](culling-system.md) — hybrid CPU + GPU culling
- [clouds-performance.md](clouds-performance.md) — GPU-baked triple-layer clouds
- [rain-system.md](rain-system.md) — weather pipeline (rain / snow / storm)

← back to the [README](../README.md#documentation)
