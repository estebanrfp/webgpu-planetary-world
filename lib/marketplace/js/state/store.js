/**
 * Marketplace State Store
 * Centralized state management (ready for GenosDB integration)
 * @module marketplace/state/store
 */

/** Current state */
const state = {
  // User
  currentUser: null,
  isConnected: false,
  balance: 0,

  // Navigation
  currentView: 'explore',
  currentTab: 'explore',

  // Selection
  selectedAsset: null,
  selectedListing: null,
  selectedBundle: null,

  // Batch operations
  selectedInventoryItems: new Set(),
  selectedExploreItems: new Set(),
  inventorySelectMode: false,
  batchBuyMode: false,

  // Filters
  filters: {
    category: 'all',
    priceMin: null,
    priceMax: null,
    sortBy: 'recent'
  },

  // Data (will be populated by GenosDB)
  inventory: [],
  listings: [],
  offers: [],
  activity: [],

  // UI state
  isLoading: false,
  isSyncing: false,
  activeModal: null
}

/** State change listeners */
const listeners = new Set()

/**
 * Get current state (read-only copy)
 * @returns {object} Current state
 */
export function getState() {
  return { ...state }
}

/**
 * Update state
 * @param {object} updates - State updates
 */
export function setState(updates) {
  Object.assign(state, updates)
  notifyListeners()
}

/**
 * Subscribe to state changes
 * @param {Function} listener - Callback function
 * @returns {Function} Unsubscribe function
 */
export function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * Notify all listeners of state change
 */
function notifyListeners() {
  listeners.forEach(fn => fn(state))
}

/**
 * Reset state to defaults
 */
export function resetState() {
  state.selectedAsset = null
  state.selectedListing = null
  state.selectedBundle = null
  state.selectedInventoryItems.clear()
  state.selectedExploreItems.clear()
  state.inventorySelectMode = false
  state.batchBuyMode = false
  state.activeModal = null
  notifyListeners()
}

/** Export store object */
export const store = {
  getState,
  setState,
  subscribe,
  resetState,

  // Direct state access (for convenience)
  get state() { return state }
}
