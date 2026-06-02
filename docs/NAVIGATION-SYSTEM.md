# Sistema de Navegación - OVGrid Planet

El sistema de navegación de OVGrid utiliza un modelo de **Velocidad Dual** (Logarítmica/Lineal) diseñado para permitir transiciones fluidas desde el espacio profundo hasta la exploración a nivel de suelo.

---

## 🚀 Modelo de Velocidad Adaptativa

El motor ajusta la velocidad del avatar automáticamente según su altitud sobre la superficie del planeta.

### 1. Zona Espacial (> 100 km)
Utiliza una escala **Logarítmica** para cubrir distancias astronómicas en segundos.
- **Escalado:** La velocidad aumenta exponencialmente con la altitud.
- **Capacidad:** Permite alcanzar velocidades de hasta **6,000 km/s** en espacio profundo.

### 2. Zona Atmosférica (< 100 km)
Utiliza una **Interpolación Lineal (Lerp)** para proporcionar un "frenado natural" al aproximarse al suelo.
- **Límite de Transición:** 100 km (Configurable).
- **Velocidad de Suelo:** 100 metros por segundo (m/s) constante al nivel del mar.
- **Objetivo:** Garantizar precisión en el aterrizaje y una exploración cómoda de los biomas.

---

## ⌨️ Controles

| Tecla | Acción |
|-------|--------|
| **W/S** | Avanzar / Retroceder (Dirección de cámara) |
| **A/D** | Desplazamiento lateral (Strafe) |
| **Q/E** | Subir / Bajar (Independiente de la gravedad) |
| **Shift** | **Boost:** Multiplica la velocidad actual x2. |

### Prioridad de Navegación
Al presionar cualquier tecla de movimiento (**WASDQE**), el motor deshabilita temporalmente la gravedad para permitir una navegación libre (vuelo). Al soltar las teclas, el sistema de **Sticky Gravity** se reactiva para mantener al avatar pegado al terreno si está cerca del suelo.

---

## 🏃 Física y Colisión (Treadmill Bake)

La navegación interactúa con un sistema de física de alta precisión documentado en `gpu_physics_grid.md`.

*   **Bake de Proximidad:** Se genera un mapa de alturas de 512x512m (grid 64x64, 8m spacing) en la GPU cada vez que el avatar se desplaza >200m del centro del "bake".
*   **Paridad Visual:** El avatar siempre camina sobre lo que el usuario ve, eliminando el jittering gracias al sistema de **Floating Origin**.
*   **Snap-to-Ground:** El motor asegura un contacto firme con el terreno mediante un suavizado anti-rebote milimétrico.

---

## 🖱️ Sistema de Cámara
La cámara opera en modo **Orbital de Tercera Persona**:
- **Arrastrar (Ratón):** Rotar 360° alrededor del avatar.
- **Rueda (Ratón):** Zoom in / Zoom out.
- **Suavizado:** Todas las rotaciones y zooms tienen inercia aplicada para un movimiento cinematográfico.

### Colisión de Cámara con el Terreno (Terrain Probe)

Al inclinar la cámara hacia abajo, la posición orbital solicitada puede caer dentro
del terreno (suelo plano o una colina detrás del avatar). En lugar de un tope de
ángulo fijo —que no contempla la altura real del relieve— la cámara hace un
**sondeo del terreno** y acorta su distancia orbital hasta despejar.

Implementado en `lib/core/CameraSystem.js` (`getOrbitalState`):

1. **Sonda inyectada:** el host pasa `physicsSystem.getHeightAt` vía
   `cameraSystem.setTerrainProbe(fn)`. Devuelve la altura del terreno (km sobre el
   nivel del mar) en cualquier punto del *physics grid* de 512×512 m.
2. **Baseline en el avatar:** se muestrea la altura del terreno bajo el avatar.
   Ese punto **siempre** cae dentro del grid (el grid se centra en el avatar), así
   que es el suelo de referencia fiable cuando la sonda de la cámara cae fuera de
   cobertura.
3. **Muestreo del rayo:** se toman 5 muestras a lo largo del segmento avatar→cámara
   y se queda con la altura **máxima** — así detecta colinas que se levanten entre
   el avatar y la posición de cámara solicitada.
4. **Búsqueda binaria:** si la cámara quedaría por debajo de
   `alturaMáxTerreno + groundClearance`, se hace una búsqueda binaria de 10 pasos
   sobre la distancia orbital para encontrar la mayor distancia despejada y la
   cámara se acerca al avatar hasta ese punto.
5. **Margen de seguridad:** `CAMERA_CONFIG.groundClearance` (3 m) hace que la
   cámara se detenga con un hueco visible antes de rozar el suelo.

Las coordenadas se manejan en espacio mundo (Float64 en CPU) y la altitud de la
cámara se compara como `|cámara − centroTierra| − EARTH_RADIUS`, coherente con el
modelo esférico del planeta y el **Floating Origin**.

---
*Manual de Navegación actualizado - Mayo 2026*
