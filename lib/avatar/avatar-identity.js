/**
 * avatar-identity.js — gives every player a distinct avatar.
 *
 * Default look is derived DETERMINISTICALLY from the player's Ethereum address, so peers
 * don't all spawn as the same character. Once the player customizes it, that look is
 * persisted and takes priority — and since presence broadcasts `AVATAR_CONFIG.voxelParams`
 * live, the change propagates to everyone naturally.
 *
 * Resolution priority: saved custom look > look seeded from the Eth address.
 */

import { randomVoxelParams } from './voxel-builder.js'

const LOOK_KEY = 'ovgrid_avatar_look'

/** Mulberry32 seeded PRNG → deterministic [0,1) sequence from a 32-bit seed. */
export const mulberry32 = (seed) => {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** FNV-1a hash of a string → 32-bit unsigned seed. */
const hashSeed = (str) => {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/**
 * Deterministic voxel avatar params for an Ethereum address (or any id string).
 * Same address → same avatar, every time, on every peer.
 * @param {string} address
 * @returns {object} voxelParams
 */
export const voxelParamsFromAddress = (address) => randomVoxelParams(mulberry32(hashSeed(String(address))))

/** Persist the player's customized look so it survives reloads (and keeps broadcasting). */
export const saveAvatarLook = (params) => {
  try { localStorage.setItem(LOOK_KEY, JSON.stringify(params)) } catch { /* storage unavailable */ }
}

/** @returns {object|null} A previously saved custom look, or null. */
export const loadAvatarLook = () => {
  try { return JSON.parse(localStorage.getItem(LOOK_KEY)) } catch { return null }
}

/**
 * Resolve the avatar the player should wear on entry.
 * @param {string|null} address - Player's Ethereum address (from AuthManager)
 * @returns {object|null} voxelParams to apply, or null to keep the config default (no identity yet)
 */
export const resolvePlayerAvatar = (address) =>
  loadAvatarLook() ?? (address ? voxelParamsFromAddress(address) : null)
