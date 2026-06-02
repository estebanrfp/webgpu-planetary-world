/**
 * Explore View Mode Management
 * @module modules/explore/viewMode
 *
 * EXACT COPY of app-core.js lines 415-423
 * Only change: exploreViewMode accessed via appState object
 *
 * ORIGINAL:
 *   exploreViewMode, saveViewMode(view, mode)
 *
 * MIGRATED:
 *   appState.exploreViewMode, saveViewMode (imported)
 */

import { appState } from '../../store/appState.js'
import { VIEW_MODE_STORAGE_KEY } from '../../core/constants.js'

/**
 * Save view mode to localStorage
 * EXACT COPY of app-core.js lines 105-108
 * @param {string} view - View name (explore, inventory, collections)
 * @param {string} mode - View mode (grid, table-expanded, table)
 */
export function saveViewMode(view, mode) {
  const savedViewModes = JSON.parse(localStorage.getItem(VIEW_MODE_STORAGE_KEY) || '{}')
  savedViewModes[view] = mode
  localStorage.setItem(VIEW_MODE_STORAGE_KEY, JSON.stringify(savedViewModes))
}

/**
 * Load view mode from localStorage
 * @param {string} view - View name
 * @returns {string} Saved mode or 'grid' default
 */
export function loadViewMode(view) {
  const savedViewModes = JSON.parse(localStorage.getItem(VIEW_MODE_STORAGE_KEY) || '{}')
  return savedViewModes[view] || 'grid'
}

/**
 * Set explore view mode
 * EXACT COPY of app-core.js lines 417-422
 * Note: resetPaginationState and loadItems must be passed as callbacks
 * @param {string} mode - View mode
 * @param {function} resetPaginationState - Reset function
 * @param {function} loadItems - Load function
 */
export function setExploreViewMode(mode, resetPaginationState, loadItems) {
  appState.exploreViewMode = mode                        // was: exploreViewMode = mode
  saveViewMode('explore', mode)
  resetPaginationState()
  loadItems({ pageToLoad: 1, append: false })
}

/**
 * Get current explore view mode
 * EXACT COPY of app-core.js line 423
 * @returns {string} Current view mode
 */
export function getExploreViewMode() {
  return appState.exploreViewMode                        // was: return exploreViewMode
}

/**
 * Initialize explore view mode from localStorage
 * Call this during app initialization
 */
export function initExploreViewMode() {
  appState.exploreViewMode = loadViewMode('explore')
}
