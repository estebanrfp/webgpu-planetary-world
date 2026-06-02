// ========== MODULAR IMPORTS ==========
import { appState } from './store/appState.js'

// ========== CRITICAL MODULES (granular imports to avoid loading view modules) ==========
// Explore pagination persistence (no view dependencies)
import { savePaginationState, loadPaginationState } from './modules/explore/persistence.js'
import { saveViewMode as saveViewModeModule, initExploreViewMode } from './modules/explore/viewMode.js'
import { resetPaginationState, resetInventoryPagination } from './modules/explore/reset.js'

// Views pagination only (no loaders/subscriptions)
import { saveViewPaginationState, loadViewPaginationState, resetViewPagination } from './modules/views/pagination.js'

// View dispatcher (lazy loading)
import { loadViewByName } from './modules/views/dispatcher.js'

// Inventory view mode & grouping (state only, no rendering)
import { initInventoryViewMode } from './modules/inventory/viewMode.js'
import { initInventoryGrouping } from './modules/inventory/grouping.js'

// Collections viewMode (state only)
import { initCollectionsViewMode } from './modules/collections/viewMode.js'

import {
  // Core
  initDatabase,
  initUser,
  getCurrentUser,
  initTime,
  // Subscriptions
  cancelSubscription,
  cancelAllSubscriptions,
  clearDataType,
  // Pagination
  updatePaginationControls,
  handlePaginationPage,
  initPaginationHandlers,
  // Filters
  filters,
  initFilterCounts,
  updateFilterCounts,
  initFilterUI,
  updateFilterUIFromState,
  initFilterListeners,
  setupAllFilterListeners,
  // Rendering utilities
  getItemStatus,
  isAssetRecord,
  formatTimeAgo,
  formatNumber,
  // Cache
  initCache,
  clearAllCache,
  // Blockchain sync
  initBlockchainSync,
  loadBlockchainData,
  forceFullSync,
  // Init modules
  initInventoryNavigation,
  setupInventoryNavigationExports,
  initAppInitializer,
  initializeApp,
  initViewDispatcher,
  loadViewData,
  setupViewDispatcherExports,
  // View modes
  initViewModesExports,
  setupViewModesExports
} from './core/index.js'

// ========== LAZY LOADING ==========
import {
  setAnalyticsDeps,
  setupAnalyticsLazy,
  setCollectionsDeps,
  setupCollectionsLazy,
  setBatchDeps,
  setupBatchLazy,
  setTitleUpdateDeps,
  setupTitleUpdateLazy,
  setViewsDeps,
  preloadLazyModules
} from './core/lazy.js'

import './main.js'

// ========== CORE INITIALIZATION ==========
const db = await initDatabase()
initUser()
initTime()
initFilterCounts(db, getCurrentUser)

let CURRENT_USER = window.CURRENT_USER
const originalUpdateCurrentUser = window.updateCurrentUser
window.updateCurrentUser = (address) => {
  originalUpdateCurrentUser(address)
  CURRENT_USER = window.CURRENT_USER
}

const viewPagination = appState.viewPagination
initFilterUI((viewName) => appState.viewPagination[viewName])
initCache(db)

// Initialize critical appState modules
initExploreViewMode()
initInventoryViewMode()
initCollectionsViewMode()
initInventoryGrouping()

appState.db = db
appState.CURRENT_USER = CURRENT_USER

// ========== DOM ELEMENTS ==========
appState.elements = {
  scrollContainer: document.querySelector('.mp-grid-container'),
  gridContainer: document.querySelector('.mp-card-grid'),
  paginationInfo: document.getElementById('paginationInfo'),
  pageNumbersContainer: document.getElementById('pageNumbers'),
  prevPageButton: document.getElementById('prevPageBtn'),
  nextPageButton: document.getElementById('nextPageBtn'),
  firstPageButton: document.getElementById('firstPageBtn'),
  lastPageButton: document.getElementById('lastPageBtn'),
  searchInput: document.getElementById('searchInput'),
  priceMin: document.getElementById('priceMin'),
  priceMax: document.getElementById('priceMax'),
  sortSelect: document.getElementById('sortSelect'),
  categoryFilter: document.getElementById('categoryFilter'),
  statusFilter: document.getElementById('statusFilter')
}
const elements = appState.elements

// ========== VIEW MODES ==========
initViewModesExports({
  saveViewMode: saveViewModeModule,
  resetPaginationState,
  resetViewPagination
})
setupViewModesExports()

// ========== PAGINATION ==========
initPaginationHandlers()

// ========== APP INITIALIZER ==========
initAppInitializer({
  loadPaginationState,
  savePaginationState,
  updatePaginationControls,
  loadBlockchainData,
  updateFilterCounts
})

// ========== LAZY MODULES - Set Dependencies ==========
// Analytics (loaded when modal opens)
setAnalyticsDeps({ db, getCurrentUser })

// Collections rendering & favorites (loaded when view opens)
setCollectionsDeps({ resetPaginationState })

// Batch mode (loaded when batch mode activated)
setBatchDeps({
  elements,
  resetPaginationState,
  getViewPagination: (name) => viewPagination[name]
})

// Inventory title update (loaded when renaming)
setTitleUpdateDeps({ db })

// Views (lazy loaded on demand)
setViewsDeps({
  db,
  updatePaginationControls,
  handlePaginationPage,
  getCurrentUser
})

// ========== FILTER LISTENERS ==========
initFilterListeners({
  resetPaginationState,
  resetInventoryPagination,
  resetViewPagination,
  loadViewByName,
  saveViewPaginationState,
  createCollectionTableRow: async (...args) => {
    const { rendering } = await import('./modules/collections/rendering.js')
    return rendering.createCollectionTableRow(...args)
  },
  favoriteItems: window.favoriteItems,
  showToast: window.showToast
})
setupAllFilterListeners()

// ========== VIEW DISPATCHER ==========
initViewDispatcher({
  resetPaginationState,
  loadPaginationState,
  resetViewPagination,
  loadViewPaginationState,
  updateFilterUIFromState,
  updateFilterCounts
})
setupViewDispatcherExports()

// ========== INVENTORY NAVIGATION ==========
initInventoryNavigation()
setupInventoryNavigationExports()

// ========== BLOCKCHAIN SYNC ==========
initBlockchainSync({ db, loadViewData })
window.loadBlockchainData = loadBlockchainData
window.forceFullSync = forceFullSync
window.clearAllCache = clearAllCache

// ========== LAZY SETUP (deferred) ==========
// Utility modules loaded after user interaction or idle time
const setupLazyModulesOnce = (() => {
  let initialized = false
  return async () => {
    if (initialized) return
    initialized = true
    await Promise.all([
      setupAnalyticsLazy(),
      setupCollectionsLazy(),
      setupBatchLazy(),
      setupTitleUpdateLazy()
    ])
  }
})()

// ========== INITIALIZE APP ==========
initializeApp(db, elements.scrollContainer)

// Load utility modules after 3 seconds of idle time (doesn't block initial render)
if ('requestIdleCallback' in window) {
  requestIdleCallback(setupLazyModulesOnce, { timeout: 10000 })
} else {
  setTimeout(setupLazyModulesOnce, 3000)
}
