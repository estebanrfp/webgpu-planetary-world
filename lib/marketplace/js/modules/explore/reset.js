/**
 * Explore Pagination Reset
 * @module modules/explore/reset
 *
 * EXACT COPY of app-core.js lines 196-204
 * Only change: variables accessed via appState object
 *
 * ORIGINAL:
 *   pageLastItemCursors, currentPage, maxKnownPage, noMoreItemsToLoad,
 *   itemsCurrentlyInView, visibleItemsMap, LOCAL_STORAGE_KEY
 *
 * MIGRATED:
 *   appState.pageLastItemCursors, appState.currentPage, etc.
 */

import { appState } from '../../store/appState.js'
import { LOCAL_STORAGE_KEY } from '../../core/constants.js'

/**
 * Reset explore pagination state
 * EXACT COPY of app-core.js lines 196-204
 */
export function resetPaginationState() {
  appState.pageLastItemCursors = {}                      // was: pageLastItemCursors = {}
  appState.currentPage = 1                               // was: currentPage = 1
  appState.maxKnownPage = 1                              // was: maxKnownPage = 1
  appState.noMoreItemsToLoad = false                     // was: noMoreItemsToLoad = false
  appState.itemsCurrentlyInView.clear()                  // was: itemsCurrentlyInView.clear()
  appState.visibleItemsMap.clear()                       // was: visibleItemsMap.clear()
  localStorage.removeItem(LOCAL_STORAGE_KEY)
}

/**
 * Reset inventory pagination (convenience wrapper)
 * EXACT COPY of app-core.js lines 206-208
 */
import { resetViewPagination } from '../views/pagination.js'

export function resetInventoryPagination() {
  resetViewPagination('inventory')
}

// Re-export for convenience
export { resetViewPagination }
