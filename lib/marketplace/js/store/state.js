/**
 * Application State Definition
 * @module store/state
 *
 * Central state structure for the marketplace application.
 * All mutable state should be defined here.
 */

/**
 * @typedef {object} ExploreState
 * @property {number} currentPage - Current page number
 * @property {number} maxKnownPage - Maximum discovered page
 * @property {boolean} isLoading - Loading state
 * @property {boolean} noMoreItems - No more items to load
 * @property {object} cursors - Page cursors for pagination
 * @property {number} lastBatchCount - Last batch result count
 * @property {string} viewMode - View mode: 'grid' | 'table-expanded'
 */

/**
 * @typedef {object} ViewPaginationState
 * @property {number} currentPage - Current page
 * @property {number} maxKnownPage - Max known page
 * @property {object} cursors - Pagination cursors
 * @property {boolean} noMoreItems - No more items flag
 * @property {boolean} isLoading - Loading state
 * @property {number} lastCount - Last result count
 * @property {string} sortField - Sort field
 * @property {string} sortOrder - Sort order: 'asc' | 'desc'
 */

/**
 * @typedef {object} FiltersState
 * @property {string} search - Search query
 * @property {string[]} categories - Selected categories
 * @property {string[]} types - Selected listing types
 * @property {string[]} rarities - Selected rarities
 * @property {number|null} priceMin - Minimum price filter
 * @property {number|null} priceMax - Maximum price filter
 * @property {string} sortField - Sort field
 * @property {string} sortOrder - Sort order
 * @property {string[]} listingStatuses - Inventory listing statuses
 * @property {string[]} inventoryRarities - Inventory rarities
 */

/** Default items per page */
export const ITEMS_PER_PAGE = 24

/** Default view items per page */
export const VIEW_ITEMS_PER_PAGE = 20

/**
 * Default filters state
 * @type {FiltersState}
 */
export const DEFAULT_FILTERS = {
  search: '',
  categories: [],
  types: ['sale', 'rent', 'auction', 'bundle'],
  rarities: [],
  priceMin: null,
  priceMax: null,
  sortField: 'timestamp',
  sortOrder: 'desc',
  listingStatuses: ['unlisted', 'sale', 'rent', 'auction'],
  inventoryRarities: []
}

/**
 * Create default view pagination state
 * @param {object} overrides - Override defaults
 * @returns {ViewPaginationState}
 */
export const createViewPaginationState = (overrides = {}) => ({
  currentPage: 1,
  maxKnownPage: 1,
  cursors: {},
  noMoreItems: false,
  isLoading: false,
  lastCount: 0,
  sortField: 'timestamp',
  sortOrder: 'desc',
  ...overrides
})

/**
 * Initial application state
 */
export const initialState = {
  // User
  currentUser: null,

  // Current active view
  currentView: 'explore',

  // View modes (grid/table)
  viewModes: {
    explore: 'grid',
    inventory: 'grid',
    collections: 'table'
  },

  // Explore view state
  explore: {
    currentPage: 1,
    maxKnownPage: 1,
    isLoading: false,
    noMoreItems: false,
    cursors: {},
    lastBatchCount: 0,
    viewMode: 'grid'
  },

  // View-specific pagination states
  views: {
    inventory: createViewPaginationState({ sortField: 'title' }),
    collections: createViewPaginationState({ sortField: 'name' }),
    offers: createViewPaginationState({
      sortField: 'timestamp',
      filterDirection: 'all',
      filterStatus: 'pending'
    }),
    activity: createViewPaginationState({
      sortField: 'timestamp',
      filterType: 'all'
    })
  },

  // Global filters
  filters: { ...DEFAULT_FILTERS },

  // UI state
  ui: {
    batchBuyMode: false,
    inventorySelectMode: false,
    expandedAsset: null,
    inventoryGroupFilter: null
  },

  // Subscriptions tracking
  subscriptions: {
    explore: null,
    inventory: null,
    offers: null,
    activity: null
  },

  // Rendered items tracking (to avoid duplicates)
  renderedItems: {
    explore: new Set(),
    inventory: new Set(),
    offers: new Set(),
    activity: new Set()
  }
}

/**
 * Deep clone state for immutable updates
 * @param {object} obj - Object to clone
 * @returns {object} Cloned object
 */
export function cloneState(obj) {
  if (obj === null || typeof obj !== 'object') return obj
  if (obj instanceof Set) return new Set(obj)
  if (obj instanceof Map) return new Map(obj)
  if (Array.isArray(obj)) return obj.map(cloneState)

  const cloned = {}
  for (const key in obj) {
    if (Object.hasOwn(obj, key)) {
      cloned[key] = cloneState(obj[key])
    }
  }
  return cloned
}
