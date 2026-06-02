/**
 * Pagination module index
 * @module core/pagination/index
 */

// State and constants
// Note: LOCAL_STORAGE_KEY, VIEW_PAGINATION_KEY exported from core/constants.js
export {
  VISIBLE_PAGE_NUMBERS,
  DB_ORDER_FIELD,
  DB_ORDER_DIRECTION,
  VIEW_ITEMS_PER_PAGE,
  currentPage,
  maxKnownPage,
  isLoading,
  noMoreItemsToLoad,
  pageLastItemCursors,
  itemsCurrentlyInView,
  lastBatchResultCount,
  pageVisibilityObserver,
  visibleItemsMap,
  viewPagination,
  setCurrentPage,
  setMaxKnownPage,
  setIsLoading,
  setNoMoreItemsToLoad,
  setPageLastItemCursors,
  setLastBatchResultCount,
  setPageVisibilityObserver,
  clearItemsCurrentlyInView,
  clearVisibleItemsMap,
  addToItemsCurrentlyInView
} from './state.js'

// Persistence (localStorage)
export {
  savePaginationState,
  loadPaginationState,
  resetPaginationState,
  resetViewPagination,
  saveViewPaginationState,
  loadViewPaginationState,
  clearViewPaginationState
} from './persistence.js'

// Handlers (UI controls and scroll)
export {
  updatePaginationControls,
  handlePaginationFirst,
  handlePaginationPrev,
  handlePaginationNext,
  handlePaginationLast,
  handlePaginationPage,
  handleScroll,
  initPaginationHandlers
} from './handlers.js'
