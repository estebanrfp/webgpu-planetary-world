/**
 * View Pagination Persistence
 * @module modules/views/pagination
 *
 * EXACT COPY of app-core.js lines 227-297
 * Only change: viewPagination accessed via appState object
 *
 * ORIGINAL:
 *   viewPagination[viewName], VIEW_PAGINATION_KEY
 *
 * MIGRATED:
 *   appState.viewPagination[viewName], VIEW_PAGINATION_KEY (imported)
 */

import { appState } from '../../store/appState.js'
import { VIEW_PAGINATION_KEY } from '../../core/constants.js'

/**
 * Save pagination state for a specific view to localStorage
 * EXACT COPY of app-core.js lines 227-247
 * @param {string} viewName - View name (collections, inventory, offers, activity)
 */
export function saveViewPaginationState(viewName) {
  const state = appState.viewPagination[viewName]       // was: viewPagination[viewName]
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
 * EXACT COPY of app-core.js lines 253-278
 * @param {string} viewName - View name
 */
export function loadViewPaginationState(viewName) {
  const state = appState.viewPagination[viewName]       // was: viewPagination[viewName]
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
    // Silently fail on load error
  }
}

/**
 * Clear pagination state for a specific view from localStorage
 * EXACT COPY of app-core.js lines 284-290
 * @param {string} viewName - View name
 */
export function clearViewPaginationState(viewName) {
  try {
    const saved = JSON.parse(localStorage.getItem(VIEW_PAGINATION_KEY) || '{}')
    delete saved[viewName]
    localStorage.setItem(VIEW_PAGINATION_KEY, JSON.stringify(saved))
  } catch (e) { /* ignore */ }
}

/**
 * Clear all view pagination states from localStorage
 * EXACT COPY of app-core.js lines 295-297
 */
export function clearAllViewPaginationStates() {
  localStorage.removeItem(VIEW_PAGINATION_KEY)
}

/**
 * Reset pagination for a specific view
 * EXACT COPY of app-core.js lines 210-221
 * @param {string} viewName - View name
 */
export function resetViewPagination(viewName) {
  const state = appState.viewPagination[viewName]       // was: viewPagination[viewName]
  if (state) {
    state.currentPage = 1
    state.cursors = {}
    state.noMoreItems = false
    state.maxKnownPage = 1
    state.lastCount = 0
    // Clear from localStorage
    clearViewPaginationState(viewName)
  }
}
