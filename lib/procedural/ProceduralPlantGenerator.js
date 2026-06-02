/**
 * ProceduralPlantGenerator — Seed-driven super-light plant geometry.
 *
 * 25 hand-tuned variants spanning generic flowers, named species (daisy,
 * rose, lavender, sunflower, orchid, lotus), bushes, grass tufts,
 * mushrooms, jungle fronds and alien plants. Each builds from a small
 * library of primitives (thin cylinder, octahedron, crossed blades,
 * disc-petal star, low dome, lavender bud spike). Most plants are 1–2
 * sub-meshes and ~15–120 verts before flat-shade expansion so populating
 * the world stays cheap.
 *
 * Output matches the PlantSystem render path —
 * `{ subMeshes: [...], collider }` with 1 sub-mesh for bush/grass, 2 for
 * flowers / mushrooms / jungle / alien plants. Model space puts the base
 * at Y=0 (same convention as crystals and trees).
 *
 * @module procedural/ProceduralPlantGenerator
 * @author Esteban Fuster Pozzi (@estebanrfp)
 */

// ── Hash (Murmur3 finalizer) ────────────────────────────────────────────────

/** @param {number} seed @param {number} idx @returns {number} [0, 1) */
const hash = (seed, idx) => {
  let h = (seed * 2654435761 + idx * 2246822519) | 0;
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

// ── Geometry primitives ─────────────────────────────────────────────────────

/** Thin cylinder (open-ended) — flower / mushroom stem. */
const generateCylinder = (sides, baseRadius, topRadius, height, baseY = 0) => {
  const positions = [];
  const indices = [];
  for (let ring = 0; ring < 2; ring++) {
    const r = ring === 0 ? baseRadius : topRadius;
    const y = baseY + (ring === 0 ? 0 : height);
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      positions.push(Math.cos(a) * r, y, Math.sin(a) * r);
    }
  }
  for (let i = 0; i < sides; i++) {
    const n = (i + 1) % sides;
    indices.push(i, i + sides, n, n, i + sides, n + sides);
  }
  return { positions, indices };
};

/** Squashed octahedron — bush blob / generic flower head / alien bulb. */
const generateOctahedron = (radius, baseY = 0, squashY = 1.0) => {
  const r = radius;
  const ry = radius * squashY;
  const positions = [
    0, baseY + ry * 2, 0,    // 0 top
    r, baseY + ry, 0,        // 1
    0, baseY + ry, r,        // 2
    -r, baseY + ry, 0,       // 3
    0, baseY + ry, -r,       // 4
    0, baseY, 0,             // 5 bottom
  ];
  const indices = [
    0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 1,  // upper cap
    5, 2, 1, 5, 3, 2, 5, 4, 3, 5, 1, 4,  // lower cap
  ];
  return { positions, indices };
};

/** Crossed flat quads — grass / jungle frond / palm. */
const generateCrossedBlades = (seed, blades, height, halfWidth) => {
  const positions = [];
  const indices = [];
  let off = 0;
  for (let b = 0; b < blades; b++) {
    const baseAngle = (b / blades) * Math.PI + hash(seed, b) * 0.4;
    const lean = (hash(seed, b + 100) - 0.5) * 0.15;
    const hw = halfWidth * (0.85 + hash(seed, b + 200) * 0.3);
    const h = height * (0.85 + hash(seed, b + 300) * 0.3);
    const dx = Math.cos(baseAngle) * hw;
    const dz = Math.sin(baseAngle) * hw;
    const tx = lean * Math.cos(baseAngle + Math.PI / 2);
    const tz = lean * Math.sin(baseAngle + Math.PI / 2);
    positions.push(
      -dx, 0, -dz,
       dx, 0,  dz,
       dx + tx, h,  dz + tz,
      -dx + tx, h, -dz + tz,
    );
    indices.push(off, off + 1, off + 2, off, off + 2, off + 3);
    off += 4;
  }
  return { positions, indices };
};

/** 5- or 6-petal flower head — small generic flower / orchid. */
const generateFlowerHead = (seed, petals, radius, height, baseY = 0) => {
  const positions = [];
  const indices = [];
  positions.push(0, baseY, 0);
  const top = 1;
  positions.push(0, baseY + height, 0);
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2 + hash(seed, i) * 0.2;
    const r = radius * (0.9 + hash(seed, i + 50) * 0.2);
    const tipY = baseY + height * 0.45 + hash(seed, i + 80) * 0.05;
    positions.push(Math.cos(a) * r, tipY, Math.sin(a) * r);
  }
  for (let i = 0; i < petals; i++) {
    const a = 2 + i;
    const b = 2 + ((i + 1) % petals);
    indices.push(0, a, b);
    indices.push(top, b, a);
  }
  return { positions, indices };
};

/** Low dome — mushroom cap. */
const generateDome = (sides, radius, height, baseY = 0) => {
  const positions = [];
  const indices = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    positions.push(Math.cos(a) * radius, baseY, Math.sin(a) * radius);
  }
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    const r = radius * 0.75;
    positions.push(Math.cos(a) * r, baseY + height * 0.55, Math.sin(a) * r);
  }
  positions.push(0, baseY + height, 0);
  const apex = sides * 2;
  for (let i = 0; i < sides; i++) {
    const n = (i + 1) % sides;
    indices.push(i, i + sides, n, n, i + sides, n + sides);
  }
  for (let i = 0; i < sides; i++) {
    const n = (i + 1) % sides;
    indices.push(i + sides, apex, n + sides);
  }
  for (let i = 1; i < sides - 1; i++) indices.push(0, i + 1, i);
  return { positions, indices };
};

/**
 * Flat disc of triangular petals fanning from a centre — daisy, sunflower,
 * lotus. Double-sided. `tilt` bends petal tips upward (lotus cup shape).
 */
const generateDiscPetals = (seed, petals, radius, baseY = 0, tilt = 0.0) => {
  const positions = [];
  const indices = [];
  positions.push(0, baseY, 0);   // 0 centre
  positions.push(0, baseY + 0.005, 0); // 1 slight raised centre for top-side ordering
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2 + hash(seed, i) * 0.15;
    const r = radius * (0.85 + hash(seed, i + 50) * 0.30);
    const y = baseY + tilt + hash(seed, i + 80) * 0.01;
    positions.push(Math.cos(a) * r, y, Math.sin(a) * r);
  }
  for (let i = 0; i < petals; i++) {
    const a = 2 + i;
    const b = 2 + ((i + 1) % petals);
    indices.push(0, a, b);   // bottom
    indices.push(1, b, a);   // top (opposite winding, ever-so-slightly raised)
  }
  return { positions, indices };
};

/** Vertical spike of small buds — lavender. Octahedra stacked along Y. */
const generateLavenderSpike = (seed, buds, height, budRadius, baseY = 0) => {
  const allPos = [];
  const allIdx = [];
  let off = 0;
  const spread = budRadius * 0.4;
  for (let i = 0; i < buds; i++) {
    const t = i / Math.max(1, buds - 1);
    const y = baseY + t * height;
    const r = budRadius * (0.55 + hash(seed, i + 200) * 0.55);
    const ox = (hash(seed, i + 300) - 0.5) * spread;
    const oz = (hash(seed, i + 400) - 0.5) * spread;
    const bud = generateOctahedron(r, y, 0.55);
    for (let j = 0; j < bud.positions.length; j += 3) {
      allPos.push(bud.positions[j] + ox, bud.positions[j + 1], bud.positions[j + 2] + oz);
    }
    for (const idx of bud.indices) allIdx.push(idx + off);
    off += bud.positions.length / 3;
  }
  return { positions: allPos, indices: allIdx };
};

// ── Variants ────────────────────────────────────────────────────────────────

const PLANT_VARIATIONS = [
  // ── Generic flowers (stem + small octahedral head) ───
  { name: 'flower_red',     type: 'flower', stemH: 0.42, headR: 0.12, headH: 0.10,
    bodyColor: [80, 130, 50, 255],   accentColor: [220, 60, 60, 255] },
  { name: 'flower_yellow',  type: 'flower', stemH: 0.40, headR: 0.13, headH: 0.10,
    bodyColor: [82, 132, 52, 255],   accentColor: [240, 220, 60, 255] },
  { name: 'flower_blue',    type: 'flower', stemH: 0.38, headR: 0.12, headH: 0.10,
    bodyColor: [80, 130, 50, 255],   accentColor: [100, 130, 230, 255] },
  { name: 'flower_white',   type: 'flower', stemH: 0.45, headR: 0.12, headH: 0.10,
    bodyColor: [78, 128, 48, 255],   accentColor: [240, 240, 230, 255] },
  { name: 'flower_purple',  type: 'flower', stemH: 0.40, headR: 0.12, headH: 0.10,
    bodyColor: [80, 130, 50, 255],   accentColor: [180, 80, 200, 255] },
  { name: 'flower_pink',    type: 'flower', stemH: 0.35, headR: 0.12, headH: 0.10,
    bodyColor: [82, 132, 52, 255],   accentColor: [240, 130, 180, 255] },
  { name: 'flower_orange',  type: 'flower', stemH: 0.42, headR: 0.13, headH: 0.10,
    bodyColor: [80, 130, 50, 255],   accentColor: [240, 140, 50, 255] },

  // ── Named flowers ───
  { name: 'daisy',          type: 'disc_flower', stemH: 0.20, discR: 0.22, petals: 10,
    bodyColor: [80, 130, 50, 255],   accentColor: [250, 250, 240, 255] },
  { name: 'rose',           type: 'flower', stemH: 0.40, headR: 0.16, headH: 0.14,
    bodyColor: [70, 110, 45, 255],   accentColor: [200, 30, 50, 255] },
  { name: 'lavender',       type: 'spike',  stemH: 0.55, spikeH: 0.40, buds: 6, budR: 0.05,
    bodyColor: [85, 130, 60, 255],   accentColor: [150, 90, 200, 255] },
  { name: 'sunflower',      type: 'disc_flower', stemH: 0.95, discR: 0.30, petals: 14,
    bodyColor: [85, 135, 50, 255],   accentColor: [245, 200, 30, 255] },
  { name: 'orchid',         type: 'flower', stemH: 0.55, headR: 0.14, headH: 0.16,
    bodyColor: [70, 115, 55, 255],   accentColor: [220, 80, 200, 255] },
  { name: 'lotus',          type: 'disc_flower', stemH: 0.15, discR: 0.32, petals: 8, tilt: 0.06,
    bodyColor: [80, 130, 60, 255],   accentColor: [240, 180, 200, 255] },

  // ── Grass tufts (crossed blades) ───
  { name: 'grass_short',    type: 'grass', bladeH: 0.30, bladeW: 0.06, blades: 3,
    bodyColor: [95, 140, 55, 255] },
  { name: 'grass_tall',     type: 'grass', bladeH: 0.55, bladeW: 0.07, blades: 3,
    bodyColor: [110, 155, 70, 255] },
  { name: 'grass_dry',      type: 'grass', bladeH: 0.40, bladeW: 0.06, blades: 3,
    bodyColor: [200, 180, 90, 255] },

  // ── Mushrooms (stem + dome cap) ───
  { name: 'mushroom_red',   type: 'mushroom', stemH: 0.18, capR: 0.14, capH: 0.10,
    bodyColor: [240, 230, 200, 255], accentColor: [210, 50, 50, 255] },
  { name: 'mushroom_brown', type: 'mushroom', stemH: 0.14, capR: 0.12, capH: 0.08,
    bodyColor: [220, 200, 180, 255], accentColor: [130, 90, 55, 255] },

  // ── Alien plant (composite stem + spike) ───
  { name: 'alien_pink',     type: 'alien_spike', spikeH: 0.90, baseR: 0.18, tipR: 0.04,
    bodyColor: [60, 90, 60, 255],    accentColor: [240, 80, 200, 255] },

  // ── Jungle / tropical (large crossed blades that read as fronds) ───
  { name: 'jungle_frond',   type: 'jungle', bladeH: 1.10, bladeW: 0.25, blades: 4,
    bodyColor: [50, 105, 50, 255] },
  { name: 'jungle_palm',    type: 'jungle', bladeH: 0.75, bladeW: 0.35, blades: 5,
    bodyColor: [60, 120, 55, 255] },
];

// ── Plant geometry assembly ─────────────────────────────────────────────────

const generatePlantGeometry = (templateIdx, seed) => {
  const tpl = PLANT_VARIATIONS[templateIdx % PLANT_VARIATIONS.length];
  const sizeVar = 0.85 + hash(seed, 1) * 0.30;
  let body, accent = null, height = 0, radius = 0.05;

  switch (tpl.type) {
    case 'flower': {
      const stemH = tpl.stemH * sizeVar;
      const stemR = 0.025 * sizeVar;            // thicker stem so the silhouette reads at distance
      const headR = tpl.headR * sizeVar;
      const headH = tpl.headH * sizeVar;

      const stem = generateCylinder(5, stemR, stemR * 0.9, stemH, 0);

      // Lateral leaf — a flat squashed octahedron jutting outward from
      // mid-stem. Direction is per-seed so each flower looks unique.
      const leafR = headR * 0.65;
      const leafY = stemH * (0.40 + hash(seed, 334) * 0.20);
      const leafAngle = hash(seed, 333) * Math.PI * 2;
      const leafDX = Math.cos(leafAngle) * leafR * 0.9;
      const leafDZ = Math.sin(leafAngle) * leafR * 0.9;
      const leaf = generateOctahedron(leafR, leafY - leafR * 0.25, 0.20);
      for (let i = 0; i < leaf.positions.length; i += 3) {
        leaf.positions[i]     += leafDX;
        leaf.positions[i + 2] += leafDZ;
      }

      // Merge stem + leaf into one body mesh (same green colour).
      const stemVerts = stem.positions.length / 3;
      body = {
        positions: stem.positions.concat(leaf.positions),
        indices:   stem.indices.concat(leaf.indices.map((i) => i + stemVerts)),
      };

      accent = generateFlowerHead(seed, 5, headR, headH, stemH);
      height = stemH + headH;
      radius = Math.max(stemR, headR, leafR + Math.hypot(leafDX, leafDZ));
      break;
    }
    case 'disc_flower': {                       // daisy / sunflower / lotus
      const stemH = tpl.stemH * sizeVar;
      const stemR = 0.014 * sizeVar;
      const discR = tpl.discR * sizeVar;
      const petals = tpl.petals ?? 10;
      const tilt = tpl.tilt ?? 0.0;
      body   = generateCylinder(5, stemR, stemR * 0.85, stemH, 0);
      accent = generateDiscPetals(seed, petals, discR, stemH, tilt);
      height = stemH;
      radius = Math.max(stemR, discR);
      break;
    }
    case 'spike': {                             // lavender
      const stemH = tpl.stemH * sizeVar;
      const stemR = 0.011 * sizeVar;
      const spikeH = tpl.spikeH * sizeVar;
      const budR = tpl.budR * sizeVar;
      const buds = tpl.buds ?? 6;
      body   = generateCylinder(5, stemR, stemR * 0.85, stemH, 0);
      accent = generateLavenderSpike(seed, buds, spikeH, budR, stemH);
      height = stemH + spikeH;
      radius = Math.max(stemR, budR);
      break;
    }
    case 'bush': {
      const r = tpl.bodyR * sizeVar;
      body   = generateOctahedron(r, 0, tpl.squashY ?? 1.0);
      height = r * 2 * (tpl.squashY ?? 1.0);
      radius = r;
      break;
    }
    case 'grass':
    case 'jungle': {
      const h = tpl.bladeH * sizeVar;
      const w = tpl.bladeW * sizeVar;
      body   = generateCrossedBlades(seed, tpl.blades ?? 3, h, w);
      height = h;
      radius = w;
      break;
    }
    case 'mushroom': {
      const stemH = tpl.stemH * sizeVar;
      const stemR = 0.030 * sizeVar;
      const capR  = tpl.capR * sizeVar;
      const capH  = tpl.capH * sizeVar;
      body   = generateCylinder(6, stemR * 1.1, stemR * 0.9, stemH, 0);
      accent = generateDome(8, capR, capH, stemH);
      height = stemH + capH;
      radius = Math.max(stemR, capR);
      break;
    }
    case 'alien_bulb': {                        // alien_blue
      const stemH = tpl.stemH * sizeVar;
      const stemR = 0.020 * sizeVar;
      const bulbR = tpl.bulbR * sizeVar;
      const bulbH = tpl.bulbH * sizeVar;
      body   = generateCylinder(5, stemR, stemR, stemH, 0);
      // Stretched octahedron as the bulb (squashY > 1 makes it tall).
      const squash = bulbH / (bulbR * 2);
      accent = generateOctahedron(bulbR, stemH, squash);
      height = stemH + bulbH;
      radius = Math.max(stemR, bulbR);
      break;
    }
    case 'alien_spike': {                       // alien_pink
      const spikeH = tpl.spikeH * sizeVar;
      const baseR  = tpl.baseR * sizeVar;
      const tipR   = tpl.tipR * sizeVar;
      // A tall tapered cylinder reads as a spike / antenna.
      body   = generateCylinder(6, baseR * 0.45, baseR * 0.30, spikeH * 0.20, 0);  // green base
      accent = generateCylinder(5, baseR, tipR, spikeH * 0.85, spikeH * 0.20);     // colourful body
      height = spikeH;
      radius = baseR;
      break;
    }
    default:
      body   = generateOctahedron(0.2, 0, 1.0);
      height = 0.4; radius = 0.2;
  }

  return {
    body, accent,
    bodyColor:   tpl.bodyColor,
    accentColor: tpl.accentColor,
    collider:    { radius, height },
  };
};

// ── GPU upload helper (flat shading) ────────────────────────────────────────

const buildSubMesh = (device, bindGroupLayout, sampler, rawPos, rawIdx, color, label) => {
  const pos = new Float32Array(rawPos);
  const idx = new Uint32Array(rawIdx);
  const faceCount = idx.length / 3;
  const interleaved = new Float32Array(faceCount * 24);
  const flatIdx = new Uint32Array(faceCount * 3);

  for (let f = 0; f < faceCount; f++) {
    const i0 = idx[f * 3], i1 = idx[f * 3 + 1], i2 = idx[f * 3 + 2];
    const ax = pos[i0*3], ay = pos[i0*3+1], az = pos[i0*3+2];
    const bx = pos[i1*3], by = pos[i1*3+1], bz = pos[i1*3+2];
    const cx = pos[i2*3], cy = pos[i2*3+1], cz = pos[i2*3+2];

    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
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
    interleaved[o+16] = cx;  interleaved[o+17] = cy;  interleaved[o+18] = cz;
    interleaved[o+19] = nx;  interleaved[o+20] = ny;  interleaved[o+21] = nz;
    interleaved[o+22] = 0.5; interleaved[o+23] = 0.5;

    flatIdx[f * 3] = f * 3; flatIdx[f * 3 + 1] = f * 3 + 1; flatIdx[f * 3 + 2] = f * 3 + 2;
  }

  const vb = device.createBuffer({
    size: interleaved.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    label: `${label} VB`,
  });
  device.queue.writeBuffer(vb, 0, interleaved);

  const ib = device.createBuffer({
    size: flatIdx.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    label: `${label} IB`,
  });
  device.queue.writeBuffer(ib, 0, flatIdx);

  const tex = device.createTexture({
    size: [1, 1, 1], format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    label: `${label} Tex`,
  });
  device.queue.writeTexture({ texture: tex }, new Uint8Array(color), { bytesPerRow: 4 }, [1, 1]);

  const bindGroup1 = device.createBindGroup({
    layout: bindGroupLayout,
    entries: [
      { binding: 0, resource: tex.createView() },
      { binding: 1, resource: sampler },
    ],
    label: `${label} BG1`,
  });

  return { vb, ib, indexCount: flatIdx.length, bindGroup1 };
};

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Generate a procedural plant variant with GPU-ready resources.
 * @param {GPUDevice} device
 * @param {GPUBindGroupLayout} bindGroupLayout
 * @param {GPUSampler} sampler
 * @param {Object} [options]
 * @param {number} [options.seed=42]
 * @param {number} [options.templateIdx=0]
 * @returns {{ subMeshes: Array<{vb:GPUBuffer, ib:GPUBuffer, indexCount:number, bindGroup1:GPUBindGroup}>, collider: {radius:number, height:number} }}
 */
export const generatePlant = (device, bindGroupLayout, sampler, options = {}) => {
  const { seed = 42, templateIdx = 0 } = options;
  const geom = generatePlantGeometry(templateIdx, seed);
  const tpl  = PLANT_VARIATIONS[templateIdx % PLANT_VARIATIONS.length];
  const label = `Plant ${tpl.name} s${seed}`;

  const subMeshes = [
    buildSubMesh(device, bindGroupLayout, sampler, geom.body.positions, geom.body.indices, geom.bodyColor, `${label} Body`),
  ];
  if (geom.accent) {
    subMeshes.push(
      buildSubMesh(device, bindGroupLayout, sampler, geom.accent.positions, geom.accent.indices, geom.accentColor, `${label} Accent`)
    );
  }

  return { subMeshes, collider: geom.collider };
};

/** Number of distinct plant templates. */
export const PLANT_TEMPLATE_COUNT = PLANT_VARIATIONS.length;

/** Read-only template metadata for config / UI. */
export const PLANT_TEMPLATES_META = PLANT_VARIATIONS.map(p => ({
  name: p.name, type: p.type,
  bodyColor: p.bodyColor, accentColor: p.accentColor,
}));
