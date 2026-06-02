/**
 * ProceduralTreeGenerator — Seed-driven super-light tree geometry.
 *
 * Generates tree variants (conifers, broadleaf, birch, cypress) from a few
 * cheap primitives: tapered cylinder for the trunk; stacked cones, single
 * cone or octahedron for the foliage. Deterministic per seed, zero IO,
 * ~30–120 verts per tree before flat-shade expansion.
 *
 * Output matches what TreeSystem already consumes — `{ subMeshes, collider }`
 * with one sub-mesh per material colour (trunk + foliage). Drop-in
 * replacement for the GLB-loading path.
 *
 * @module procedural/ProceduralTreeGenerator
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

/**
 * Tapered cylinder (trunk). Open-ended — the foliage sits on top, the base
 * is buried by the terrain, so neither cap is needed.
 * @param {number} sides @param {number} baseRadius @param {number} topRadius
 * @param {number} height @param {number} baseY
 * @returns {{positions:number[], indices:number[]}}
 */
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

/**
 * Single cone (foliage layer, cypress crown). Closed base, single apex.
 */
const generateCone = (sides, baseRadius, height, baseY = 0) => {
  const positions = [];
  const indices = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    positions.push(Math.cos(a) * baseRadius, baseY, Math.sin(a) * baseRadius);
  }
  positions.push(0, baseY + height, 0); // apex
  const apex = sides;
  for (let i = 0; i < sides; i++) indices.push(i, apex, (i + 1) % sides);
  // Base cap (so the underside reads as opaque when seen from below).
  for (let i = 1; i < sides - 1; i++) indices.push(0, i + 1, i);
  return { positions, indices };
};

/**
 * Octahedron with optional vertical squash (broadleaf canopy).
 */
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

/**
 * Stacked cones (classic conifer silhouette). Each layer is wider at the
 * bottom; layers overlap slightly so the joins read as branches.
 */
const generateStackedCones = (seed, layers, baseRadius, totalHeight, baseY = 0) => {
  const allPos = [];
  const allIdx = [];
  let off = 0;
  const layerH = totalHeight / layers;
  const overlap = 0.35;
  for (let i = 0; i < layers; i++) {
    const t = i / Math.max(1, layers - 1);                          // 0..1
    const r = baseRadius * (1.0 - t * 0.75);                        // taper
    const y = baseY + i * layerH * (1 - overlap) + (hash(seed, 100 + i) - 0.5) * 0.05;
    const h = layerH * 1.5;
    const cone = generateCone(6, r, h, y);
    for (const v of cone.positions) allPos.push(v);
    for (const idx of cone.indices) allIdx.push(idx + off);
    off += cone.positions.length / 3;
  }
  return { positions: allPos, indices: allIdx };
};

/**
 * Tapered cylinder oriented along an arbitrary direction — used as a
 * branch growing from a starting point. `dir` (dX,dY,dZ) must be unit
 * length. Returns the geometry plus the tip position for foliage placement.
 */
const generateBranch = (seed, sX, sY, sZ, dX, dY, dZ, length, baseR, tipR, sides) => {
  let p1X, p1Y, p1Z;
  if (Math.abs(dY) > 0.95) {
    // Nearly vertical — fall back to a horizontal reference.
    p1X = 1; p1Y = 0; p1Z = 0;
  } else {
    // Perpendicular in the horizontal plane (cross dir × Y, simplified).
    p1X = dZ; p1Y = 0; p1Z = -dX;
  }
  let l = Math.hypot(p1X, p1Y, p1Z) || 1;
  p1X /= l; p1Y /= l; p1Z /= l;
  // p2 = cross(dir, p1)
  const p2X = dY * p1Z - dZ * p1Y;
  const p2Y = dZ * p1X - dX * p1Z;
  const p2Z = dX * p1Y - dY * p1X;

  const positions = [];
  const indices = [];
  // Base ring
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    positions.push(
      sX + (p1X * c + p2X * s) * baseR,
      sY + (p1Y * c + p2Y * s) * baseR,
      sZ + (p1Z * c + p2Z * s) * baseR,
    );
  }
  // Tip ring
  const tX = sX + dX * length, tY = sY + dY * length, tZ = sZ + dZ * length;
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    positions.push(
      tX + (p1X * c + p2X * s) * tipR,
      tY + (p1Y * c + p2Y * s) * tipR,
      tZ + (p1Z * c + p2Z * s) * tipR,
    );
  }
  // Side quads
  for (let i = 0; i < sides; i++) {
    const n = (i + 1) % sides;
    indices.push(i, i + sides, n, n, i + sides, n + sides);
  }
  return { positions, indices, tipPos: [tX, tY, tZ] };
};

/**
 * Recursive fractal tree — inspired by the canvas demo in
 * testing/treegenerator/. Each segment grows in its current direction,
 * then splits into two children with randomly perturbed direction,
 * reduced length and reduced radius. Leaf positions are collected at the
 * tips of the deepest level for foliage placement.
 *
 * `iterations` = depth of binary recursion (4 → ~31 segments / 16 leaves,
 * 5 → ~63 / 32). The trunk-to-tip taper is exponential (radiusMul^depth).
 */
const generateRecursiveTree = (seed, params) => {
  const startLength    = params.startLength    ?? 0.6;
  const startRadius    = params.startRadius    ?? 0.10;
  const lengthMul      = params.lengthMul      ?? 0.78;
  const radiusMul      = params.radiusMul      ?? 0.68;
  const maxIterations  = params.maxIterations  ?? 4;
  const angleVariation = params.angleVariation ?? 0.55;
  const upBias         = params.upBias         ?? 0.12;

  const allPos = [];
  const allIdx = [];
  let off = 0;
  const addMesh = (mesh) => {
    for (const v of mesh.positions) allPos.push(v);
    for (const i of mesh.indices) allIdx.push(i + off);
    off += mesh.positions.length / 3;
  };

  const leafPositions = [];

  const grow = (sX, sY, sZ, dX, dY, dZ, length, radius, iteration, seedOffset) => {
    const tipRadius = radius * radiusMul;
    const branch = generateBranch(
      seed + seedOffset, sX, sY, sZ,
      dX, dY, dZ, length, radius, tipRadius, 5,
    );
    addMesh(branch);
    const [eX, eY, eZ] = branch.tipPos;

    if (iteration >= maxIterations) {
      leafPositions.push([eX, eY, eZ]);
      return;
    }

    // Perpendicular basis to current direction (for picking a tilt axis).
    let p1X, p1Y, p1Z;
    if (Math.abs(dY) > 0.95) { p1X = 1; p1Y = 0; p1Z = 0; }
    else                      { p1X = dZ; p1Y = 0; p1Z = -dX; }
    let pL = Math.hypot(p1X, p1Y, p1Z) || 1;
    p1X /= pL; p1Y /= pL; p1Z /= pL;
    const p2X = dY * p1Z - dZ * p1Y;
    const p2Y = dZ * p1X - dX * p1Z;
    const p2Z = dX * p1Y - dY * p1X;

    // Binary split — two children with randomly perturbed directions.
    for (let c = 0; c < 2; c++) {
      const seedC = seedOffset * 31 + c * 7 + 1;
      const az   = hash(seed + seedC, 0) * Math.PI * 2;
      const tilt = (0.3 + hash(seed + seedC, 1) * 0.7) * angleVariation;

      const perpX = p1X * Math.cos(az) + p2X * Math.sin(az);
      const perpY = p1Y * Math.cos(az) + p2Y * Math.sin(az);
      const perpZ = p1Z * Math.cos(az) + p2Z * Math.sin(az);

      const cT = Math.cos(tilt), sT = Math.sin(tilt);
      let nDX = dX * cT + perpX * sT;
      let nDY = dY * cT + perpY * sT;
      let nDZ = dZ * cT + perpZ * sT;

      // Slight upward bias so the canopy keeps growing skyward instead
      // of drooping after several iterations.
      nDY += upBias;

      const ndL = Math.hypot(nDX, nDY, nDZ) || 1;
      nDX /= ndL; nDY /= ndL; nDZ /= ndL;

      grow(
        eX, eY, eZ,
        nDX, nDY, nDZ,
        length * lengthMul, tipRadius,
        iteration + 1,
        seedC,
      );
    }
  };

  grow(0, 0, 0, 0, 1, 0, startLength, startRadius, 0, 17);

  return { positions: allPos, indices: allIdx, leafPositions };
};

/**
 * Cluster of squashed octahedra at branch tips — the classic stylised
 * deciduous canopy: 1–2 overlapping leafy blobs per branch tip.
 */
const generateClusterFoliage = (seed, branchTips, blobR) => {
  const allPos = [];
  const allIdx = [];
  let off = 0;
  for (let t = 0; t < branchTips.length; t++) {
    const tip = branchTips[t];
    const blobs = 1 + Math.floor(hash(seed, t * 17) * 2);
    for (let b = 0; b < blobs; b++) {
      const r  = blobR * (0.75 + hash(seed, t * 23 + b) * 0.45);
      const ox = (hash(seed, t * 29 + b) - 0.5) * blobR * 0.8;
      const oy = (hash(seed, t * 31 + b) - 0.5) * blobR * 0.4;
      const oz = (hash(seed, t * 37 + b) - 0.5) * blobR * 0.8;
      const oct = generateOctahedron(r, 0, 0.85);
      for (let i = 0; i < oct.positions.length; i += 3) {
        allPos.push(
          oct.positions[i]     + tip[0] + ox,
          oct.positions[i + 1] + tip[1] + oy,
          oct.positions[i + 2] + tip[2] + oz,
        );
      }
      for (const idx of oct.indices) allIdx.push(idx + off);
      off += oct.positions.length / 3;
    }
  }
  return { positions: allPos, indices: allIdx };
};

/**
 * Vertically-subdivided cylinder that follows an arbitrary lateral curve
 * along its height. Used for palm trunks so the bend looks like a real
 * organic curve instead of an inclined straight cylinder.
 *
 * Optional `yFn` warps the vertical position (e.g. a snake-curve palm
 * spends most of its length near the ground and rises only at the end).
 * Optional `radiusFn` overrides the linear baseR → topR taper (used to
 * add a bulbous base on palms — wider near t=0, normal taper above).
 *
 * @param {number} sides     Polygon resolution of each ring.
 * @param {number} baseR     Bottom ring radius (used when radiusFn is null).
 * @param {number} topR      Top ring radius (used when radiusFn is null).
 * @param {number} height    Trunk height before yFn warp.
 * @param {number} segments  Vertical subdivisions (≥ 1; rings = segments + 1).
 * @param {(t:number) => [number, number]} curveFn  Maps t in [0,1] to (dx,dz).
 * @param {(t:number) => number} [yFn]              Optional vertical warp.
 * @param {(t:number) => number} [radiusFn]         Optional radius override.
 * @returns {{positions:number[], indices:number[], topY:number}}
 */
const generateCurvedTrunk = (sides, baseR, topR, height, segments, curveFn, yFn, radiusFn) => {
  const positions = [];
  const indices = [];
  let topY = height;
  for (let ring = 0; ring <= segments; ring++) {
    const t = ring / segments;
    const r = radiusFn ? radiusFn(t) : (baseR + (topR - baseR) * t);
    const y = height * (yFn ? yFn(t) : t);
    if (ring === segments) topY = y;
    const [dx, dz] = curveFn(t);
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      positions.push(Math.cos(a) * r + dx, y, Math.sin(a) * r + dz);
    }
  }
  for (let ring = 0; ring < segments; ring++) {
    const off0 = ring * sides;
    const off1 = (ring + 1) * sides;
    for (let i = 0; i < sides; i++) {
      const n = (i + 1) % sides;
      indices.push(off0 + i, off1 + i, off0 + n, off0 + n, off1 + i, off1 + n);
    }
  }
  return { positions, indices, topY };
};

/**
 * Returns a radiusFn closure that adds a bulbous (coconut-style) base
 * to a tapered trunk — wider at t≈0, fading to the normal taper by
 * t≈0.15. `bulbScale` is the extra-radius multiplier at the base.
 */
const palmBulbRadiusFn = (baseR, topR, bulbScale = 0.8) => (t) => {
  const baseTaper = baseR + (topR - baseR) * t;
  const bulbContrib = Math.max(0, 1 - t * 7);     // fades to 0 by t≈0.143
  const bulb = baseR * bulbScale * (bulbContrib * bulbContrib);
  return baseTaper + bulb;
};

/**
 * Palm fronds — N tapered quads radiating from a central point, each
 * pointing outward and drooping downward at the tip. Based on the
 * silhouette extracted from assets/palms/palm.obj (155-vert reference).
 */
const generatePalmFronds = (seed, count, baseY, length, width) => {
  const positions = [];
  const indices = [];
  let off = 0;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + hash(seed, i) * 0.3;
    const dirX = Math.cos(angle);
    const dirZ = Math.sin(angle);
    const perpX = -dirZ;             // horizontal perpendicular to dir
    const perpZ = dirX;
    // Per-frond size variation — length and width vary independently so
    // some fronds read as new (short + narrow) while others read as
    // mature (long + broad). Previous range was 0.85-1.15 → too uniform.
    const len   = length    * (0.55 + hash(seed, i + 100) * 0.95);   // 0.55x … 1.50x
    const halfW = width * 0.5 * (0.65 + hash(seed, i + 200) * 0.85); // 0.65x … 1.50x
    const droop = len * (0.35 + hash(seed, i + 300) * 0.15);         // tip drops 35-50% of len
    const rise  = len * (0.08 + hash(seed, i + 400) * 0.08);         // mid raises 8-16% of len

    // Base (narrow, at trunk top)
    positions.push( perpX * halfW * 0.4, baseY,        perpZ * halfW * 0.4);  // 0: base left
    positions.push(-perpX * halfW * 0.4, baseY,       -perpZ * halfW * 0.4);  // 1: base right

    // Mid (widest, slightly raised — gives the frond its arc)
    const midX = dirX * len * 0.5;
    const midY = baseY + rise;
    const midZ = dirZ * len * 0.5;
    positions.push(midX + perpX * halfW, midY, midZ + perpZ * halfW);          // 2: mid left
    positions.push(midX - perpX * halfW, midY, midZ - perpZ * halfW);          // 3: mid right

    // Tip (drooped, narrow)
    const tipX = dirX * len;
    const tipY = baseY - droop;
    const tipZ = dirZ * len;
    positions.push(tipX, tipY, tipZ);                                          // 4: tip

    // 3 triangles per frond: base trapezoid + tip triangle. cullMode is
    // 'none' in the render pipeline so both faces are visible.
    indices.push(off,     off + 1, off + 2);
    indices.push(off + 1, off + 3, off + 2);
    indices.push(off + 2, off + 3, off + 4);
    off += 5;
  }
  return { positions, indices };
};

// ── Variants ────────────────────────────────────────────────────────────────

// Two coexisting families:
//   - 'conifer' / 'cypress': stacked cones / single cone on a slim trunk
//     (classic pine silhouette — the user liked these).
//   - 'branched': recursive fractal trunk with foliage clusters at every
//     tip (replaced the old straight-trunk broadleafs that read as
//     "stick + ball").
const TREE_VARIATIONS = [
  // Conifers — stacked cones on a slim trunk
  { name: 'pine_tall',     type: 'conifer',  trunkH: 2.5, trunkR: 0.18, foliageR: 1.0, foliageH: 5.0, layers: 5,
    trunkColor: [82, 56, 38, 255],  foliageColor: [42, 89, 50, 255]  },
  { name: 'pine_medium',   type: 'conifer',  trunkH: 1.6, trunkR: 0.15, foliageR: 0.85, foliageH: 3.6, layers: 4,
    trunkColor: [82, 56, 38, 255],  foliageColor: [50, 102, 56, 255] },
  { name: 'fir',           type: 'conifer',  trunkH: 2.0, trunkR: 0.16, foliageR: 0.9, foliageH: 4.4, layers: 5,
    trunkColor: [70, 50, 30, 255],  foliageColor: [36, 75, 42, 255]  },
  // Cypress — single tall cone (slim pointed silhouette)
  { name: 'cypress',       type: 'cypress',  trunkH: 0.8, trunkR: 0.18, foliageR: 0.7, foliageH: 5.5,
    trunkColor: [82, 56, 38, 255],  foliageColor: [54, 88, 50, 255]  },
  // Palm family — share trunk/foliage colour, differ only in curvature.
  // All palms have a bulbous "coconut" base added by palmBulbRadiusFn.
  // palm           — moderate S-bend (the default look)
  // palm_twin      — two divergent trunks sharing a root
  // palm_tall      — long, near-vertical trunk (the centre-tall reference)
  // palm_lean      — strong consistent lateral lean (coast / wind look)
  // palm_snake     — bends down then rises; mimics the low-leaning shape
  { name: 'palm',          type: 'palm',       trunkH: 2.4, trunkR: 0.06,  fronds: 8, frondLength: 0.55, frondWidth: 0.10,
    trunkColor: [110, 80, 50, 255], foliageColor: [50, 110, 55, 255] },
  { name: 'palm_twin',     type: 'palm_twin',  trunkH: 2.4, trunkR: 0.055, fronds: 7, frondLength: 0.50, frondWidth: 0.09,
    trunkColor: [110, 80, 50, 255], foliageColor: [50, 110, 55, 255] },
  { name: 'palm_tall',     type: 'palm_tall',  trunkH: 3.4, trunkR: 0.05,  fronds: 8, frondLength: 0.55, frondWidth: 0.10,
    trunkColor: [110, 80, 50, 255], foliageColor: [50, 110, 55, 255] },
  { name: 'palm_lean',     type: 'palm_lean',  trunkH: 2.6, trunkR: 0.06,  fronds: 8, frondLength: 0.55, frondWidth: 0.10,
    trunkColor: [110, 80, 50, 255], foliageColor: [50, 110, 55, 255] },
  { name: 'palm_snake',    type: 'palm_snake', trunkH: 2.8, trunkR: 0.065, fronds: 8, frondLength: 0.55, frondWidth: 0.10,
    trunkColor: [110, 80, 50, 255], foliageColor: [50, 110, 55, 255] },
  // Recursive fractal broadleaf — binary-branching trunk + foliage
  // clusters at every leaf-level tip (organic, image-reference style).
  { name: 'oak',           type: 'branched', trunkH: 2.4, trunkR: 0.10, foliageR: 0.22,
    iterations: 4, angleVar: 0.55,
    trunkColor: [92, 65, 41, 255],   foliageColor: [62, 110, 50, 255] },
  { name: 'maple',         type: 'branched', trunkH: 2.2, trunkR: 0.09, foliageR: 0.22,
    iterations: 4, angleVar: 0.60,
    trunkColor: [98, 70, 45, 255],   foliageColor: [170, 80, 50, 255] },
  { name: 'cherry',        type: 'branched', trunkH: 2.0, trunkR: 0.08, foliageR: 0.18,
    iterations: 5, angleVar: 0.50,
    trunkColor: [102, 75, 50, 255],  foliageColor: [220, 150, 180, 255] },
  { name: 'birch',         type: 'branched', trunkH: 2.8, trunkR: 0.07, foliageR: 0.16,
    iterations: 4, angleVar: 0.45,
    trunkColor: [220, 220, 210, 255], foliageColor: [110, 145, 65, 255] },
  // Jungle / tropical broadleaf — used in the tropical interior (not the
  // sand belt, where palms live). Larger crown, more iterations and a
  // saturated emerald foliage so it reads clearly as rainforest canopy.
  { name: 'jungle',        type: 'branched', trunkH: 3.0, trunkR: 0.11, foliageR: 0.28,
    iterations: 5, angleVar: 0.65,
    trunkColor: [86, 58, 36, 255],   foliageColor: [38, 130, 52, 255] },
];

// ── Tree geometry assembly ──────────────────────────────────────────────────

/**
 * Build a tree's trunk + foliage geometry from a template + seed.
 * Output is normalised — total height = 1, base at y=0 — so the compute
 * shader's instance scale maps directly to world tree height.
 * @returns {{
 *   trunk:{positions:number[],indices:number[]},
 *   foliage:{positions:number[],indices:number[]},
 *   trunkColor:number[], foliageColor:number[],
 *   collider:{radius:number, height:number}
 * }}
 */
const generateTreeGeometry = (templateIdx, seed) => {
  const tpl = TREE_VARIATIONS[templateIdx % TREE_VARIATIONS.length];
  const sizeVar = 0.85 + hash(seed, 1) * 0.30;   // [0.85, 1.15]
  const trunkH  = tpl.trunkH  * sizeVar;
  const trunkR  = tpl.trunkR  * sizeVar;
  const topR    = trunkR * 0.65;
  const foliageR = tpl.foliageR * sizeVar;
  const foliageH = (tpl.foliageH ?? 0) * sizeVar;

  const trunk = generateCylinder(6, trunkR, topR, trunkH, 0);

  let foliage;
  switch (tpl.type) {
    case 'conifer':
      foliage = generateStackedCones(seed, tpl.layers, foliageR, foliageH, trunkH * 0.65);
      break;
    case 'broadleaf':
      foliage = generateOctahedron(foliageR, trunkH * 0.85, tpl.squashY ?? 1.0);
      break;
    case 'branched': {
      // Replace the default straight trunk with a recursive fractal trunk
      // and put foliage clusters at every leaf-level tip.
      const tree = generateRecursiveTree(seed, {
        startLength:    trunkH * 0.4,
        startRadius:    trunkR,
        lengthMul:      0.78,
        radiusMul:      0.68,
        maxIterations:  tpl.iterations ?? 4,
        angleVariation: tpl.angleVar ?? 0.55,
        upBias:         0.12,
      });
      trunk.positions = tree.positions;
      trunk.indices   = tree.indices;
      foliage = generateClusterFoliage(seed, tree.leafPositions, foliageR);
      break;
    }
    case 'birch':
      foliage = generateOctahedron(foliageR, trunkH * 0.80, tpl.squashY ?? 1.2);
      break;
    case 'cypress':
      foliage = generateCone(6, foliageR, foliageH, trunkH * 0.4);
      break;
    case 'palm': {
      // Moderate S-bend palm with a bulbous coconut-style base. 8
      // vertical segments so the curve reads as organic instead of an
      // inclined cylinder.
      const bendMag = trunkH * 0.18 * (hash(seed, 999) - 0.5) * 2;
      const bendDir = hash(seed, 1000) * Math.PI * 2;
      const dirX = Math.cos(bendDir),  dirZ = Math.sin(bendDir);
      const perpX = -dirZ,             perpZ = dirX;
      const sMag = trunkH * 0.07 * (hash(seed, 1001) - 0.5) * 2;
      const curveFn = (t) => {
        const f = Math.sin(t * Math.PI * 0.5);
        const s = Math.sin(t * Math.PI);
        return [dirX * bendMag * f + perpX * sMag * s,
                dirZ * bendMag * f + perpZ * sMag * s];
      };
      const palmTrunk = generateCurvedTrunk(
        6, trunkR, trunkR * 0.7, trunkH, 8, curveFn, undefined,
        palmBulbRadiusFn(trunkR, trunkR * 0.7, 0.8),
      );
      trunk.positions = palmTrunk.positions;
      trunk.indices   = palmTrunk.indices;

      const [topDx, topDz] = curveFn(1);
      foliage = generatePalmFronds(seed, tpl.fronds ?? 8, trunkH, tpl.frondLength ?? 0.5, tpl.frondWidth ?? 0.10);
      for (let i = 0; i < foliage.positions.length; i += 3) {
        foliage.positions[i]     += topDx;
        foliage.positions[i + 2] += topDz;
      }
      break;
    }
    case 'palm_tall': {
      // Long near-vertical trunk with very subtle bend — the "centre tall"
      // reference. Bulb base is slightly tighter so the silhouette stays
      // slim from a distance.
      const bendMag = trunkH * 0.05 * (hash(seed, 999) - 0.5) * 2;       // ±5 %
      const bendDir = hash(seed, 1000) * Math.PI * 2;
      const dirX = Math.cos(bendDir), dirZ = Math.sin(bendDir);
      const curveFn = (t) => {
        const f = Math.sin(t * Math.PI * 0.5);
        return [dirX * bendMag * f, dirZ * bendMag * f];
      };
      const palmTrunk = generateCurvedTrunk(
        6, trunkR, trunkR * 0.7, trunkH, 8, curveFn, undefined,
        palmBulbRadiusFn(trunkR, trunkR * 0.7, 0.6),
      );
      trunk.positions = palmTrunk.positions;
      trunk.indices   = palmTrunk.indices;
      const [topDx, topDz] = curveFn(1);
      foliage = generatePalmFronds(seed, tpl.fronds ?? 8, trunkH, tpl.frondLength ?? 0.5, tpl.frondWidth ?? 0.10);
      for (let i = 0; i < foliage.positions.length; i += 3) {
        foliage.positions[i]     += topDx;
        foliage.positions[i + 2] += topDz;
      }
      break;
    }
    case 'palm_lean': {
      // Strong lateral lean — the wind-blown coastal pose. Per-seed
      // chooses one side and tilts in a single consistent direction
      // (no S-wiggle so the silhouette reads as a clean arc).
      const leanSign = hash(seed, 999) > 0.5 ? 1 : -1;
      const bendMag  = trunkH * (0.35 + hash(seed, 1002) * 0.20) * leanSign;  // ±35–55 %
      const bendDir  = hash(seed, 1000) * Math.PI * 2;
      const dirX = Math.cos(bendDir), dirZ = Math.sin(bendDir);
      const curveFn = (t) => {
        const f = Math.sin(t * Math.PI * 0.5);
        return [dirX * bendMag * f, dirZ * bendMag * f];
      };
      const palmTrunk = generateCurvedTrunk(
        6, trunkR, trunkR * 0.7, trunkH, 10, curveFn, undefined,
        palmBulbRadiusFn(trunkR, trunkR * 0.7, 0.9),
      );
      trunk.positions = palmTrunk.positions;
      trunk.indices   = palmTrunk.indices;
      const [topDx, topDz] = curveFn(1);
      foliage = generatePalmFronds(seed, tpl.fronds ?? 8, trunkH, tpl.frondLength ?? 0.5, tpl.frondWidth ?? 0.10);
      for (let i = 0; i < foliage.positions.length; i += 3) {
        foliage.positions[i]     += topDx;
        foliage.positions[i + 2] += topDz;
      }
      break;
    }
    case 'palm_snake': {
      // Snake-curve palm — bulb base, trunk lays out almost horizontal
      // then sweeps up at the end. Both xFn and yFn are C¹-continuous
      // (no piecewise if/else, no abrupt derivative change) so the
      // silhouette is one smooth arc with no visible corners. 18 vertical
      // segments + 8 sides keeps the curvature looking rounded.
      const snakeDir = hash(seed, 1000) * Math.PI * 2;
      const dirX = Math.cos(snakeDir), dirZ = Math.sin(snakeDir);
      const bendMag = trunkH * (0.55 + hash(seed, 999) * 0.20);
      // y warp — pow 2 is C¹ at every t. Bottom-heavy: 25 % of the
      // height by t=0.5, 49 % by t=0.7, 100 % at t=1. Gentle constant
      // increase in slope (no kinks).
      const yFn = (t) => t * t;
      // x warp — sine arch peaks at t=0.5, plus a small linear term so
      // the top doesn't return all the way to the central axis. Smooth
      // analytic curve, no breaks.
      const xFn = (t) => Math.sin(t * Math.PI) * 0.80 + 0.30 * t;
      const curveFn = (t) => {
        const a = xFn(t);
        return [dirX * bendMag * a, dirZ * bendMag * a];
      };
      const palmTrunk = generateCurvedTrunk(
        8, trunkR, trunkR * 0.75, trunkH, 18, curveFn, yFn,
        palmBulbRadiusFn(trunkR, trunkR * 0.75, 1.0),
      );
      trunk.positions = palmTrunk.positions;
      trunk.indices   = palmTrunk.indices;
      const [topDx, topDz] = curveFn(1);
      const topY = palmTrunk.topY;
      foliage = generatePalmFronds(seed, tpl.fronds ?? 8, topY, tpl.frondLength ?? 0.5, tpl.frondWidth ?? 0.10);
      for (let i = 0; i < foliage.positions.length; i += 3) {
        foliage.positions[i]     += topDx;
        foliage.positions[i + 2] += topDz;
      }
      break;
    }
    case 'palm_twin': {
      // Two trunks diverging from a near-shared root, each with its own
      // drooping frond crown — matches the silhouette of palm2.obj.
      // Each trunk has independent bend + frond layout so the twin still
      // varies per seed.
      const splitDir = hash(seed, 4040) * Math.PI * 2;                // shared azimuth for the split plane
      const splitTilt = (Math.PI / 7) * (0.85 + hash(seed, 4041) * 0.40); // ~22°–32° lean
      const dirX = Math.cos(splitDir);
      const dirZ = Math.sin(splitDir);
      const trunkH2 = trunkH * 0.92;

      /** Build one tilted, organically curved trunk + its frond crown.
       *  sign = ±1 (which side of the split plane).
       *  seedOffset isolates each trunk's per-seed perturbation.
       *  Uses generateCurvedTrunk (8 vertical segments) so the divergence
       *  + bend reads as an organic palm instead of an inclined cylinder. */
      const buildSide = (sign, seedOffset) => {
        const baseOffX = dirX * sign * trunkR * 1.8;                    // root barely separated
        const baseOffZ = dirZ * sign * trunkR * 1.8;
        const topY     = trunkH2 * Math.cos(splitTilt);                 // shorter when tilted
        const tiltOffX = dirX * sign * trunkH2 * Math.sin(splitTilt);
        const tiltOffZ = dirZ * sign * trunkH2 * Math.sin(splitTilt);
        // Mid-trunk perpendicular wiggle — peaks at t=0.5, returns to 0
        // at the top so the crown sits exactly on the trunk's tip.
        const bendMag = trunkH2 * 0.10 * (hash(seed + seedOffset, 999) - 0.5) * 2;
        const bendPerpX = -dirZ * bendMag;
        const bendPerpZ =  dirX * bendMag;
        const curveFn = (t) => {
          const f = Math.sin(t * Math.PI * 0.5);                        // primary lean (ease toward top)
          const s = Math.sin(t * Math.PI);                              // perp wiggle (0 at base, 1 mid, 0 top)
          const x = baseOffX + tiltOffX * f + bendPerpX * s;
          const z = baseOffZ + tiltOffZ * f + bendPerpZ * s;
          return [x, z];
        };
        const [topX, topZ] = curveFn(1);                                // crown lands on the real tip
        // Build the curved trunk, then squash Y by cos(splitTilt) so the
        // tilted trunk ends exactly at topY. Bulb base added for the
        // coconut-style root each twin shares.
        const cyl = generateCurvedTrunk(
          6, trunkR, trunkR * 0.7, trunkH2, 8, curveFn, undefined,
          palmBulbRadiusFn(trunkR, trunkR * 0.7, 0.7),
        );
        const yScale = Math.cos(splitTilt);
        for (let i = 1; i < cyl.positions.length; i += 3) {
          cyl.positions[i] *= yScale;
        }
        const crown = generatePalmFronds(seed + seedOffset + 50,
          tpl.fronds ?? 7, topY, tpl.frondLength ?? 0.5, tpl.frondWidth ?? 0.09);
        for (let i = 0; i < crown.positions.length; i += 3) {
          crown.positions[i]     += topX;
          crown.positions[i + 2] += topZ;
        }
        return { trunk: cyl, crown };
      };

      const left  = buildSide(-1, 3000);
      const right = buildSide(+1, 4500);

      // Merge two trunks into a single sub-mesh (same material).
      const tOff = left.trunk.positions.length / 3;
      trunk.positions = left.trunk.positions.concat(right.trunk.positions);
      trunk.indices   = left.trunk.indices.concat(right.trunk.indices.map(i => i + tOff));

      // Merge two crowns into a single foliage sub-mesh.
      const fOff = left.crown.positions.length / 3;
      foliage = {
        positions: left.crown.positions.concat(right.crown.positions),
        indices:   left.crown.indices.concat(right.crown.indices.map(i => i + fOff)),
      };
      break;
    }
    default:
      foliage = generateOctahedron(foliageR, trunkH);
  }

  // Normalise to a unit-extent box with the BASE at Y=0 — same convention
  // used by ProceduralCrystalGenerator. The compute shader pairs this
  // with a tiny `-0.02` sink so the base sits on the terrain.
  let maxY = 0;
  for (let i = 1; i < trunk.positions.length;   i += 3) if (trunk.positions[i]   > maxY) maxY = trunk.positions[i];
  for (let i = 1; i < foliage.positions.length; i += 3) if (foliage.positions[i] > maxY) maxY = foliage.positions[i];
  const inv = 1 / (maxY || 1);
  for (let i = 0; i < trunk.positions.length;   i++) trunk.positions[i]   *= inv;
  for (let i = 0; i < foliage.positions.length; i++) foliage.positions[i] *= inv;

  return {
    trunk,
    foliage,
    trunkColor:   tpl.trunkColor,
    foliageColor: tpl.foliageColor,
    collider: { radius: trunkR * inv, height: 1.0 },
  };
};

// ── GPU upload helper (flat shading) ────────────────────────────────────────

/**
 * Expand a triangle list to flat shading (one vertex triple per face with
 * the face normal) and upload as VB / IB + a 1×1 colour texture bound to
 * the supplied layout. Matches the format other procedural generators use:
 * 8 floats per vertex = pos.xyz + normal.xyz + uv.xy.
 */
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
 * Generate a procedural tree variant with GPU-ready resources.
 * @param {GPUDevice} device
 * @param {GPUBindGroupLayout} bindGroupLayout
 * @param {GPUSampler} sampler
 * @param {Object} [options]
 * @param {number} [options.seed=42]
 * @param {number} [options.templateIdx=0]
 * @param {number} [options.sizeScale=1] - Final size multiplier (matches the
 *        GLB path's per-variant sizeScale so the compute shader sees the
 *        same extent it used to).
 * @param {number} [options.yOffset=0] - Vertical offset applied after sizing,
 *        for variants that need to sit slightly above/below ground.
 * @returns {{ subMeshes: Array<{vb:GPUBuffer, ib:GPUBuffer, indexCount:number, bindGroup1:GPUBindGroup}>, collider: {radius:number, height:number} }}
 */
export const generateTree = (device, bindGroupLayout, sampler, options = {}) => {
  const { seed = 42, templateIdx = 0, sizeScale = 1.0, yOffset = 0.0 } = options;
  const geom = generateTreeGeometry(templateIdx, seed);

  // Apply sizeScale + yOffset so the resulting extent matches what the
  // GLB pipeline produced (norm.scale *= sizeScale).
  if (sizeScale !== 1.0 || yOffset !== 0.0) {
    const apply = (arr) => {
      for (let i = 0; i < arr.length; i += 3) {
        arr[i]     *= sizeScale;
        arr[i + 1]  = arr[i + 1] * sizeScale + yOffset;
        arr[i + 2] *= sizeScale;
      }
    };
    apply(geom.trunk.positions);
    apply(geom.foliage.positions);
    geom.collider.radius *= sizeScale;
    geom.collider.height  = geom.collider.height * sizeScale + yOffset;
  }

  const tpl = TREE_VARIATIONS[templateIdx % TREE_VARIATIONS.length];
  const label = `Tree ${tpl.name} s${seed}`;

  const trunk   = buildSubMesh(device, bindGroupLayout, sampler, geom.trunk.positions,   geom.trunk.indices,   geom.trunkColor,   `${label} Trunk`);
  const foliage = buildSubMesh(device, bindGroupLayout, sampler, geom.foliage.positions, geom.foliage.indices, geom.foliageColor, `${label} Foliage`);

  return { subMeshes: [trunk, foliage], collider: geom.collider };
};

/** Number of distinct tree templates. */
export const TREE_TEMPLATE_COUNT = TREE_VARIATIONS.length;

/** Read-only template metadata (name/type/colors) for config/UI. */
export const TREE_TEMPLATES_META = TREE_VARIATIONS.map(t => ({
  name: t.name, type: t.type,
  trunkColor: t.trunkColor, foliageColor: t.foliageColor,
}));
