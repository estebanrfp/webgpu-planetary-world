/**
 * Filter UI module
 * @module core/filters/ui
 *
 * EXTRACTED FROM: app-core.js (lines 278-301)
 * Functions to update filter UI elements
 */

// Module state - set via initFilterUI
let getViewPaginationState = null

/**
 * Initialize filter UI module with dependencies
 * @param {function} getStateFn - Function to get viewPagination state for a view
 */
export function initFilterUI(getStateFn) {
  getViewPaginationState = getStateFn
}

/**
 * Update filter UI to reflect current pagination state
 * @param {string} viewName - View name
 */
export function updateFilterUIFromState(viewName) {
  const state = getViewPaginationState?.(viewName)
  if (!state) return

  if (viewName === 'offers') {
    // Update direction pills
    document.querySelectorAll('[data-offer-direction]').forEach(p => {
      p.classList.toggle('active', p.dataset.offerDirection === state.filterDirection)
    })
    // Update status pills
    document.querySelectorAll('[data-offer-status]').forEach(p => {
      p.classList.toggle('active', p.dataset.offerStatus === state.filterStatus)
    })
  } else if (viewName === 'activity') {
    // Update activity type options
    document.querySelectorAll('[data-activity-type]').forEach(o => {
      o.classList.toggle('selected', o.dataset.activityType === state.filterType)
    })
  }
}
