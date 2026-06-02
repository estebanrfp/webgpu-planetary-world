/**
 * Pagination persistence (localStorage)
 * @module core/pagination/persistence
 *
 * EXTRACTED FROM: app-core.js lines 126-320
 * DO NOT MODIFY - exact copy of original logic
 */

import {
  LOCAL_STORAGE_KEY,
  VIEW_PAGINATION_KEY,
  currentPage,
  maxKnownPage,
  pageLastItemCursors,
  viewPagination,
  setCurrentPage,
  setMaxKnownPage,
  setPageLastItemCursors,
  setNoMoreItemsToLoad,
  clearItemsCurrentlyInView,
  clearVisibleItemsMap
} from './state.js'

/**
 * Save explore pagination state to localStorage
 * @param {object} elements - DOM elements (needs scrollContainer)
 */
export function savePaginationState(elements) {
  const state = {
    currentPage,
    maxKnownPage,
    pageLastItemCursors,
    scrollTop: elements?.scrollContainer?.scrollTop || 0
  }
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state))
  } catch (e) {
    // Silently fail on save error
  }
}

/**
 * Load explore pagination state from localStorage
 * @returns {number} Saved scroll position
 */
export function loadPaginationState() {
  try {
    const savedState = localStorage.getItem(LOCAL_STORAGE_KEY)
    if (savedState) {
      const state = JSON.parse(savedState)
      setCurrentPage(state.currentPage || 1)
      setMaxKnownPage(state.maxKnownPage || 1)
      setPageLastItemCursors(state.pageLastItemCursors || {})
      return state.scrollTop
    }
  } catch (e) {
    localStorage.removeItem(LOCAL_STORAGE_KEY)
  }
  return 0
}

/**
 * Reset explore pagination state
 */
export function resetPaginationState() {
  setPageLastItemCursors({})
  setCurrentPage(1)
  setMaxKnownPage(1)
  setNoMoreItemsToLoad(false)
  clearItemsCurrentlyInView()
  clearVisibleItemsMap()
  localStorage.removeItem(LOCAL_STORAGE_KEY)
}

/**
 * Reset pagination for a specific view
 * @param {string} viewName - View name (collections, inventory, offers, activity)
 */
export function resetViewPagination(viewName) {
  const state = viewPagination[viewName]
  if (state) {
    state.currentPage = 1
    state.cursors = {}
    state.noMoreItems = false
    state.maxKnownPage = 1
    state.lastCount = 0
    clearViewPaginationState(viewName)
  }
}

/**
 * Save pagination state for a specific view to localStorage
 * @param {string} viewName - View name (collections, inventory, offers, activity)
 */
export function saveViewPaginationState(viewName) {
  const state = viewPagination[viewName]
  if (!state) return
  try {
    const saved = JSON.parse(localStorage.getItem(VIEW_PAGINATION_KEY) || '{}')
    saved[viewName] = {
      currentPage: state.currentPage,
      maxKnownPage: state.maxKnownPage,
      cursors: state.cursors,
      noMoreItems: state.noMoreItems,
      sortField: state.sortField,
      sortOrder: state.sortOrder,
      // View-specific filters
      ...(viewName === 'offers' && { filterDirection: state.filterDirection, filterStatus: state.filterStatus }),
      ...(viewName === 'activity' && { filterType: state.filterType })
    }
    localStorage.setItem(VIEW_PAGINATION_KEY, JSON.stringify(saved))
  } catch (e) {
    // Silently fail on save error
  }
}

/**
 * Load pagination state for a specific view from localStorage
 * @param {string} viewName - View name
 */
export function loadViewPaginationState(viewName) {
  const state = viewPagination[viewName]
  if (!state) return
  try {
    const saved = JSON.parse(localStorage.getItem(VIEW_PAGINATION_KEY) || '{}')
    const viewState = saved[viewName]
    if (viewState) {
      state.currentPage = viewState.currentPage || 1
      state.maxKnownPage = viewState.maxKnownPage || 1
      state.cursors = viewState.cursors || {}
      state.noMoreItems = viewState.noMoreItems || false
      state.sortField = viewState.sortField || state.sortField
      state.sortOrder = viewState.sortOrder || state.sortOrder
      // View-specific filters
      if (viewName === 'offers') {
        state.filterDirection = viewState.filterDirection || 'all'
        state.filterStatus = viewState.filterStatus || 'pending'
      }
      if (viewName === 'activity') {
        state.filterType = viewState.filterType || 'all'
      }
    }
  } catch (e) {
    clearViewPaginationState(viewName)
  }
}

/**
 * Clear pagination state for a specific view from localStorage
 * @param {string} viewName - View name
 */
export function clearViewPaginationState(viewName) {
  try {
    const saved = JSON.parse(localStorage.getItem(VIEW_PAGINATION_KEY) || '{}')
    delete saved[viewName]
    localStorage.setItem(VIEW_PAGINATION_KEY, JSON.stringify(saved))
  } catch (e) {
    // Silently fail
  }
}
