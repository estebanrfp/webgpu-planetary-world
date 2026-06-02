/**
 * Application State Container
 * @module store/appState
 *
 * Single mutable object that holds ALL application state.
 * Functions access state via this object, enabling modularization
 * while preserving EXACT behavior.
 *
 * MIGRATION PATTERN:
 *   Before: let currentPage = 1
 *   After:  appState.currentPage = 1
 *
 *   Before: currentPage = 5
 *   After:  appState.currentPage = 5
 *
 * The logic remains IDENTICAL - only the access pattern changes.
 */

/**
 * Centralized application state
 * All properties mirror the original local variables in app-core.js
 */
export const appState = {
  // ========== EXPLORE VIEW STATE (lines 112-118 in app-core.js) ==========
  currentPage: 1,
  maxKnownPage: 1,
  isLoading: false,
  noMoreItemsToLoad: false,
  pageLastItemCursors: {},
  itemsCurrentlyInView: new Set(),
  lastBatchResultCount: 0,
  pageVisibilityObserver: null,
  visibleItemsMap: new Map(),

  // ========== VIEW MODES (line 98, 424, 432) ==========
  exploreViewMode: 'grid',
  inventoryViewMode: 'grid',
  collectionsViewMode: 'table',

  // ========== CURRENT USER (line 85) ==========
  CURRENT_USER: '',

  // ========== BATCH MODE STATE (lines 1243, 1280) ==========
  savedTypesBeforeBatchBuy: null,
  savedListingStatusesBeforeSelect: null,

  // ========== INVENTORY GROUPING (lines 1939-1956 in app-core.js) ==========
  inventoryGroupFilter: null,
  expandedGroupKey: null,
  expandedGroupItems: [],
  disableGrouping: false,
  navigationStack: [],
  inventoryGroupsCache: new Map(),

  // ========== VIEW PAGINATION (lines 123-128 in app-core.js) ==========
  // EXACT COPY of app-core.js viewPagination object
  viewPagination: {
    collections: { currentPage: 1, maxKnownPage: 1, cursors: {}, isLoading: false, noMoreItems: false, lastCount: 0, sortField: 'volume', sortOrder: 'desc' },
    inventory: { currentPage: 1, maxKnownPage: 1, cursors: {}, isLoading: false, noMoreItems: false, lastCount: 0, sortField: 'timestamp', sortOrder: 'desc' },
    offers: { currentPage: 1, maxKnownPage: 1, cursors: {}, isLoading: false, noMoreItems: false, lastCount: 0, sortField: 'timestamp', sortOrder: 'desc', filterDirection: 'all', filterStatus: 'pending' },
    activity: { currentPage: 1, maxKnownPage: 1, cursors: {}, isLoading: false, noMoreItems: false, lastCount: 0, sortField: 'timestamp', sortOrder: 'desc', filterType: 'all' }
  },

  // ========== SUBSCRIPTIONS (mirrors core/subscriptions.js) ==========
  subscriptions: {
    explore: null,
    inventory: null,
    offers: null,
    activity: null
  },

  // ========== RENDERED ITEMS TRACKING ==========
  renderedItems: {
    explore: new Set(),
    inventory: new Set(),
    offers: new Set(),
    activity: new Set()
  },

  // ========== DOM ELEMENTS CACHE (set during init) ==========
  elements: null,

  // ========== DATABASE INSTANCE (set during init) ==========
  db: null
}

/**
 * Initialize state with DOM elements and database
 * Called once during app initialization
 * @param {object} elements - DOM elements cache
 * @param {object} db - GenosDB instance
 */
export function initAppState(elements, db) {
  appState.elements = elements
  appState.db = db
}

/**
 * Reset explore pagination state
 * EXACT copy of resetPaginationState() from app-core.js line 196
 */
export function resetPaginationState() {
  appState.pageLastItemCursors = {}
  appState.currentPage = 1
  appState.maxKnownPage = 1
  appState.noMoreItemsToLoad = false
  appState.itemsCurrentlyInView.clear()
  appState.visibleItemsMap.clear()
  localStorage.removeItem('ovgrid-marketplace-db_explore_pagination')
}

/**
 * Reset pagination for a specific view
 * EXACT copy of resetViewPagination() from app-core.js line 210
 * @param {string} viewName - View name
 */
export function resetViewPagination(viewName) {
  const state = appState.viewPagination[viewName]
  if (state) {
    state.currentPage = 1
    state.cursors = {}
    state.noMoreItems = false
    state.maxKnownPage = 1
    state.lastCount = 0
  }
}

// Expose globally for wizard compatibility
if (typeof window !== 'undefined') {
  window.__APP_STATE__ = appState
}
