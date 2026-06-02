/**
 * Parcel Picking — Ray-sphere intersection for selecting parcels on the planet.
 *
 * Adapted from land-map-sphere.js for the real planet (radius 6360 km).
 * Works with floating-origin coordinates (camera at 0,0,0).
 *
 * @module parcel-picking
 */

import { PLANET_RADIUS } from '../config/planetConfig.js'

export const FACE_SIZE = 123 // parcels per cube-face edge (123×123 grid per face)
const PICK_RADIUS = PLANET_RADIUS + 0.15 // Match parcel height offset

/**
 * Create a parcel picker.
 * @returns {object} Picker API
 */
export const createParcelPicker = () => {

  /**
   * Convert screen coordinates to a world-space ray.
   * Uses inverse view-projection matrix for unprojection.
   * @param {number} screenX
   * @param {number} screenY
   * @param {HTMLCanvasElement} canvas
   * @param {Float32Array} invViewProj - 4x4 inverse view-projection matrix
   * @returns {{ origin: number[], dir: number[] }}
   */
  const screenToRay = (screenX, screenY, canvas, invViewProj) => {
    const rect = canvas.getBoundingClientRect()
    const ndcX = ((screenX - rect.left) / rect.width) * 2 - 1
    const ndcY = -((screenY - rect.top) / rect.height) * 2 + 1

    // Unproject near and far points
    const nearClip = unproject(ndcX, ndcY, 1.0, invViewProj)  // Reverse-Z: near = 1.0
    const farClip = unproject(ndcX, ndcY, 0.0, invViewProj)   // Reverse-Z: far = 0.0

    const dir = normalize3(sub3(farClip, nearClip))

    // Camera at origin (floating origin)
    return { origin: [0, 0, 0], dir }
  }

  /**
   * Unproject NDC point to world space via inverse VP matrix.
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @param {Float32Array} m - 4x4 matrix (column-major)
   * @returns {number[]}
   */
  const unproject = (x, y, z, m) => {
    const w = m[3] * x + m[7] * y + m[11] * z + m[15]
    return [
      (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
      (m[1] * x + m[5] * y + m[9] * z + m[13]) / w,
      (m[2] * x + m[6] * y + m[10] * z + m[14]) / w,
    ]
  }

  /**
   * Ray-sphere intersection.
   * @param {number[]} origin
   * @param {number[]} dir
   * @param {number} radius
   * @returns {number[]|null} Intersection point or null
   */
  const raySphereIntersect = (origin, dir, radius = PICK_RADIUS) => {
    const a = dir[0] ** 2 + dir[1] ** 2 + dir[2] ** 2
    const b = 2 * (origin[0] * dir[0] + origin[1] * dir[1] + origin[2] * dir[2])
    const c = origin[0] ** 2 + origin[1] ** 2 + origin[2] ** 2 - radius ** 2
    const disc = b * b - 4 * a * c
    if (disc < 0) return null
    const t = (-b - Math.sqrt(disc)) / (2 * a)
    if (t < 0) return null
    return [origin[0] + dir[0] * t, origin[1] + dir[1] * t, origin[2] + dir[2] * t]
  }

  /**
   * Convert a 3D hit point (in camera-relative space) to face + local coordinates.
   * The point must be relative to earthCenter (subtract earthCenter before calling).
   * @param {number[]} point - Point on sphere surface (planet-local)
   * @returns {{ face: number, localX: number, localY: number }|null}
   */
  const pointToFace = (point) => {
    const [x, y, z] = point
    const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z)

    let face, u, v
    if (az >= ax && az >= ay) {
      // +Z / -Z
      face = z > 0 ? 0 : 1
      u = z > 0 ? x / az : -x / az
      v = y / az
    } else if (ax >= ay && ax >= az) {
      // +X / -X
      face = x > 0 ? 2 : 3
      u = x > 0 ? -z / ax : z / ax
      v = y / ax
    } else {
      // +Y / -Y
      face = y > 0 ? 4 : 5
      u = x / ay
      v = y > 0 ? -z / ay : z / ay
    }

    const localX = Math.floor((u * 0.5 + 0.5) * FACE_SIZE)
    const localY = Math.floor((v * 0.5 + 0.5) * FACE_SIZE)

    if (localX < 0 || localX >= FACE_SIZE || localY < 0 || localY >= FACE_SIZE) return null
    return { face, localX, localY }
  }

  /**
   * Full pick: screen coords → face + local parcel coordinates.
   * @param {number} screenX
   * @param {number} screenY
   * @param {HTMLCanvasElement} canvas
   * @param {Float32Array} invViewProj - Inverse view-projection (column-major)
   * @param {number[]} earthCenter - Camera-relative earth center [x, y, z]
   * @returns {{ face: number, localX: number, localY: number }|null}
   */
  const pick = (screenX, screenY, canvas, invViewProj, earthCenter) => {
    const { origin, dir } = screenToRay(screenX, screenY, canvas, invViewProj)

    // Shift ray origin by earthCenter so sphere is centered at origin
    const shiftedOrigin = [
      origin[0] - earthCenter[0],
      origin[1] - earthCenter[1],
      origin[2] - earthCenter[2],
    ]

    const hit = raySphereIntersect(shiftedOrigin, dir)
    if (!hit) return null

    // hit is now planet-local (sphere center at origin)
    return pointToFace(hit)
  }

  /**
   * Convert a parcel center to absolute world position [x, y, z].
   * @param {number} face
   * @param {number} localX
   * @param {number} localY
   * @param {number[]} earthCenter - Absolute earth center [x, y, z]
   * @returns {number[]} Absolute world position [x, y, z]
   */
  const parcelToWorld = (face, localX, localY, earthCenter) => {
    const cubeU = ((localX + 0.5) / FACE_SIZE) * 2 - 1
    const cubeV = ((localY + 0.5) / FACE_SIZE) * 2 - 1

    const fn = FN[face], fr = FR[face], fu = FU[face]
    const cx = fn[0] + fr[0] * cubeU + fu[0] * cubeV
    const cy = fn[1] + fr[1] * cubeU + fu[1] * cubeV
    const cz = fn[2] + fr[2] * cubeU + fu[2] * cubeV
    const len = Math.sqrt(cx * cx + cy * cy + cz * cz)

    const r = PICK_RADIUS
    return [
      earthCenter[0] + (cx / len) * r,
      earthCenter[1] + (cy / len) * r,
      earthCenter[2] + (cz / len) * r,
    ]
  }

  return { screenToRay, raySphereIntersect, pointToFace, pick, parcelToWorld }
}

// ─── Constants ───

const FN = [[0,0,1],[0,0,-1],[1,0,0],[-1,0,0],[0,1,0],[0,-1,0]]
const FR = [[1,0,0],[-1,0,0],[0,0,-1],[0,0,1],[1,0,0],[1,0,0]]
const FU = [[0,1,0],[0,1,0],[0,1,0],[0,1,0],[0,0,-1],[0,0,1]]

// ─── Math helpers ───

const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const normalize3 = (v) => {
  const len = Math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2)
  return len > 0 ? [v[0] / len, v[1] / len, v[2] / len] : [0, 0, 0]
}
