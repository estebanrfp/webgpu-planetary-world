/**
 * Explore Pagination Persistence
 * @module modules/explore/persistence
 *
 * EXACT COPY of app-core.js lines 163-191
 * Only change: variables accessed via appState object
 *
 * ORIGINAL:
 *   currentPage, maxKnownPage, pageLastItemCursors, elements
 *
 * MIGRATED:
 *   appState.currentPage, appState.maxKnownPage, appState.pageLastItemCursors, appState.elements
 */

import { appState } from '../../store/appState.js'
import { LOCAL_STORAGE_KEY } from '../../core/constants.js'

/**
 * Save explore pagination state to localStorage
 * EXACT COPY of app-core.js line 163-175
 */
export function savePaginationState() {
  const state = {
    currentPage: appState.currentPage,                    // was: currentPage
    maxKnownPage: appState.maxKnownPage,                  // was: maxKnownPage
    pageLastItemCursors: appState.pageLastItemCursors,    // was: pageLastItemCursors
    scrollTop: appState.elements?.scrollContainer?.scrollTop || 0  // was: elements.scrollContainer?.scrollTop || 0
  }
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state))
  } catch (e) {
    // Silently fail on save error
  }
}

/**
 * Load explore pagination state from localStorage
 * EXACT COPY of app-core.js line 177-191
 * @returns {number} Saved scroll position
 */
export function loadPaginationState() {
  try {
    const savedState = localStorage.getItem(LOCAL_STORAGE_KEY)
    if (savedState) {
      const state = JSON.parse(savedState)
      appState.currentPage = state.currentPage || 1           // was: currentPage = state.currentPage || 1
      appState.maxKnownPage = state.maxKnownPage || 1         // was: maxKnownPage = state.maxKnownPage || 1
      appState.pageLastItemCursors = state.pageLastItemCursors || {}  // was: pageLastItemCursors = state.pageLastItemCursors || {}
      return state.scrollTop
    }
  } catch (e) {
    localStorage.removeItem(LOCAL_STORAGE_KEY)
  }
  return 0
}
