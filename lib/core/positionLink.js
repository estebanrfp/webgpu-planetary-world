/**
 * positionLink.js — shareable position deep-links via the `?p=` URL parameter.
 *
 * Format: `?p = dx,dy,dz,yaw,pitch,distance,face,parcelX,parcelY`
 *   - `dx,dy,dz`            avatar offset from its PARCEL CENTER (km) — small numbers, like the
 *                           legacy Babylon "local within tile" trick, but for a spherical planet
 *   - `yaw,pitch,distance`  third-person camera (targetYaw / targetPitch / targetDistance), yaw wrapped to (-π,π]
 *   - `face,parcelX,parcelY` the cube-sphere parcel ("cell") the avatar stands in
 *
 * World position = parcelCenter(face,parcelX,parcelY) + (dx,dy,dz). Encode and decode use the
 * SAME `parcelToWorld`, so the reconstruction is exact. Off-surface (deep space, no parcel) the
 * absolute position is stored instead, flagged with face = -1.
 */

import { createParcelPicker } from '../terrain/parcel-picking.js'
import { EARTH_CENTER } from '../config/planetConfig.js'

const PREC = 2            // decimals → ~10 m position / ~0.5° camera precision (short, shareable URLs)
const TAU = Math.PI * 2
const picker = createParcelPicker()

/** Wrap an angle to (-π, π] so an accumulated camera yaw stays a small number. */
const wrapAngle = (a) => {
  const x = ((a + Math.PI) % TAU + TAU) % TAU - Math.PI
  return x === -Math.PI ? Math.PI : x
}

/** Round to PREC decimals and drop trailing zeros (e.g. 0.06200 → "0.062", 2.000 → "2"). */
const f = (n) => String(+Number(n).toFixed(PREC))

/**
 * Build the `?p=` value from the current avatar position and camera.
 * @param {{x:number,y:number,z:number}} pos - Avatar world position (km)
 * @param {{targetYaw:number,targetPitch:number,targetDistance:number}} camera
 * @returns {string} Comma-separated 9-value param
 */
export const encodePosition = (pos, camera) => {
  const cell = picker.pointToFace([pos.x - EARTH_CENTER[0], pos.y - EARTH_CENTER[1], pos.z - EARTH_CENTER[2]])
  const cam = [f(wrapAngle(camera.targetYaw)), f(camera.targetPitch), f(camera.targetDistance)]
  if (cell) {
    const c = picker.parcelToWorld(cell.face, cell.localX, cell.localY, EARTH_CENTER)
    return [f(pos.x - c[0]), f(pos.y - c[1]), f(pos.z - c[2]), ...cam, cell.face, cell.localX, cell.localY].join(',')
  }
  // Off-surface (deep space): no parcel — store absolute position, face = -1 sentinel.
  return [f(pos.x), f(pos.y), f(pos.z), ...cam, -1, -1, -1].join(',')
}

/**
 * Parse a `?p=` value into world position + camera (+ parcel).
 * @param {string} str - Raw `?p=` value
 * @returns {{pos:{x:number,y:number,z:number}, camera:{targetYaw:number,targetPitch:number,targetDistance:number}, parcel:{face:number,localX:number,localY:number}|null}|null}
 */
export const decodePosition = (str) => {
  if (!str) return null
  const parts = str.split(',').map(Number)
  if (parts.length < 6 || parts.slice(0, 6).some((n) => !Number.isFinite(n))) return null
  const [a, b, c, yaw, pitch, distance, face, px, py] = parts
  const onParcel = Number.isInteger(face) && face >= 0 && face <= 5
  let pos, parcel = null
  if (onParcel) {
    const center = picker.parcelToWorld(face, px, py, EARTH_CENTER)
    pos = { x: center[0] + a, y: center[1] + b, z: center[2] + c } // parcel center + local offset
    parcel = { face, localX: px, localY: py }
  } else {
    pos = { x: a, y: b, z: c } // absolute (deep space)
  }
  return { pos, camera: { targetYaw: yaw, targetPitch: pitch, targetDistance: distance }, parcel }
}

/**
 * Default landing spot — a curated island — for fresh visitors with no `?p=` and no saved
 * session. Update it by pasting a new `?p=` value copied from the live world's address bar.
 */
const DEFAULT_SPAWN_PARAM = '4.66,-5.19,-1.44,-0.94,0.11,0.5,0,70,54'

/**
 * The default landing position/camera (curated island).
 * @returns {ReturnType<typeof decodePosition>}
 */
export const getDefaultSpawn = () => decodePosition(DEFAULT_SPAWN_PARAM)

/**
 * Read and parse the `?p=` position from the current URL, if present and valid.
 * @returns {ReturnType<typeof decodePosition>}
 */
export const readPositionFromURL = () =>
  decodePosition(new URLSearchParams(window.location.search).get('p'))

/**
 * Update the browser address bar with the current position (no new history entry).
 * @param {{x:number,y:number,z:number}} pos
 * @param {{targetYaw:number,targetPitch:number,targetDistance:number}} camera
 */
export const updatePositionURL = (pos, camera) => {
  const params = new URLSearchParams(window.location.search) // preserve other params (e.g. ?profile=)
  params.set('p', encodePosition(pos, camera))
  // URLSearchParams encodes commas as %2C; keep them literal for a clean, shareable URL.
  const qs = params.toString().replace(/%2C/g, ',')
  window.history.replaceState(null, '', `${window.location.pathname}?${qs}`)
}
