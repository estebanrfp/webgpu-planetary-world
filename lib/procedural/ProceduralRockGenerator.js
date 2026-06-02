/**
 * ProceduralRockGenerator — template-based procedural rock mesh generation
 *
 * Uses an embedded low-poly rock mesh (extracted from rock_base_01.glb)
 * as base template. Two generation modes:
 *   - Single rock: seeded vertex displacement for shape variation
 *   - Rock cluster: 3-4 sub-rocks merged into one formation
 *
 * Zero network requests, fully deterministic.
 * Outputs GPU-ready buffers compatible with RockSystem's render pipeline.
 *
 * @module procedural/ProceduralRockGenerator
 * @author Esteban Fuster Pozzi (@estebanrfp)
 */

// ── Hash (Murmur3 finalizer) ────────────────────────────────────────────────────

/** @param {number} seed @param {number} idx @returns {number} [0, 1) */
const hash = (seed, idx) => {
  let h = (seed * 2654435761 + idx * 2246822519) | 0;
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

// ── Base Template (rock_base_01.glb — 14 unique verts, 24 tris) ─────────────────

const BASE_POSITIONS = new Float32Array([
  -0.054614, 0.335033, 0.294831,
  -0.381129, 0.189275, 0.015533,
  -0.478424,-0.024691, 0.457832,
   0.457402,-0.335033, 0.430274,
   0.231792, 0.231503, 0.235856,
   0.159179,-0.335033,-0.483295,
   0.349952,-0.004622,-0.453914,
   0.500000,-0.335033,-0.105005,
  -0.500000,-0.335033, 0.271162,
  -0.286577,-0.335033, 0.483295,
  -0.488413,-0.109709, 0.469265,
   0.254590, 0.132854,-0.427119,
  -0.381129, 0.050456,-0.384105,
  -0.366867,-0.335033,-0.379407,
]);

const BASE_INDICES = new Uint32Array([
  0,1,2,   3,4,0,   5,6,7,   8,9,10,
  0,12,1,  12,0,11,  11,0,4,  7,4,3,
  4,7,11,  11,7,6,   12,5,13, 5,12,6,
  6,12,11, 0,9,3,    9,0,10,  10,0,2,
  2,8,10,  8,2,1,    8,1,13,  13,1,12,
  13,9,8,  9,13,5,   9,5,3,   3,5,7,
]);

const VERT_COUNT = BASE_POSITIONS.length / 3;  // 14
const FACE_COUNT = BASE_INDICES.length / 3;     // 24

// ── Precompute smooth normals for the base template ─────────────────────────────

const computeSmoothNormals = (pos, idx, vertCount, faceCount) => {
  const normals = new Float32Array(vertCount * 3);

  for (let f = 0; f < faceCount; f++) {
    const i0 = idx[f * 3], i1 = idx[f * 3 + 1], i2 = idx[f * 3 + 2];
    const ax = pos[i0 * 3], ay = pos[i0 * 3 + 1], az = pos[i0 * 3 + 2];
    const bx = pos[i1 * 3], by = pos[i1 * 3 + 1], bz = pos[i1 * 3 + 2];
    const cx = pos[i2 * 3], cy = pos[i2 * 3 + 1], cz = pos[i2 * 3 + 2];

    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;

    for (const vi of [i0, i1, i2]) {
      normals[vi * 3]     += nx;
      normals[vi * 3 + 1] += ny;
      normals[vi * 3 + 2] += nz;
    }
  }

  for (let i = 0; i < vertCount; i++) {
    const x = normals[i * 3], y = normals[i * 3 + 1], z = normals[i * 3 + 2];
    const len = Math.sqrt(x * x + y * y + z * z) || 1;
    normals[i * 3] = x / len;
    normals[i * 3 + 1] = y / len;
    normals[i * 3 + 2] = z / len;
  }

  return normals;
};

const BASE_NORMALS = computeSmoothNormals(BASE_POSITIONS, BASE_INDICES, VERT_COUNT, FACE_COUNT);

// ── Shape Presets ────────────────────────────────────────────────────────────────

const ROCK_SHAPES = [
  { name: 'boulder',     scaleXYZ: [1.0, 0.85, 1.0],  disp: 0.08, cluster: null      },
  { name: 'flat_stone',  scaleXYZ: [1.2, 0.55, 1.1],  disp: 0.06, cluster: null      },
  { name: 'tall_rock',   scaleXYZ: [0.8, 1.20, 0.85], disp: 0.10, cluster: null      },
  { name: 'wide_jagged', scaleXYZ: [1.15, 0.70, 0.9], disp: 0.12, cluster: null      },
  { name: 'round_stone', scaleXYZ: [1.0, 0.90, 1.0],  disp: 0.05, cluster: null      },
  { name: 'formation',   scaleXYZ: [1.0, 0.80, 1.0],  disp: 0.08, cluster: 'basic'   },
  { name: 'mound',       scaleXYZ: [1.0, 0.85, 1.0],  disp: 0.08, cluster: 'mound'   },
  { name: 'pergola',     scaleXYZ: [0.9, 1.30, 0.9],  disp: 0.06, cluster: 'pergola' },
];

// ── Single Rock Generator ───────────────────────────────────────────────────────

/**
 * Generate displaced positions from base template.
 * @returns {Float32Array} displaced positions (VERT_COUNT * 3)
 */
const generateSinglePositions = (seed, sx, sy, sz, displacement) => {
  const pos = new Float32Array(BASE_POSITIONS);

  for (let i = 0; i < VERT_COUNT; i++) {
    pos[i * 3] *= sx;
    pos[i * 3 + 1] *= sy;
    pos[i * 3 + 2] *= sz;
  }

  for (let i = 0; i < VERT_COUNT; i++) {
    const d = (hash(seed, i) * 2 - 1) * displacement;
    pos[i * 3]     += BASE_NORMALS[i * 3]     * d;
    pos[i * 3 + 1] += BASE_NORMALS[i * 3 + 1] * d;
    pos[i * 3 + 2] += BASE_NORMALS[i * 3 + 2] * d;
  }

  return pos;
};

// ── Cluster Generator ───────────────────────────────────────────────────────────

/**
 * Generate a rock formation by merging multiple displaced sub-rocks.
 * @param {string} clusterType - 'basic', 'mound', or 'pergola'
 * @returns {{ positions: Float32Array, indices: Uint32Array, vertCount: number, faceCount: number }}
 */
const generateClusterMesh = (seed, sx, sy, sz, displacement, clusterType) => {
  const allPos = [];
  const allIdx = [];
  let vertOffset = 0;

  /**
   * Add one sub-rock to the formation.
   * @param {number} subSeed
   * @param {number} offX - XZ offset
   * @param {number} offY - Y offset (height)
   * @param {number} offZ
   * @param {number} scaleX
   * @param {number} scaleY
   * @param {number} scaleZ
   * @param {number} yRot - Y-axis rotation (radians)
   */
  const addSubRock = (subSeed, offX, offY, offZ, scaleX, scaleY, scaleZ, yRot) => {
    const cosR = Math.cos(yRot), sinR = Math.sin(yRot);
    const subPos = generateSinglePositions(subSeed, sx * scaleX, sy * scaleY, sz * scaleZ, displacement);

    for (let i = 0; i < VERT_COUNT; i++) {
      const x = subPos[i * 3], y = subPos[i * 3 + 1], z = subPos[i * 3 + 2];
      allPos.push(
        x * cosR - z * sinR + offX,
        y + offY,
        x * sinR + z * cosR + offZ
      );
    }

    for (let i = 0; i < BASE_INDICES.length; i++) {
      allIdx.push(BASE_INDICES[i] + vertOffset);
    }

    vertOffset += VERT_COUNT;
  };

  if (clusterType === 'basic') {
    // Basic formation: 3-4 rocks scattered around center
    const subCount = 3 + (hash(seed, 999) > 0.5 ? 1 : 0);
    for (let s = 0; s < subCount; s++) {
      const subSeed = seed + s * 3571;
      const angle = hash(subSeed, 0) * Math.PI * 2;
      const dist = 0.15 + hash(subSeed, 1) * 0.2;
      const subScale = 0.5 + hash(subSeed, 2) * 0.6;
      const yRot = hash(subSeed, 3) * Math.PI * 2;
      addSubRock(subSeed, Math.cos(angle) * dist, 0, Math.sin(angle) * dist, subScale, subScale, subScale, yRot);
    }
  } else if (clusterType === 'mound') {
    // Mound: 7-8 rocks in layers (base layer + middle + top)
    const totalRocks = 7 + (hash(seed, 888) > 0.5 ? 1 : 0);

    // Base layer: 4-5 rocks in circle
    const baseCount = totalRocks > 7 ? 5 : 4;
    for (let i = 0; i < baseCount; i++) {
      const subSeed = seed + i * 2371;
      const angle = (i / baseCount) * Math.PI * 2 + hash(subSeed, 0) * 0.5;
      const dist = 0.25 + hash(subSeed, 1) * 0.15;
      const scale = 0.6 + hash(subSeed, 2) * 0.5;
      addSubRock(subSeed, Math.cos(angle) * dist, 0, Math.sin(angle) * dist, scale, scale * 0.7, scale, hash(subSeed, 3) * Math.PI * 2);
    }

    // Middle layer: 2-3 rocks
    const midCount = totalRocks - baseCount - 1;
    for (let i = 0; i < midCount; i++) {
      const subSeed = seed + (baseCount + i) * 2371;
      const angle = hash(subSeed, 0) * Math.PI * 2;
      const dist = 0.08 + hash(subSeed, 1) * 0.12;
      const scale = 0.5 + hash(subSeed, 2) * 0.4;
      addSubRock(subSeed, Math.cos(angle) * dist, 0.15, Math.sin(angle) * dist, scale, scale, scale, hash(subSeed, 3) * Math.PI * 2);
    }

    // Top: 1 rock (peak)
    const topSeed = seed + totalRocks * 2371;
    const topScale = 0.4 + hash(topSeed, 0) * 0.3;
    addSubRock(topSeed, hash(topSeed, 1) * 0.05, 0.28, hash(topSeed, 2) * 0.05, topScale, topScale * 1.2, topScale, hash(topSeed, 3) * Math.PI * 2);

  } else if (clusterType === 'pergola') {
    // Pergola: archway with 2-3 vertical pillars per side + 1-2 horizontal rocks on top

    // Left pillars (2 tall rocks)
    addSubRock(seed + 100, -0.30, 0, -0.05, 0.5, 1.5, 0.5, hash(seed, 10) * 0.3);
    addSubRock(seed + 101, -0.28, 0, 0.08, 0.45, 1.3, 0.45, hash(seed, 11) * 0.3);

    // Right pillars (2 tall rocks)
    addSubRock(seed + 200, 0.30, 0, -0.08, 0.52, 1.4, 0.52, hash(seed, 20) * 0.3);
    addSubRock(seed + 201, 0.28, 0, 0.05, 0.48, 1.35, 0.48, hash(seed, 21) * 0.3);

    // Top horizontal rocks (lintel) — flat wide rocks rotated 90°
    addSubRock(seed + 300, -0.10, 0.55, 0, 1.2, 0.4, 0.6, hash(seed, 30) * 0.2);
    addSubRock(seed + 301, 0.12, 0.52, 0.02, 1.1, 0.38, 0.55, hash(seed, 31) * 0.2);

    // Optional: small rubble at base (50% chance)
    if (hash(seed, 999) > 0.5) {
      addSubRock(seed + 400, -0.32, -0.08, 0.25, 0.35, 0.3, 0.35, hash(seed, 40) * Math.PI * 2);
      addSubRock(seed + 401, 0.34, -0.08, -0.22, 0.32, 0.28, 0.32, hash(seed, 41) * Math.PI * 2);
    }
  }

  return {
    positions: new Float32Array(allPos),
    indices: new Uint32Array(allIdx),
    vertCount: vertOffset,
    faceCount: allIdx.length / 3,
  };
};

// ── Normalize + Flat Shade + GPU Upload ─────────────────────────────────────────

/**
 * Normalize positions to [-0.5, 0.5], expand to flat shading, upload to GPU.
 * @param {GPUDevice} device
 * @param {GPUBindGroupLayout} bindGroupLayout
 * @param {GPUSampler} sampler
 * @param {Float32Array} pos - shared vertex positions
 * @param {Uint32Array} idx - index buffer
 * @param {number} faceCount
 * @param {number} seed
 * @param {number[]} color
 * @returns {{ vb: GPUBuffer, ib: GPUBuffer, indexCount: number, bindGroup1: GPUBindGroup }}
 */
const buildGPUMesh = (device, bindGroupLayout, sampler, pos, idx, faceCount, seed, color) => {
  // Normalize to [-0.5, 0.5]
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < pos.length; i += 3) {
    if (pos[i] < minX) minX = pos[i];     if (pos[i] > maxX) maxX = pos[i];
    if (pos[i+1] < minY) minY = pos[i+1]; if (pos[i+1] > maxY) maxY = pos[i+1];
    if (pos[i+2] < minZ) minZ = pos[i+2]; if (pos[i+2] > maxZ) maxZ = pos[i+2];
  }
  const cx = (minX + maxX) * 0.5, cy = (minY + maxY) * 0.5, cz = (minZ + maxZ) * 0.5;
  const extent = Math.max(maxX - minX, maxY - minY, maxZ - minZ) || 1;
  const inv = 1 / extent;
  for (let i = 0; i < pos.length; i += 3) {
    pos[i]   = (pos[i]   - cx) * inv;
    pos[i+1] = (pos[i+1] - cy) * inv;
    pos[i+2] = (pos[i+2] - cz) * inv;
  }

  // Expand to flat shading + face normals
  const flatCount = faceCount * 3;
  const interleaved = new Float32Array(flatCount * 8);
  const flatIdx = new Uint32Array(flatCount);

  for (let f = 0; f < faceCount; f++) {
    const i0 = idx[f * 3], i1 = idx[f * 3 + 1], i2 = idx[f * 3 + 2];
    const ax = pos[i0*3], ay = pos[i0*3+1], az = pos[i0*3+2];
    const bx = pos[i1*3], by = pos[i1*3+1], bz = pos[i1*3+2];
    const pcx = pos[i2*3], pcy = pos[i2*3+1], pcz = pos[i2*3+2];

    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = pcx - ax, e2y = pcy - ay, e2z = pcz - az;
    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    nx /= len; ny /= len; nz /= len;

    const o = f * 24;
    interleaved[o]    = ax;  interleaved[o+1]  = ay;  interleaved[o+2]  = az;
    interleaved[o+3]  = nx;  interleaved[o+4]  = ny;  interleaved[o+5]  = nz;
    interleaved[o+6]  = 0.5; interleaved[o+7]  = 0.5;
    interleaved[o+8]  = bx;  interleaved[o+9]  = by;  interleaved[o+10] = bz;
    interleaved[o+11] = nx;  interleaved[o+12] = ny;  interleaved[o+13] = nz;
    interleaved[o+14] = 0.5; interleaved[o+15] = 0.5;
    interleaved[o+16] = pcx; interleaved[o+17] = pcy; interleaved[o+18] = pcz;
    interleaved[o+19] = nx;  interleaved[o+20] = ny;  interleaved[o+21] = nz;
    interleaved[o+22] = 0.5; interleaved[o+23] = 0.5;

    flatIdx[f * 3] = f * 3; flatIdx[f * 3 + 1] = f * 3 + 1; flatIdx[f * 3 + 2] = f * 3 + 2;
  }

  // GPU resources
  const vb = device.createBuffer({
    size: interleaved.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    label: `ProcRock VB s${seed}`,
  });
  device.queue.writeBuffer(vb, 0, interleaved);

  const ib = device.createBuffer({
    size: flatIdx.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    label: `ProcRock IB s${seed}`,
  });
  device.queue.writeBuffer(ib, 0, flatIdx);

  const tex = device.createTexture({
    size: [1, 1, 1], format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    label: `ProcRock Tex s${seed}`,
  });
  device.queue.writeTexture({ texture: tex }, new Uint8Array(color), { bytesPerRow: 4 }, [1, 1]);

  const bindGroup1 = device.createBindGroup({
    layout: bindGroupLayout,
    entries: [
      { binding: 0, resource: tex.createView() },
      { binding: 1, resource: sampler },
    ],
    label: `ProcRock BG1 s${seed}`,
  });

  return { vb, ib, indexCount: flatIdx.length, bindGroup1 };
};

// ── Public API ──────────────────────────────────────────────────────────────────

/**
 * Generate a single procedural rock or rock formation with GPU-ready resources.
 * @param {GPUDevice} device
 * @param {GPUBindGroupLayout} bindGroupLayout
 * @param {GPUSampler} sampler
 * @param {Object} [options]
 * @param {number} [options.seed=42]
 * @param {number[]} [options.color=[200,190,180,255]]
 * @param {number} [options.displacement]
 * @param {number[]} [options.scaleXYZ]
 * @param {number} [options.templateIdx=0]
 * @returns {{ vb: GPUBuffer, ib: GPUBuffer, indexCount: number, bindGroup1: GPUBindGroup }}
 */
export const generateRock = (device, bindGroupLayout, sampler, options = {}) => {
  const {
    seed = 42,
    color = [200, 190, 180, 255],
    displacement: dispOverride,
    scaleXYZ: scaleOverride,
    templateIdx = 0,
  } = options;

  const shape = ROCK_SHAPES[templateIdx % ROCK_SHAPES.length];
  const [sx, sy, sz] = scaleOverride ?? shape.scaleXYZ;
  const displacement = dispOverride ?? shape.disp;

  if (shape.cluster) {
    // Rock formation: merge multiple sub-rocks into one mesh
    console.log(`[ProcRockGen] Generating ${shape.cluster} cluster (templateIdx=${templateIdx}, name=${shape.name})`);
    const { positions, indices, faceCount } = generateClusterMesh(seed, sx, sy, sz, displacement, shape.cluster);
    return buildGPUMesh(device, bindGroupLayout, sampler, positions, indices, faceCount, seed, color);
  }

  // Single rock
  const pos = generateSinglePositions(seed, sx, sy, sz, displacement);
  return buildGPUMesh(device, bindGroupLayout, sampler, pos, BASE_INDICES, FACE_COUNT, seed, color);
};

/**
 * Generate multiple rock variants with auto-incremented seeds.
 * @param {GPUDevice} device
 * @param {GPUBindGroupLayout} bindGroupLayout
 * @param {GPUSampler} sampler
 * @param {number} count
 * @param {Object} [baseOptions]
 * @returns {Array<{vb: GPUBuffer, ib: GPUBuffer, indexCount: number, bindGroup1: GPUBindGroup}>}
 */
export const generateRockVariants = (device, bindGroupLayout, sampler, count, baseOptions = {}) => {
  const baseSeed = baseOptions.seed ?? 42;
  return Array.from({ length: count }, (_, i) =>
    generateRock(device, bindGroupLayout, sampler, {
      ...baseOptions,
      seed: baseSeed + i * 7919,
      templateIdx: i % ROCK_SHAPES.length,
    })
  );
};

/** Available shape preset count */
export const TEMPLATE_COUNT = ROCK_SHAPES.length;
