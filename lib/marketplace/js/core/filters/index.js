/**
 * Filters module index
 * @module core/filters/index
 */

// State
export { filters, DEFAULT_FILTERS, resetFilters } from './state.js'

// Query building
export { buildFilterQuery, buildViewQuery } from './query.js'

// Counts
export {
  initFilterCounts,
  updateFilterCounts,
  updateExploreCounts,
  updateInventoryCounts,
  updateOffersCounts
} from './counts.js'

// UI
export { initFilterUI, updateFilterUIFromState } from './ui.js'

// Listeners
export {
  initFilterListeners,
  setupAllFilterListeners,
  setupSearchListener,
  setupCategoryFilterListener,
  setupStatusFilterListener,
  setupRarityFilterListener,
  setupInventoryStatusFilterListener,
  setupInventoryCategoryFilterListener,
  setupInventoryRarityFilterListener,
  setupPriceFilterListener,
  setupTableSortListener,
  setupCollectionSortListener,
  setupOfferDirectionFilterListener,
  setupOfferStatusFilterListener,
  setupActivityTypeFilterListener
} from './listeners.js'
