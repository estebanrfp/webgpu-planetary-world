/**
 * Land Map View Component
 * HUD overlay for parcel map mode — renders controls and legend
 * over the real planet via PlanetBridge.
 * Selection UI is handled entirely by the GPU ParcelTooltipSystem.
 * @module marketplace/components/landMapView
 */

import { planetBridge } from '../../../core/PlanetBridge.js'

const VIEW_ID = 'landView'
let initialized = false

/**
 * Generate view HTML template (no canvas — planet is the canvas)
 * @returns {string} HTML string
 */
export function generateHTML() {
  return `<div class="mp-land-view" id="${VIEW_ID}"></div>`
}

/**
 * Ensure view exists in DOM
 */
function ensureView() {
  if (initialized || document.getElementById(VIEW_ID)) return
  const container = document.getElementById('views-container') || document.getElementById('main-content')
  if (container) {
    container.insertAdjacentHTML('beforeend', generateHTML())
  } else {
    document.body.insertAdjacentHTML('beforeend', generateHTML())
  }
  initialized = true
}

/**
 * Show the land map view — enters parcel mode on the real planet
 */
export function show() {
  ensureView()
  const view = document.getElementById(VIEW_ID)
  view?.classList.add('active')
  planetBridge.emit('enterParcelMode')
}

/**
 * Hide the land map view — exits parcel mode
 */
export function hide() {
  const view = document.getElementById(VIEW_ID)
  view?.classList.remove('active')
  planetBridge.emit('exitParcelMode')
}

export function init() {
  window.landMapView = { show, hide, generateHTML }
}

init()

export default { show, hide, generateHTML, init }
