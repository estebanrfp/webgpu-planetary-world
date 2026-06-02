/**
 * Core modules index - re-exports for app-core.js
 * @module core/index
 *
 * This file provides a single entry point for all core modules.
 * Import order matters - respects dependencies.
 */

// Phase 1: Constants (no dependencies)
export * from './constants.js'

// Phase 1: Database (depends on constants)
export { initDatabase, getDatabase } from './database.js'

// Phase 1: User (no dependencies)
export { initUser, updateCurrentUser, getCurrentUser } from './user.js'

// Phase 2: Time utilities (no dependencies)
export { initTime, formatTimeRemaining, startAuctionCountdown, stopAuctionCountdown } from './time.js'

// Phase 3: Subscriptions (depends on database)
export { subscriptions, renderedItems, cancelSubscription, cancelAllSubscriptions, clearDataType } from './subscriptions.js'

// Phase 4: Pagination
export * from './pagination/index.js'

// Phase 5: Filters
export {
  filters,
  DEFAULT_FILTERS,
  resetFilters,
  buildFilterQuery,
  buildViewQuery,
  initFilterCounts,
  updateFilterCounts,
  updateExploreCounts,
  updateInventoryCounts,
  updateOffersCounts,
  initFilterUI,
  updateFilterUIFromState,
  // Filter listeners
  initFilterListeners,
  setupAllFilterListeners
} from './filters/index.js'

// Phase 6: Rendering utilities
export {
  SORT_ICON_NONE,
  SORT_ICON_ASC,
  SORT_ICON_DESC,
  STATUS_BADGES,
  getItemStatus,
  getStatusBadge,
  getButtonConfig,
  isAssetRecord,
  getPeriodMs,
  parsePrice,
  formatTimeAgo,
  formatNumber,
  getGroupKey,
  groupInventoryItems,
  isHash,
  generateSparkline,
  // Table headers
  createSortIconFn,
  createSortClassFn,
  getExploreTableHeader,
  getInventoryTableHeader,
  getOffersTableHeader,
  getCollectionsTableHeader
} from './rendering/index.js'

// Phase 7: Analytics
export {
  initAnalyticsActivity,
  getActivityMode,
  loadAnalyticsActivity,
  switchActivityMode,
  renderAnalyticsActivity,
  initAnalyticsStats,
  getStatsPeriod,
  setStatsPeriod,
  calculateStats,
  loadAnalyticsStats,
  loadAnalyticsTrending,
  loadAnalyticsCategories,
  initAnalyticsChart,
  calculateChartData,
  renderModalPriceChart,
  // Modal observer
  initAnalyticsModalObserver,
  setupAnalyticsModalObserver,
  selectStatsPeriod,
  setupAnalyticsModalExports
} from './analytics/index.js'

// Phase 8: Cache management
export { initCache, clearAllCache } from './cache.js'

// Phase 9: Blockchain sync
export {
  initBlockchainSync,
  loadBlockchainData,
  forceFullSync
} from './blockchain/index.js'

// Phase 10: Init/window exports
export {
  initInventoryNavigation,
  setupInventoryNavigationExports,
  filterInventoryByGroup,
  getInventoryGroupFilter,
  expandAsset,
  clearExpandedAsset,
  getExpandedAsset,
  clearInventoryGroupFilter,
  // App initializer
  initAppInitializer,
  initializeApp,
  // View dispatcher
  initViewDispatcher,
  loadViewData,
  refreshCurrentView,
  setupViewDispatcherExports
} from './init/index.js'

// Phase 12: View modes exports
export {
  initViewModesExports,
  setExploreViewMode,
  getExploreViewMode,
  setInventoryViewMode,
  getInventoryViewMode,
  setCollectionsViewMode,
  getCollectionsViewMode,
  setupViewModesExports
} from './viewModes/exports.js'
