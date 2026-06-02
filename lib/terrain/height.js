/**
 * PlanetHeight.js - CPU-side Terrain Height Calculator
 * 
 * 🔄 SYNCHRONIZED with terrainChunk.wgsl:getTerrainHeight()
 * 
 * This file provides altitude calculations for camera/physics using the SAME
 * algorithm as the GPU terrain shader. This ensures that the camera's
 * collision detection matches the visible terrain exactly.
 * 
 * 🔑 FLOATING_ORIGIN: CPU decides WHAT exists (positions, LOD decisions).
 */

import { TERRAIN_SCALES, TERRAIN_GENERATION_PARAMS } from '../config/terrainConfig.js';

// --- Math Helpers ---
const fract = (x) => x - Math.floor(x);

function mix(a, b, t) {
  return a + t * (b - a);
}

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// --- Noise System (MATCHING mainPlanet.js) ---

const hash33 = (x, y, z) => {
  // Exact port of WGSL hash33 function
  // WGSL: var q = fract(p * vec3f(443.897, 441.423, 437.195));
  let qx = (x * 443.897); qx -= Math.floor(qx);
  let qy = (y * 441.423); qy -= Math.floor(qy);
  let qz = (z * 437.195); qz -= Math.floor(qz);
  
  // WGSL: q += dot(q, q.yxz + 19.19);
  // q.yxz = [qy, qx, qz], so dot(q, q.yxz + 19.19) = qx*(qy+19.19) + qy*(qx+19.19) + qz*(qz+19.19)
  const dotVal = qx * (qy + 19.19) + qy * (qx + 19.19) + qz * (qz + 19.19);
  qx += dotVal;
  qy += dotVal;
  qz += dotVal;
  
  // WGSL: return fract((q.xxy + q.yxx) * q.zyx);
  // q.xxy = [qx, qx, qy], q.yxx = [qy, qx, qx], q.zyx = [qz, qy, qx]
  // (q.xxy + q.yxx) = [qx+qy, qx+qx, qy+qx]
  // * q.zyx = [(qx+qy)*qz, (qx+qx)*qy, (qy+qx)*qx]
  let r0 = (qx + qy) * qz; r0 -= Math.floor(r0);
  let r1 = (qx + qx) * qy; r1 -= Math.floor(r1);
  let r2 = (qy + qx) * qx; r2 -= Math.floor(r2);
  
  return [r0, r1, r2];
};

const gradientNoise = (x, y, z) => {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  
  // Quintic interpolation
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const uz = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
  
  const dotGrad = (ix, iy, iz, x, y, z) => {
    const g = hash33(ix, iy, iz);
    return (g[0] * 2 - 1) * x + (g[1] * 2 - 1) * y + (g[2] * 2 - 1) * z;
  };

  const n000 = dotGrad(ix, iy, iz, fx, fy, fz);
  const n001 = dotGrad(ix, iy, iz + 1, fx, fy, fz - 1);
  const n010 = dotGrad(ix, iy + 1, iz, fx, fy - 1, fz);
  const n011 = dotGrad(ix, iy + 1, iz + 1, fx, fy - 1, fz - 1);
  const n100 = dotGrad(ix + 1, iy, iz, fx - 1, fy, fz);
  const n101 = dotGrad(ix + 1, iy, iz + 1, fx - 1, fy, fz - 1);
  const n110 = dotGrad(ix + 1, iy + 1, iz, fx - 1, fy - 1, fz);
  const n111 = dotGrad(ix + 1, iy + 1, iz + 1, fx - 1, fy - 1, fz - 1);

  return mix(
    mix(mix(n000, n100, ux), mix(n010, n110, ux), uy),
    mix(mix(n001, n101, ux), mix(n011, n111, ux), uy),
    uz
  );
};

const ridgeNoise = (x, y, z) => 1.0 - Math.abs(gradientNoise(x, y, z));

// --- Main Terrain Logic (MATCHING terrainChunk.wgsl getTerrainHeight) ---

/**
 * Calculates the terrain height using the SAME algorithm as terrainChunk.wgsl
 * 🔄 SYNCHRONIZED with terrainChunk.wgsl:getTerrainHeight()
 * @param {number[]} normal - Normalized direction vector [nx, ny, nz]
 * @param {number} octaves - Number of fBM octaves (default 12, max 16)
 * @param {Object} params - Terrain parameters matching TerrainParams in WGSL
 */
export function getTerrainHeightMultiplier(normal, octaves = 14, params = {}) {
  const nx = normal[0], ny = normal[1], nz = normal[2];
  
  // Default parameters matching UI defaults in index.html and mainPlanet.js
  const p = {
    warpFactor: params.warpFactor ?? TERRAIN_GENERATION_PARAMS.warpFactor,
    mountMaskFreq: params.mountMaskFreq ?? TERRAIN_GENERATION_PARAMS.mountMaskFreq,
    baseFrequency: params.baseFrequency ?? TERRAIN_GENERATION_PARAMS.baseFrequency,
    baseAmplitude: params.baseAmplitude ?? TERRAIN_GENERATION_PARAMS.baseAmplitude,
    persistence: params.persistence ?? TERRAIN_GENERATION_PARAMS.persistence,
    lacunarity: params.lacunarity ?? TERRAIN_GENERATION_PARAMS.lacunarity,
    contrastExp: params.contrastExp ?? TERRAIN_GENERATION_PARAMS.contrastExp,
    contrastScale: params.contrastScale ?? TERRAIN_GENERATION_PARAMS.contrastScale,
    seaLevelOffset: params.seaLevelOffset ?? TERRAIN_GENERATION_PARAMS.seaLevelOffset,
    ridgeDetail: params.ridgeDetail ?? TERRAIN_GENERATION_PARAMS.ridgeDetail,
    abyssDetail: params.abyssDetail ?? TERRAIN_GENERATION_PARAMS.abyssDetail,
    detailScale: params.detailScale ?? TERRAIN_GENERATION_PARAMS.detailScale,
    grassCoverage: params.grassCoverage ?? TERRAIN_GENERATION_PARAMS.grassCoverage,
    sandCoverage: params.sandCoverage ?? TERRAIN_GENERATION_PARAMS.sandCoverage,
    snowCoverage: params.snowCoverage ?? TERRAIN_GENERATION_PARAMS.snowCoverage,
    rockCoverage: params.rockCoverage ?? TERRAIN_GENERATION_PARAMS.rockCoverage,
    // NEW PARAMS
    octaves: params.octaves ?? TERRAIN_GENERATION_PARAMS.octaves,
    warpScale: params.warpScale ?? TERRAIN_GENERATION_PARAMS.warpScale,
    warpStrength2: params.warpStrength2 ?? TERRAIN_GENERATION_PARAMS.warpStrength2,
    peakSoftness: params.peakSoftness ?? TERRAIN_GENERATION_PARAMS.peakSoftness,
    showNoise: params.showNoise ?? TERRAIN_GENERATION_PARAMS.showNoise
  };

  // 1. DOMAIN WARPING: Broken, natural shapes
  const ws = p.warpScale;
  const q = [
    gradientNoise(nx * ws, ny * ws, nz * ws),
    gradientNoise(nx * ws + 5.2, ny * ws + 1.3, nz * ws),
    gradientNoise(nx * ws + 1.1, ny * ws, nz * ws + 2.4)
  ];
  
  const p1x = nx + q[0] * p.warpFactor;
  const p1y = ny + q[1] * p.warpFactor;
  const p1z = nz + q[2] * p.warpFactor;
  
  // Secondary warping
  const r = [
    gradientNoise(p1x * ws * 2.0 + 3.3, p1y * ws * 2.0, p1z * ws * 2.0),
    gradientNoise(p1x * ws * 2.0, p1y * ws * 2.0 + 4.4, p1z * ws * 2.0),
    gradientNoise(p1x * ws * 2.0, p1y * ws * 2.0, p1z * ws * 2.0 + 5.5)
  ];
  
  const px = p1x + r[0] * p.warpStrength2;
  const py = p1y + r[1] * p.warpStrength2;
  const pz = p1z + r[2] * p.warpStrength2;

  // 2. MOUNTAIN/PLAINS MASK: Decide where detail applies
  const mount_mask = smoothstep(-0.1, 0.35, gradientNoise(px * p.mountMaskFreq + 12.3, py * p.mountMaskFreq + 12.3, pz * p.mountMaskFreq + 12.3));
  
  // 3. BASE fBM - SYNCHRONIZED WITH terrain.wgsl.js
  // Uses fixed 12 octaves with low base frequency (0.5) for stable continental shapes
  let h = 0;
  let a = p.baseAmplitude;
  let f = p.baseFrequency;  // Controlled by UI slider (default: 2.8)
  
  // Fixed octave count for ALL calculations (ensures physics matches visuals)
  // Value controlled by UI slider (p.octaves)
  const totalOctaves = Math.round(p.octaves);
  
  for (let i = 0; i < totalOctaves && i < 24; i++) {
    h += a * gradientNoise(px * f, py * f, pz * f);
    a *= p.persistence;
    f *= p.lacunarity;
  }
  
  // 4. VERTICAL CONTRAST BOOST & PEAK SOFTENING
  const hSign = Math.sign(h);
  let exp = p.contrastExp;
  
  // Soften peaks
  exp = mix(exp, exp * 0.5, smoothstep(0.1, 0.5, Math.abs(h)) * p.peakSoftness);

  h = (hSign * Math.pow(Math.abs(h), exp) * p.contrastScale) + p.seaLevelOffset;
  
  // 5. BIOME-SPECIFIC TOPOGRAPHY
  if (h > 0) {
    // Smoothen beaches: Flatten height significantly near sea level
    h = mix(h * 0.1, h, smoothstep(0.0, 0.1, h));
    
    // Mountain ridges: Only apply full ruggedness where mount_mask is high
    if (p.showNoise) {
      const ridgeFreq = p.baseFrequency * 1.6;
      const ridgeFreq2 = ridgeFreq * 2.7;
      const r1 = ridgeNoise(px * ridgeFreq, py * ridgeFreq, pz * ridgeFreq);
      const r2 = ridgeNoise(px * ridgeFreq2, py * ridgeFreq2, pz * ridgeFreq2);
      
      // Ridge Sharpness: Apply exponent to the ridge noise for sharper peaks
      const sharpness = p.mountainSharpness ?? 1.0;
      const sharp_r1 = Math.pow(r1, sharpness);
      
      const ridge_detail = (0.4 * sharp_r1 * sharp_r1 + 0.15 * r2) * (p.ridgeDetail ?? 1.0);
      h = h + ridge_detail * mount_mask * h * 1.4;
      
      // MOUNTAIN TERRACING (Planetary Style)
      const tAmt = p.terraceAmount ?? 0.0;
      if (tAmt > 0.0) {
          const tSmooth = p.terraceSmooth ?? 0.5;
          const val = h * tAmt;
          const cell = Math.floor(val);
          const f = val - cell;
          const s_frac = smoothstep(0.0, tSmooth, f);
          h = (cell + s_frac) / tAmt;
      }
    } else {
      h = h + gradientNoise(px * 2.5, py * 2.5, pz * 2.5) * mount_mask * h * 0.3;
    }

    // 5c. INLAND LAKES
    const lakeD = p.lakeDetail ?? 0.0;
    if (lakeD > 0) {
      const lakeFreq = p.baseFrequency * 2.5;
      const lakeNoise = gradientNoise(px * lakeFreq + 7.7, py * lakeFreq + 3.3, pz * lakeFreq + 9.9);
      const inlandMask = smoothstep(0.0, 0.01, h);
      h -= Math.max(0, lakeNoise) * lakeD * inlandMask * 0.15;
    }

  } else {
    // 5b. OCEAN TOPOGRAPHY: Deeper submarine relief
    
    // Ocean Shelf: Flatten the floor near sea level
    const shelfWidth = p.shelfWidth ?? 0.5;
    h = mix(h * 0.1, h, smoothstep(0.0, -0.2 * shelfWidth, h));
    
    // Submarine Detail: Create deep, cavernous trenches
    const tr1 = ridgeNoise(px * 5.0 + 12.3, py * 5.0 + 12.3, pz * 5.0 + 12.3);
    const tr2 = ridgeNoise(px * 15.0, py * 15.0, pz * 15.0);
    const abyss_detail = (tr1 * tr1 * 1.5 + tr2 * 0.4) * (p.abyssDetail ?? 1.0);
    
    // Scale abyss depth by current depth
    h -= abyss_detail * Math.abs(h) * 1.8 * smoothstep(0.0, -0.15, h);
  }
  
  return h * p.detailScale;
}


