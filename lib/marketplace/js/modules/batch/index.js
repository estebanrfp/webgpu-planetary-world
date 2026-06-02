/**
 * Batch Mode Operations
 * @module modules/batch
 *
 * EXACT COPY of app-core.js lines 1243-1324
 * Only change: state variables accessed via appState object
 *
 * ORIGINAL:
 *   savedTypesBeforeBatchBuy, savedListingStatusesBeforeSelect,
 *   filters, viewPagination, elements
 *
 * MIGRATED:
 *   appState.savedTypesBeforeBatchBuy, filters (imported), viewPagination (callback)
 */

import { appState } from '../../store/appState.js'
import { filters } from '../../core/filters/state.js'

/**
 * Apply batch buy filter - shows only 'sale' type items
 * EXACT COPY of app-core.js lines 1248-1260
 * @param {object} elements - DOM elements cache
 * @param {function} resetPaginationState - Reset function
 * @param {function} loadItems - Load function
 */
export function applyBatchBuyFilter(elements, resetPaginationState, loadItems) {
  // Save current types filter
  appState.savedTypesBeforeBatchBuy = [...filters.types]  // was: savedTypesBeforeBatchBuy = [...filters.types]
  // Apply filter to show only 'sale' items
  filters.types = ['sale']
  // Update UI pills
  elements.statusFilter?.querySelectorAll('.mp-filter-pill[data-type]').forEach(pill => {
    const type = pill.dataset.type
    pill.classList.toggle('active', type === 'sale')
  })
  resetPaginationState()
  loadItems({ pageToLoad: 1, append: false })
}

/**
 * Remove batch buy filter - restore previous filter state
 * EXACT COPY of app-core.js lines 1265-1277
 * @param {object} elements - DOM elements cache
 * @param {function} resetPaginationState - Reset function
 * @param {function} loadItems - Load function
 */
export function removeBatchBuyFilter(elements, resetPaginationState, loadItems) {
  if (appState.savedTypesBeforeBatchBuy) {               // was: if (savedTypesBeforeBatchBuy)
    filters.types = appState.savedTypesBeforeBatchBuy    // was: filters.types = savedTypesBeforeBatchBuy
    appState.savedTypesBeforeBatchBuy = null             // was: savedTypesBeforeBatchBuy = null
    // Update UI pills
    elements.statusFilter?.querySelectorAll('.mp-filter-pill[data-type]').forEach(pill => {
      const type = pill.dataset.type
      pill.classList.toggle('active', filters.types.includes(type))
    })
    resetPaginationState()
    loadItems({ pageToLoad: 1, append: false })
  }
}

/**
 * Apply inventory select filter - shows only 'unlisted' items
 * EXACT COPY of app-core.js lines 1285-1302
 * @param {function} getViewPagination - Get viewPagination accessor
 * @param {function} subscribeToInventory - Subscribe function
 */
export function applyInventorySelectFilter(getViewPagination, subscribeToInventory) {
  // Save current listing statuses filter
  appState.savedListingStatusesBeforeSelect = [...filters.listingStatuses]  // was: savedListingStatusesBeforeSelect = [...filters.listingStatuses]
  // Apply filter to show only unlisted items
  filters.listingStatuses = ['unlisted']
  // Update UI pills
  document.querySelectorAll('[data-inventory-status]').forEach(pill => {
    const status = pill.dataset.inventoryStatus
    pill.classList.toggle('active', status === 'unlisted')
  })
  // Reset pagination and reload inventory with new subscription
  const state = getViewPagination('inventory')           // was: viewPagination.inventory
  state.currentPage = 1
  state.cursors = {}
  state.noMoreItems = false
  state.maxKnownPage = 1
  subscribeToInventory({ pageToLoad: 1 })
}

/**
 * Remove inventory select filter - restore previous filter state
 * EXACT COPY of app-core.js lines 1307-1324
 * @param {function} getViewPagination - Get viewPagination accessor
 * @param {function} subscribeToInventory - Subscribe function
 */
export function removeInventorySelectFilter(getViewPagination, subscribeToInventory) {
  if (appState.savedListingStatusesBeforeSelect !== null) {  // was: if (savedListingStatusesBeforeSelect !== null)
    filters.listingStatuses = appState.savedListingStatusesBeforeSelect  // was: filters.listingStatuses = savedListingStatusesBeforeSelect
    appState.savedListingStatusesBeforeSelect = null     // was: savedListingStatusesBeforeSelect = null
    // Update UI pills
    document.querySelectorAll('[data-inventory-status]').forEach(pill => {
      const status = pill.dataset.inventoryStatus
      pill.classList.toggle('active', filters.listingStatuses.includes(status))
    })
    // Reset pagination and reload inventory with new subscription
    const state = getViewPagination('inventory')         // was: viewPagination.inventory
    state.currentPage = 1
    state.cursors = {}
    state.noMoreItems = false
    state.maxKnownPage = 1
    subscribeToInventory({ pageToLoad: 1 })
  }
}

/**
 * Initialize batch mode state
 * Call this during app initialization
 */
export function initBatchMode() {
  appState.savedTypesBeforeBatchBuy = null
  appState.savedListingStatusesBeforeSelect = null
}

// Re-export from exports.js
export {
  initBatchExports,
  setupBatchExports
} from './exports.js'
