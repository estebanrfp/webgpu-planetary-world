/**
 * Lazy Loading Module
 * @module core/lazy
 *
 * Handles deferred loading of non-critical modules to improve initial page load.
 * Modules are loaded on-demand when first accessed.
 */

/** Cache for loaded modules */
const loadedModules = new Map()

/** Loading promises to prevent duplicate loads */
const loadingPromises = new Map()

/**
 * Lazy load a module with caching
 * @param {string} name - Module identifier
 * @param {function} importFn - Dynamic import function
 * @returns {Promise<object>} Loaded module
 */
async function lazyLoad(name, importFn) {
  // Return cached module if already loaded
  if (loadedModules.has(name)) {
    return loadedModules.get(name)
  }

  // Return existing promise if already loading
  if (loadingPromises.has(name)) {
    return loadingPromises.get(name)
  }

  // Start loading
  const promise = importFn().then(module => {
    loadedModules.set(name, module)
    loadingPromises.delete(name)
    return module
  })

  loadingPromises.set(name, promise)
  return promise
}

// ========== ANALYTICS (lazy) ==========

let analyticsInitialized = false
let analyticsDeps = null

/**
 * Store analytics dependencies for deferred initialization
 */
export function setAnalyticsDeps(deps) {
  analyticsDeps = deps
}

/**
 * Lazy load and initialize analytics modules
 */
export async function getAnalytics() {
  const [activity, stats, chart, modalObserver] = await Promise.all([
    lazyLoad('analytics/activity', () => import('./analytics/activity.js')),
    lazyLoad('analytics/stats', () => import('./analytics/stats.js')),
    lazyLoad('analytics/chart', () => import('./analytics/chart.js')),
    lazyLoad('analytics/modalObserver', () => import('./analytics/modalObserver.js'))
  ])

  // Initialize only once
  if (!analyticsInitialized && analyticsDeps) {
    activity.initAnalyticsActivity(analyticsDeps.db, analyticsDeps.getCurrentUser)
    stats.initAnalyticsStats(analyticsDeps.db)
    chart.initAnalyticsChart(analyticsDeps.db)
    analyticsInitialized = true
  }

  return { activity, stats, chart, modalObserver }
}

/**
 * Setup analytics modal observer (lazy)
 */
export async function setupAnalyticsLazy() {
  const { activity, stats, chart, modalObserver } = await getAnalytics()

  // Initialize modal observer
  modalObserver.initAnalyticsModalObserver({
    loadAnalyticsActivity: activity.loadAnalyticsActivity,
    loadAnalyticsStats: stats.loadAnalyticsStats,
    loadAnalyticsTrending: stats.loadAnalyticsTrending,
    loadAnalyticsCategories: stats.loadAnalyticsCategories,
    renderModalPriceChart: chart.renderModalPriceChart
  })
  modalObserver.setupAnalyticsModalObserver()
  modalObserver.setupAnalyticsModalExports()

  // Expose to window
  window.switchActivityMode = activity.switchActivityMode
  window.loadAnalyticsActivity = activity.loadAnalyticsActivity
  window.loadAnalyticsStats = stats.loadAnalyticsStats
  window.loadAnalyticsTrending = stats.loadAnalyticsTrending
  window.loadAnalyticsCategories = stats.loadAnalyticsCategories
  window.renderModalPriceChart = chart.renderModalPriceChart
}

// ========== STATS VIEW (lazy) ==========

/**
 * Lazy load stats rendering module
 */
export async function getStatsRendering() {
  return lazyLoad('stats/rendering', () => import('../modules/stats/rendering.js'))
}

// ========== COLLECTIONS (lazy) ==========

let collectionsInitialized = false
let collectionsDeps = null

export function setCollectionsDeps(deps) {
  collectionsDeps = deps
}

export async function getCollections() {
  const [rendering, favorites] = await Promise.all([
    lazyLoad('collections/rendering', () => import('../modules/collections/rendering.js')),
    lazyLoad('collections/favorites', () => import('../modules/collections/favorites.js'))
  ])

  if (!collectionsInitialized && collectionsDeps) {
    rendering.initCollectionsRendering(collectionsDeps)
    collectionsInitialized = true
  }

  return { rendering, favorites }
}

export async function setupCollectionsLazy() {
  const { favorites } = await getCollections()
  favorites.setupCollectionFavoritesExports()
}

// ========== BATCH MODE (lazy) ==========

let batchInitialized = false
let batchDeps = null

export function setBatchDeps(deps) {
  batchDeps = deps
}

export async function getBatch() {
  const [batchIndex, batchExports] = await Promise.all([
    lazyLoad('batch/index', () => import('../modules/batch/index.js')),
    lazyLoad('batch/exports', () => import('../modules/batch/exports.js'))
  ])

  if (!batchInitialized && batchDeps) {
    batchIndex.initBatchMode()
    batchExports.initBatchExports(batchDeps)
    batchInitialized = true
  }

  return { batchIndex, batchExports }
}

export async function setupBatchLazy() {
  const { batchExports } = await getBatch()
  batchExports.setupBatchExports()
}

// ========== INVENTORY TITLE UPDATE (lazy) ==========

let titleUpdateInitialized = false
let titleUpdateDeps = null

export function setTitleUpdateDeps(deps) {
  titleUpdateDeps = deps
}

export async function getTitleUpdate() {
  const module = await lazyLoad('inventory/titleUpdate', () => import('../modules/inventory/titleUpdate.js'))

  if (!titleUpdateInitialized && titleUpdateDeps) {
    module.initInventoryTitleUpdate(titleUpdateDeps)
    titleUpdateInitialized = true
  }

  return module
}

export async function setupTitleUpdateLazy() {
  const module = await getTitleUpdate()
  module.setupInventoryTitleExports()
}

// ========== VIEWS (lazy) ==========

let viewsDeps = null
let viewsInitialized = {
  explore: false,
  inventory: false,
  collections: false,
  offers: false,
  activity: false
}

export function setViewsDeps(deps) {
  viewsDeps = deps
}

/**
 * Lazy load Explore view module
 */
export async function getExploreView() {
  const [loading, rendering] = await Promise.all([
    lazyLoad('explore/loading', () => import('../modules/explore/loading.js')),
    lazyLoad('explore/rendering', () => import('../modules/explore/rendering.js'))
  ])

  if (!viewsInitialized.explore && viewsDeps) {
    loading.initExploreLoading({
      db: viewsDeps.db,
      updatePaginationControls: viewsDeps.updatePaginationControls
    })
    viewsInitialized.explore = true
  }

  return { loading, rendering }
}

/**
 * Lazy load Inventory view module
 */
export async function getInventoryView() {
  const [subscriptions, rendering] = await Promise.all([
    lazyLoad('views/subscriptions', () => import('../modules/views/subscriptions.js')),
    lazyLoad('inventory/rendering', () => import('../modules/inventory/rendering.js'))
  ])

  if (!viewsInitialized.inventory && viewsDeps) {
    subscriptions.initViewSubscriptions({ db: viewsDeps.db })
    rendering.initInventoryRendering({ db: viewsDeps.db })
    viewsInitialized.inventory = true
  }

  return { subscriptions, rendering }
}

/**
 * Lazy load Collections view module
 */
export async function getCollectionsView() {
  const [loaders, rendering] = await Promise.all([
    lazyLoad('views/loaders', () => import('../modules/views/loaders.js')),
    lazyLoad('collections/rendering', () => import('../modules/collections/rendering.js'))
  ])

  if (!viewsInitialized.collections && viewsDeps) {
    loaders.initViewLoaders({
      db: viewsDeps.db,
      handlePaginationPage: viewsDeps.handlePaginationPage
    })
    viewsInitialized.collections = true
  }

  return { loaders, rendering }
}

/**
 * Lazy load Offers view module
 */
export async function getOffersView() {
  const [subscriptions, rendering] = await Promise.all([
    lazyLoad('views/subscriptions', () => import('../modules/views/subscriptions.js')),
    lazyLoad('offers/rendering', () => import('../modules/offers/rendering.js'))
  ])

  if (!viewsInitialized.offers && viewsDeps) {
    subscriptions.initViewSubscriptions({ db: viewsDeps.db })
    rendering.initOffersRendering({ getCurrentUser: viewsDeps.getCurrentUser })
    viewsInitialized.offers = true
  }

  return { subscriptions, rendering }
}

/**
 * Lazy load Activity view module
 */
export async function getActivityView() {
  const loaders = await lazyLoad('views/loaders', () => import('../modules/views/loaders.js'))

  if (!viewsInitialized.activity && viewsDeps) {
    loaders.initViewLoaders({
      db: viewsDeps.db,
      handlePaginationPage: viewsDeps.handlePaginationPage
    })
    viewsInitialized.activity = true
  }

  return { loaders }
}

// ========== PRELOAD HELPERS ==========

/**
 * Preload all lazy modules in background after initial render
 * Call this after the main view is loaded
 */
export function preloadLazyModules() {
  // Use requestIdleCallback for non-blocking preload
  const preload = () => {
    getAnalytics()
    getStatsRendering()
    getCollections()
    getBatch()
    getTitleUpdate()
    // Preload views in idle time
    getExploreView()
    getInventoryView()
    getCollectionsView()
    getOffersView()
    getActivityView()
  }

  if ('requestIdleCallback' in window) {
    requestIdleCallback(preload, { timeout: 5000 })
  } else {
    setTimeout(preload, 2000)
  }
}

/**
 * Check if a module is already loaded
 */
export function isModuleLoaded(name) {
  return loadedModules.has(name)
}
