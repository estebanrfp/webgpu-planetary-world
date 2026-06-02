/**
 * Collections View Mode Management
 * @module modules/collections/viewMode
 *
 * EXACT COPY of app-core.js lines 1920-1926
 * Only change: collectionsViewMode accessed via appState object
 *
 * ORIGINAL:
 *   collectionsViewMode, saveViewMode, loadCollections
 *
 * MIGRATED:
 *   appState.collectionsViewMode, saveViewMode (imported), loadCollections (callback)
 */

import { appState } from '../../store/appState.js'
import { saveViewMode, loadViewMode } from '../explore/viewMode.js'

/**
 * Set collections view mode
 * EXACT COPY of app-core.js lines 1921-1925
 * Note: loadCollections must be passed as callback
 * @param {string} mode - View mode ('grid' or 'table')
 * @param {function} loadCollections - Load function callback
 */
export function setCollectionsViewMode(mode, loadCollections) {
  appState.collectionsViewMode = mode                    // was: collectionsViewMode = mode
  saveViewMode('collections', mode)
  loadCollections()
}

/**
 * Get current collections view mode
 * EXACT COPY of app-core.js line 1926
 * @returns {string} Current view mode
 */
export function getCollectionsViewMode() {
  return appState.collectionsViewMode                    // was: return collectionsViewMode
}

/**
 * Initialize collections view mode from localStorage
 * Call this during app initialization
 */
export function initCollectionsViewMode() {
  appState.collectionsViewMode = loadViewMode('collections') || 'grid'
}
