/**
 * water.js — single source of truth for "is this surface point in swimmable water?".
 *
 * Shared by the NPCs and the local player so both agree on where the coast walks and the
 * water swims, measured AGAINST SEA LEVEL (elevation 0, since seaLevelOffset = 0):
 *
 *   terrain-height multiplier × HEIGHT_SCALE = the seabed elevation in km (the value physics
 *   uses to ground the avatar). Water depth at a point = −elevation. We swim once that depth
 *   rises above the avatar's WAIST — derived from the avatar's own size (NOT a hand-picked km),
 *   so it scales correctly with the world's vertical exaggeration.
 */

import { getTerrainHeightMultiplier } from './height.js'
import { TERRAIN_SCALES } from '../config/terrainConfig.js'
import { AVATAR_CONFIG } from '../config/avatarConfig.js'

export const WATER_OCTAVES = 12; // terrain octaves for the NPC placement test (sea level is low-freq)

// Swim once sea level rises above the avatar's waist. The waist sits ~0.63 × headHeight up from
// the feet; × scale converts rig units → world km. Lower WAIST_FRACTION = swim sooner. (tunable)
const WAIST_FRACTION = 0.63;
export const SWIM_DEPTH = AVATAR_CONFIG.scale * AVATAR_CONFIG.headHeight * WAIST_FRACTION; // ≈ waist height (world km)

/**
 * Whether a point on the planet surface is in swimmable water (sea level above the avatar's waist).
 * Used for NPCs (the player reads the exact GPU-baked terrain height instead). Samples with the
 * terrain's OWN octaves so the elevation matches the visible terrain — no high-frequency mismatch.
 * @param {number[]} dir - unit vector from earth centre to the point
 * @param {object} terrainParams - terrain generation params (null → treated as land)
 * @returns {boolean}
 */
export const isPointInWater = (dir, terrainParams) =>
  !!terrainParams &&
  getTerrainHeightMultiplier(dir, terrainParams.octaves ?? 14, terrainParams) * TERRAIN_SCALES.HEIGHT_SCALE < -SWIM_DEPTH;
