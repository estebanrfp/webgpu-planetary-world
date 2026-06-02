/**
 * Modules Index
 * @module modules
 *
 * Re-exports all modular functionality using appState pattern.
 * These are EXACT COPIES of app-core.js functions with only
 * the access pattern changed (variable → appState.variable).
 */

// Explore pagination, view mode, reset, rendering, and loading
export {
  savePaginationState,
  loadPaginationState,
  saveViewMode,
  loadViewMode,
  setExploreViewMode,
  getExploreViewMode,
  initExploreViewMode,
  resetPaginationState,
  resetInventoryPagination,
  createItemElement,
  createExploreTableRow,
  // Explore loading
  initExploreLoading,
  loadItems
} from './explore/index.js'

// Views pagination and loaders
export {
  saveViewPaginationState,
  loadViewPaginationState,
  clearViewPaginationState,
  clearAllViewPaginationStates,
  resetViewPagination,
  // View loaders
  initViewLoaders,
  loadViewWithPagination,
  updateViewPaginationControls,
  loadCollections,
  loadInventory,
  loadInventoryGrouped,
  loadOffers,
  loadActivity,
  loadViewByName,
  // View subscriptions
  initViewSubscriptions,
  applyInventoryFilters,
  subscribeToInventory,
  applyOffersFilters,
  subscribeToOffers
} from './views/index.js'

// Inventory view mode, grouping, and rendering
export {
  setInventoryViewMode,
  getInventoryViewMode,
  initInventoryViewMode,
  filterInventoryByGroup,
  getInventoryGroupFilter,
  expandAsset,
  clearExpandedAsset,
  getExpandedAsset,
  clearInventoryGroupFilter,
  getInventoryGroupsCache,
  isGroupingDisabled,
  getExpandedGroupItems,
  initInventoryGrouping,
  // Inventory rendering
  initInventoryRendering,
  createExpandedCard,
  createExpandedTableRow,
  createInventoryGroup,
  createInventoryGroupRow,
  createInventoryCard,
  createInventoryTableRow,
  renderExpandedAsset,
  // Inventory title update
  initInventoryTitleUpdate,
  updateInventoryItemTitle,
  setupInventoryTitleExports
} from './inventory/index.js'

// Collections view mode and rendering
export {
  setCollectionsViewMode,
  getCollectionsViewMode,
  initCollectionsViewMode,
  initCollectionsRendering,
  createCollectionCard,
  createCollectionTableRow,
  // Collection favorites
  favoriteCollections,
  isCollectionFavorite,
  toggleCollectionFavorite,
  getFavoriteCollections,
  setupCollectionFavoritesExports
} from './collections/index.js'

// Batch mode operations
export {
  applyBatchBuyFilter,
  removeBatchBuyFilter,
  applyInventorySelectFilter,
  removeInventorySelectFilter,
  initBatchMode,
  // Batch exports
  initBatchExports,
  setupBatchExports
} from './batch/index.js'

// Offers and activity rendering
export {
  initOffersRendering,
  createOfferTableRow,
  createActivityItem
} from './offers/index.js'

// Stats view rendering
export {
  initStatsRendering,
  loadStats,
  updateStatsForPeriod,
  renderPriceChart
} from './stats/index.js'
