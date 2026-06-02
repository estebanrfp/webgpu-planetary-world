/**
 * NpcSystem — wandering test-NPC simulation.
 *
 * Owns the NPC roster: hash-derived avatar identities and a random-walk wander
 * (pick a target near a fixed spawn anchor, stroll/run toward it, pause, turn
 * smoothly, re-pick). It produces, per NPC, a camera-relative `center` and a
 * world-space `forward` that the renderer writes straight into the shared
 * avatar instance buffer (the GPU avatar-ground pass then snaps them to the
 * terrain). The system is purely simulation — it owns no GPU resources.
 *
 * `config` is mutable at runtime; the Debug panel's NPCs checkbox toggles
 * `config.enabled`. NPCs spawn enabled by default.
 *
 * @module systems/NpcSystem
 */

import { MOVEMENT_CONFIG, EARTH_CENTER } from '../config/index.js';
import { randomVoxelParams } from '../avatar/voxel-builder.js';
import { createParcelPicker, FACE_SIZE } from '../terrain/parcel-picking.js';
import { getTerrainHeightMultiplier } from '../terrain/height.js';
import { WATER_OCTAVES, SWIM_DEPTH } from '../terrain/water.js';

const MAX_NPCS = 48;          // hard cap (shared avatar buffer holds 64 incl. player)
const WANDER_ARRIVE = 0.03;   // tangent-plane distance that counts as "arrived"
const CELL_USABLE = 0.85;     // fraction of the parcel filled (keeps NPCs off the edge)
const BEACH_LEVEL = -0.04;    // placement floor: NPCs allowed down to here, so a few reach swimmable water near the coast; deeper = open ocean, avoided. (tunable)
const HOME_TRIES = 6;         // candidate samples when placing a home on land/beach
const TARGET_TRIES = 4;       // candidate samples when picking a wander target
const EMOTE_CHANCE = 0.08;    // per-second chance a standing NPC starts an emote (wave or dance) (tunable)
const GREET_DURATION = 2.5;   // seconds a greeting wave plays
const DANCE_DURATION = 6.0;   // seconds a dance plays (longer clip)
const DANCE_RATIO = 0.4;      // fraction of emotes that are a dance (the rest are a wave)

// Toroidal wrap — the finite roster is tiled around the avatar so it always populates the
// scene without dumping the NPCs into one far corner of the ~13 km parcel. Tuned to the same
// ~3 km reach the trees/palms use (scatterConfig.js), so NPCs cover the whole visible range
// and fade out at the tree horizon. Height is snapped on the GPU (avatarGround.compute, the
// real visible terrain) at ANY distance, so far NPCs sit on the ground — not float. (Swim/walk
// detection is still grid-limited to ~256 m; beyond it an NPC over water walks the surface.)
const NPC_WRAP_RADIUS = 3.2;    // km — half the tile; a touch past the cull so the wrap seam stays hidden
const NPC_VIEW_RADIUS = 3.0;    // km — cull beyond this (matches the trees' ~3 km reach)
const NPC_FADE_START = 2.4;     // km — begin the smooth dissolve here (0.8× of the reach, like the scatter)

/** Shortest signed offset of `d` folded into [-period/2, period/2] (toroidal wrap). */
const wrapDelta = (d, period) => d - period * Math.round(d / period);

/** Deterministic seeded RNG (mulberry32) — stable voxel identity per NPC index. */
const mulberry32 = (seed) => () => {
  seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/**
 * Create an NpcSystem.
 * @returns {object} The NPC system — `{ config, count, npcs, regenerate, update }`.
 */
export const createNpcSystem = () => {
  const config = {
    enabled: true,                                           // on by default; Debug NPCs checkbox toggles it
    count: 12,                                               // number of NPCs
    wanderRadius: 0.6,                                       // fallback local roam radius (km) if the parcel cell is unknown
    runChance: 0.35,                                         // probability of running on a leg
    turnRate: 2.5,                                           // facing turn speed (rad/s)
    walkSpeed: MOVEMENT_CONFIG.minSpeed,                     // player ground walk speed
    runSpeed: MOVEMENT_CONFIG.minSpeed * MOVEMENT_CONFIG.boostMultiplier, // player run speed
  };

  /** @type {Array<object>} Live NPC roster. */
  const npcs = [];
  /** @type {{fromEarth:number[],t1:number[],t2:number[],radius:number,cellSize:number,face:number,localX:number,localY:number,parcelSeed:number}|null} */
  let anchor = null;
  let lastTime = 0;
  let landParams = null;            // latest terrain params, for the land/beach placement test
  let groundSampler = null;         // (x,y,z)→exact baked terrain height (km) or null outside the GPU grid

  // Parcel grid picker — used once to snap the spawn anchor to the centre of the
  // parcel cell the avatar landed in, so the crowd fills the whole cell.
  const picker = createParcelPicker();

  // Deterministic per-NPC hash → stable identities across regenerations.
  const hash = (i) => Math.abs((Math.sin(i * 12.9898) * 43758.5453) % 1);

  /**
   * Terrain height multiplier at a tangent-plane offset (u,v) from the anchor —
   * the same field the renderer/ocean use. >= 0 is land, < 0 is below sea level;
   * NPCs are placed down to BEACH_LEVEL (shallow coast), and the swim/walk cutoff
   * itself lives in lib/terrain/water.js (SWIM_DEPTH, shared with the player).
   * Returns land (1) when terrain params are unknown so placement falls back to grid.
   * @param {number} u @param {number} v
   * @returns {number}
   */
  const terrainHeightAt = (u, v) => {
    if (!landParams || !anchor) return 1;
    const an = anchor.fromEarth, t1 = anchor.t1, t2 = anchor.t2;
    const x = an[0] + t1[0] * u + t2[0] * v;
    const y = an[1] + t1[1] * u + t2[1] * v;
    const z = an[2] + t1[2] * u + t2[2] * v;
    const l = Math.hypot(x, y, z) || 1;
    return getTerrainHeightMultiplier([x / l, y / l, z / l], WATER_OCTAVES, landParams);
  };

  /**
   * Assign an NPC an evenly-spread "home" across the parcel cell — a jittered
   * grid so the crowd covers the whole cell coherently instead of clumping near
   * the avatar. Each NPC then wanders locally around its home (see pickTarget).
   * @param {object} npc
   * @param {number} i - roster index
   * @param {number} total - roster size
   */
  const assignHome = (npc, i, total) => {
    const cell = anchor?.cellSize ?? (config.wanderRadius * 2);
    const cols = Math.max(1, Math.ceil(Math.sqrt(total)));
    const rows = Math.max(1, Math.ceil(total / cols));
    const gx = i % cols, gy = Math.floor(i / cols);
    const seed = (anchor?.parcelSeed ?? 0);
    // Grid-slot centre (even spread); varied per parcel so layouts differ.
    const baseU = (((gx + 0.5) / cols) - 0.5) * cell * CELL_USABLE;
    const baseV = (((gy + 0.5) / rows) - 0.5) * cell * CELL_USABLE;
    const localR = Math.min(cell / cols, cell / rows) * 0.5;

    // Keep NPCs on land or the beach shelf. Try jittered candidates: first within
    // the grid slot (preserves the even spread when there is land there), then
    // anywhere in the parcel if the slot is open ocean. Keep the shallowest spot
    // found so a fully-ocean slot still lands as close to the coast as possible.
    let bu = baseU, bv = baseV, bestH = -Infinity;
    for (let t = 0; t < HOME_TRIES; t++) {
      const jx = hash(i + 11 + seed + t * 97) - 0.5, jy = hash(i + 23 + seed + t * 131) - 0.5;
      const wide = t >= HOME_TRIES / 2;                 // widen the search if the slot was wet
      const cu = (wide ? 0 : baseU) + jx * (wide ? cell * CELL_USABLE : localR * 1.4);
      const cv = (wide ? 0 : baseV) + jy * (wide ? cell * CELL_USABLE : localR * 1.4);
      const h = terrainHeightAt(cu, cv);
      if (h > bestH) { bestH = h; bu = cu; bv = cv; }
      if (h >= BEACH_LEVEL) break;                       // good enough: land or beach
    }
    npc.hu = bu; npc.hv = bv; npc.localR = localR;
  };

  /** Pick a fresh wander target near the NPC's home (on land/beach) + a speed. */
  const pickTarget = (npc) => {
    npc.speed = Math.random() < config.runChance ? config.runSpeed : config.walkSpeed;
    const r0 = npc.localR || config.wanderRadius;
    for (let t = 0; t < TARGET_TRIES; t++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * r0;
      const tu = npc.hu + Math.cos(a) * r, tv = npc.hv + Math.sin(a) * r;
      if (terrainHeightAt(tu, tv) >= BEACH_LEVEL) { npc.tu = tu; npc.tv = tv; return; }
    }
    npc.tu = npc.hu; npc.tv = npc.hv;   // all wet → head back to the (land) home
  };

  /** Seed a freshly-created NPC at its home with a first wander target. */
  const seed = (npc, i, total) => {
    assignHome(npc, i, total);
    npc.u = npc.hu; npc.v = npc.hv;
    pickTarget(npc);
    const du = npc.tu - npc.u, dv = npc.tv - npc.v;
    const dl = Math.hypot(du, dv) || 1;
    npc.fu = du / dl; npc.fv = dv / dl;   // face the first target
  };

  /** Build one NPC with a hash-derived avatar identity. */
  const makeNpc = (i) => {
    const a = hash(i + 1), b = hash(i + 7);
    return {
      // wander state (tangent-plane coords; home + targets set by seed())
      u: 0, v: 0, hu: 0, hv: 0, localR: 0,
      tu: 0, tv: 0,
      fu: 1, fv: 0,
      speed: config.walkSpeed,
      pause: Math.random() * 1.5,
      // avatar identity (consumed by the renderer's instance writer)
      pattern: 1 + (i * 7 + 3) % 40,
      baseColor: [0.55 + a * 0.3, 0.55 + b * 0.3, 0.6 + hash(i + 3) * 0.3],
      colorA: [a, 1 - a * 0.5, 0.6 + b * 0.4],
      colorB: [1 - b, b, 1 - a * 0.7],
      lineScale: 12 + a * 24,
      lineWidth: 0.04 + b * 0.06,
      lineGlow: 0.4 + a * 0.5,
      glowMul: 2.5 + b * 4,
      multiColor: 1,
      animSpeed: 0.6 + b * 1.6,
      // Voxel identity — a coherent random avatar, deterministic per index so the
      // roster is stable across regenerations. The renderer builds a mesh from it.
      voxelParams: randomVoxelParams(mulberry32(((i + 1) * 0x9e3779b9) | 0)),
      _mesh: null,         // lazily-built GPU mesh {vb, ib, count}, cached by renderer
      // per-frame render outputs (filled by update)
      center: [0, 0, 0],   // camera-relative position
      forward: [1, 0, 0],  // world-space facing
      state: 0,            // 0 idle · 1 walk · 2 run · 3 swim · 4 tread · 5 greeting · 6 dancing
      emote: 0,            // seconds left of an in-progress emote
      emoteState: 0,       // which emote is in progress (5 greeting / 6 dancing)
    };
  };

  /** Grow/shrink the roster to match config.count (capped at MAX_NPCS). */
  const syncRoster = () => {
    const target = Math.max(0, Math.min(MAX_NPCS, Math.round(config.count)));
    while (npcs.length < target) {
      const idx = npcs.length;
      const npc = makeNpc(idx);
      if (anchor) seed(npc, idx, target);
      npcs.push(npc);
    }
    if (npcs.length > target) npcs.length = target;
  };

  return {
    config,

    /**
     * Provide the exact-ground sampler (the GPU physics grid, shared with the player) so NPCs
     * decide swim/walk from the real terrain instead of the CPU noise. fn(x,y,z) → height km | null.
     * @param {(x:number,y:number,z:number)=>number|null} fn
     */
    setGroundSampler(fn) { groundSampler = fn; },

    /** @returns {number} Current NPC count. */
    get count() { return npcs.length; },

    /** @returns {Array<object>} The live NPC roster (read-only use). */
    get npcs() { return npcs; },

    /** Drop the roster so the next update rebuilds it with fresh identities. */
    regenerate() { npcs.length = 0; },

    /**
     * Advance the wander one frame and compute per-NPC render data.
     * @param {number[]} avatarSphere - Local player position (camera-relative).
     * @param {number[]} earthCenter - Camera-relative earth centre.
     * @param {object} [terrainParams] - Terrain generation params; enables the
     *   in-water test so NPCs over the sea get swim/tread states (3/4).
     * @returns {Array<object>} The NPC roster with fresh `.center`/`.forward`/`.state`.
     */
    update(avatarSphere, earthCenter, terrainParams = null) {
      if (!config.enabled || !avatarSphere) {
        npcs.length = 0;
        anchor = null;
        return npcs;
      }

      const tNow = performance.now() / 1000;
      const ec = earthCenter;
      if (terrainParams) landParams = terrainParams;   // for the land/beach placement test

      // Re-anchor the crowd to the parcel cell the avatar is currently in. Every
      // parcel the player visits gets its own full set of NPCs centred on it; the
      // ones in the parcel left behind effectively deactivate as the crowd moves
      // on, so the population per parcel stays constant. Re-seeds only when the
      // avatar actually crosses into a new cell (parcels are ~13 km wide, so this
      // is rare — no per-frame churn).
      const ax = avatarSphere[0] - ec[0], ay = avatarSphere[1] - ec[1], az = avatarSphere[2] - ec[2];
      const avatarR = Math.hypot(ax, ay, az) || 1;
      const cell = picker.pointToFace([ax, ay, az]);
      const cellChanged = cell && (!anchor ||
        anchor.face !== cell.face || anchor.localX !== cell.localX || anchor.localY !== cell.localY);

      if (cellChanged) {
        // Anchor on the parcel CENTRE so the crowd fills the whole cell regardless
        // of where in it the avatar stands.
        const w = picker.parcelToWorld(cell.face, cell.localX, cell.localY, ec); // camera-relative
        const cx = w[0] - ec[0], cy = w[1] - ec[1], cz = w[2] - ec[2];
        const cl = Math.hypot(cx, cy, cz) || 1;
        const ux = cx / cl, uy = cy / cl, uz = cz / cl;

        const ref = Math.abs(uy) < 0.99 ? [0, 1, 0] : [1, 0, 0];
        let t1x = uy * ref[2] - uz * ref[1], t1y = uz * ref[0] - ux * ref[2], t1z = ux * ref[1] - uy * ref[0];
        const t1l = Math.hypot(t1x, t1y, t1z) || 1; t1x /= t1l; t1y /= t1l; t1z /= t1l;
        const t2x = uy * t1z - uz * t1y, t2y = uz * t1x - ux * t1z, t2z = ux * t1y - uy * t1x;

        // One parcel spans ~ avatarR · 2 / FACE_SIZE in tangent units (km) at this radius.
        // A per-parcel seed makes each cell's layout distinct but deterministic.
        const cellSize = avatarR * 2 / FACE_SIZE;
        const parcelSeed = ((cell.face + 1) * 131071 + cell.localX * 359 + cell.localY) | 0;
        anchor = {
          fromEarth: [ux * avatarR, uy * avatarR, uz * avatarR], t1: [t1x, t1y, t1z], t2: [t2x, t2y, t2z],
          radius: avatarR, cellSize, face: cell.face, localX: cell.localX, localY: cell.localY, parcelSeed,
        };
        lastTime = tNow;
        for (let i = 0; i < npcs.length; i++) seed(npcs[i], i, npcs.length);
      }

      if (!anchor) return npcs;   // no valid parcel yet — skip until one is found

      syncRoster();

      const dt = Math.min(Math.max(tNow - lastTime, 0), 0.1);
      lastTime = tNow;

      const an = anchor.fromEarth, t1 = anchor.t1, t2 = anchor.t2, R0 = anchor.radius;

      // Avatar's tangent-plane offset from the anchor — the crowd is wrapped toroidally
      // around THIS point so the finite roster always tiles the precise-ground range
      // around the player (NPCs beyond the grid have no exact ground and would skim water).
      const dpx = ax - an[0], dpy = ay - an[1], dpz = az - an[2];
      const pu = dpx * t1[0] + dpy * t1[1] + dpz * t1[2];
      const pv = dpx * t2[0] + dpy * t2[1] + dpz * t2[2];
      const WRAP = NPC_WRAP_RADIUS * 2;

      for (const npc of npcs) {
        // Unit direction (tangent plane) toward the current wander target.
        let du = npc.tu - npc.u, dv = npc.tv - npc.v;
        let dist = Math.hypot(du, dv);
        if (dist > 1e-5) { du /= dist; dv /= dist; }

        // Random walk: stroll toward the target, then pause and re-pick. While
        // paused the NPC keeps turning toward the next target (turn-in-place).
        if (npc.pause > 0) {
          npc.pause -= dt;
        } else if (dist < WANDER_ARRIVE) {
          pickTarget(npc);
          npc.pause = 2.5 + Math.random() * 5.5;   // longer stops → idle variants + emotes are actually visible
          du = npc.tu - npc.u; dv = npc.tv - npc.v;
          const nd = Math.hypot(du, dv) || 1; du /= nd; dv /= nd;
        } else {
          const step = Math.min(npc.speed * dt, dist);
          npc.u += du * step; npc.v += dv * step;
        }

        // Smoothly rotate the facing toward (du,dv) at a limited turn rate.
        const cur = Math.atan2(npc.fv, npc.fu);
        let delta = Math.atan2(dv, du) - cur;
        delta = Math.atan2(Math.sin(delta), Math.cos(delta));   // wrap to [-PI, PI]
        const maxTurn = config.turnRate * dt;
        const fa = cur + Math.max(-maxTurn, Math.min(maxTurn, delta));
        npc.fu = Math.cos(fa); npc.fv = Math.sin(fa);
        npc.forward[0] = npc.fu * t1[0] + npc.fv * t2[0];
        npc.forward[1] = npc.fu * t1[1] + npc.fv * t2[1];
        npc.forward[2] = npc.fu * t1[2] + npc.fv * t2[2];

        // Toroidal-wrap the wander coords around the avatar so this NPC renders within
        // NPC_WRAP_RADIUS of the player (inside the precise grid) whatever its world home is.
        const wu = pu + wrapDelta(npc.u - pu, WRAP);
        const wv = pv + wrapDelta(npc.v - pv, WRAP);

        // Distance LOD: fade out toward the wrap seam so the tile boundary is hidden while
        // culled. Computed here (exact tangent distance to the player) so the renderer just
        // writes it — no camera-relative recompute that could mismatch the wrap edge.
        const pd = Math.hypot(wu - pu, wv - pv);
        const ft = Math.max(0, Math.min(1, (pd - NPC_FADE_START) / (NPC_VIEW_RADIUS - NPC_FADE_START)));
        npc._fade = 1 - ft * ft * (3 - 2 * ft);   // 1 near → 0 at the view radius

        // Surface position: anchor + wrapped tangential offset (radius corrected on GPU).
        const px = an[0] + t1[0] * wu + t2[0] * wv;
        const py = an[1] + t1[1] * wu + t2[1] * wv;
        const pz = an[2] + t1[2] * wu + t2[2] * wv;
        const pl = Math.hypot(px, py, pz) || 1;
        const nx = px / pl, ny = py / pl, nz = pz / pl;   // surface normal
        npc.center[0] = nx * R0 + ec[0];
        npc.center[1] = ny * R0 + ec[1];
        npc.center[2] = nz * R0 + ec[2];

        const moving = npc.pause <= 0;
        // Read the EXACT baked terrain height under this NPC from the GPU physics grid — the same
        // ground truth the player uses (docs/GPU_PHYSICS_GRID.md), via the absolute world position
        // (dir × R0 + EARTH_CENTER). So swim/tread (3/4) only fire in real water, not on the
        // CPU-noise "other planet". Outside the grid's coverage it returns null → walk/run/idle.
        const groundH = groundSampler?.(nx * R0 + EARTH_CENTER[0], ny * R0 + EARTH_CENTER[1], nz * R0 + EARTH_CENTER[2]);
        const inWater = groundH != null && groundH < -SWIM_DEPTH;
        if (inWater) {
          npc.emote = 0;
          npc.state = moving ? 3 : 4;
        } else if (moving) {
          npc.emote = 0;
          npc.state = npc.speed === config.runSpeed ? 2 : 1;
        } else if (npc.emote > 0) {
          npc.emote -= dt;                          // emote in progress on land
          npc.pause = Math.max(npc.pause, npc.emote); // stay put so the emote plays out fully
          npc.state = npc.emoteState;
        } else if (Math.random() < EMOTE_CHANCE * dt) {
          const dance = Math.random() < DANCE_RATIO;  // occasionally wave or dance while standing
          npc.emoteState = dance ? 6 : 5;
          npc.emote = dance ? DANCE_DURATION : GREET_DURATION;
          npc.pause = npc.emote;                      // hold the stop for the whole emote
          npc.state = npc.emoteState;
        } else {
          npc.state = 0;                            // varied idle (slot chosen per NPC in CharacterSystem)
        }
      }

      return npcs;
    },
  };
};
