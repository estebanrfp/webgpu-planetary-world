/**
 * Inventory View Mode Management
 * @module modules/inventory/viewMode
 *
 * EXACT COPY of app-core.js lines 1929-1936
 * Only change: inventoryViewMode accessed via appState object
 *
 * ORIGINAL:
 *   inventoryViewMode, saveViewMode, resetViewPagination, subscribeToInventory
 *
 * MIGRATED:
 *   appState.inventoryViewMode, saveViewMode (imported), resetViewPagination, subscribeToInventory (callbacks)
 */

import { appState } from '../../store/appState.js'
import { VIEW_MODE_STORAGE_KEY } from '../../core/constants.js'
import { saveViewMode, loadViewMode } from '../explore/viewMode.js'
import { resetViewPagination } from '../views/pagination.js'

/**
 * Set inventory view mode
 * EXACT COPY of app-core.js lines 1930-1935
 * Note: subscribeToInventory must be passed as callback
 * @param {string} mode - View mode
 * @param {function} subscribeToInventory - Subscribe function
 */
export function setInventoryViewMode(mode, subscribeToInventory) {
  appState.inventoryViewMode = mode                      // was: inventoryViewMode = mode
  saveViewMode('inventory', mode)
  resetViewPagination('inventory')
  subscribeToInventory({ pageToLoad: 1 })
}

/**
 * Get current inventory view mode
 * EXACT COPY of app-core.js line 1936
 * @returns {string} Current view mode
 */
export function getInventoryViewMode() {
  return appState.inventoryViewMode                      // was: return inventoryViewMode
}

/**
 * Initialize inventory view mode from localStorage
 * Call this during app initialization
 */
export function initInventoryViewMode() {
  appState.inventoryViewMode = loadViewMode('inventory')
}
