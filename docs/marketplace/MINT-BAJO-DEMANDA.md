# Modelo B — Mint Bajo Demanda para Tierras en un Metaverso Planetario

## 1. Introducción

El **Modelo B (Mint bajo demanda)** es una arquitectura de tokenización de tierras diseñada para metaversos con un **espacio finito, determinista y escaso**, como un planeta dividido en un grid de coordenadas.

A diferencia del mint masivo inicial, este modelo **solo crea NFTs cuando existe una acción real de usuario**, manteniendo la escasez absoluta sin incurrir en costes innecesarios ni rigidez temprana.

Este enfoque es actualmente la **mejor práctica** para metaversos modernos por su equilibrio entre:
- eficiencia técnica,
- solidez económica,
- y flexibilidad evolutiva.

---

## 2. Principios Fundamentales

El modelo se apoya en cuatro principios innegociables:

### 2.1 Espacio finito e inmutable
El planeta tiene un **límite matemático absoluto**, definido desde el inicio:
- radio planetario,
- bounding box,
- latitud / longitud discretizada,
- o grid cartesiano limitado.

> No existe ningún mecanismo para expandir el espacio más allá de ese dominio.

---

### 2.2 Existencia conceptual previa al NFT

Todas las tierras:
- **existen conceptualmente** desde el génesis del planeta,
- pero **no existen on-chain** hasta que alguien las reclama.

El NFT no crea la tierra:  
👉 **el NFT certifica su propiedad**.

---

### 2.3 Mint Just-In-Time (JIT)

Una parcela:
- se mintea **solo cuando un usuario ejecuta una acción válida**:
  - compra,
  - reclamación,
  - adjudicación,
  - evento de exploración.

Esto elimina NFTs ociosos y reduce el ruido on-chain.

---

### 2.4 Determinismo total

Cada coordenada válida:
- es única,
- verificable,
- y mapeable a un `tokenId` determinista.

No existe aleatoriedad en la identidad del terreno.

---

## 3. Arquitectura Técnica

### 3.1 Dominio de Coordenadas

El planeta define un conjunto **cerrado y verificable** de coordenadas.

Ejemplos:
- Grid cartesiano: `(x, y)` con límites fijos.
- Esfera discretizada: `(lat, lon, alt)`.
- Hex-grid planetario.

```text
Valid(x, y) = true si:
- x ∈ [-N, +N]
- y ∈ [-N, +N]
- (x, y) ∈ superficie del planeta
