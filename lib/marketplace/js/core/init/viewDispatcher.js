/**
 * View Dispatcher Module
 * @module core/init/viewDispatcher
 *
 * Handles view switching and lazy loading of view modules.
 */

import { appState } from '../../store/appState.js'
import { stopAuctionCountdown, startAuctionCountdown } from '../time.js'
import { cancelSubscription } from '../subscriptions.js'
import {
  getExploreView,
  getInventoryView,
  getCollectionsView,
  getOffersView,
  getActivityView
} from '../lazy.js'

// Dependencies injected via init
let resetPaginationState = null
let loadPaginationState = null
let resetViewPagination = null
let loadViewPaginationState = null
let updateFilterUIFromState = null
let updateFilterCounts = null

/**
 * Initialize view dispatcher with dependencies
 * @param {Object} deps - Dependencies
 */
export function initViewDispatcher(deps) {
  resetPaginationState = deps.resetPaginationState
  loadPaginationState = deps.loadPaginationState
  resetViewPagination = deps.resetViewPagination
  loadViewPaginationState = deps.loadViewPaginationState
  updateFilterUIFromState = deps.updateFilterUIFromState
  updateFilterCounts = deps.updateFilterCounts
}

/**
 * Show loading spinner in grid container
 * @param {string} message - Loading message
 */
function showLoadingSpinner(message = 'Loading...') {
  const grid = appState.elements?.gridContainer
  if (grid) {
    grid.innerHTML = `<div class="mp-spinner-container" style="grid-column:1/-1;">
      <div class="mp-spinner"></div>
      <div class="mp-spinner-text">${message}</div>
    </div>`
  }
}

/**
 * Load view data dispatcher with lazy loading
 * @param {string} view - View name ('explore', 'collections', 'inventory', 'offers', 'activity', 'land')
 * @param {boolean} forceReset - Force reset pagination state
 */
export async function loadViewData(view, forceReset = false) {
  const viewPagination = appState.viewPagination

  // Stop countdown when switching views
  stopAuctionCountdown()

  // Cancel subscriptions from other views when switching
  const otherViews = ['explore', 'inventory', 'offers', 'activity', 'land'].filter(v => v !== view)
  otherViews.forEach(v => cancelSubscription(v))

  // Show spinner while loading view module
  showLoadingSpinner(`Loading ${view}...`)

  switch (view) {
    case 'explore': {
      if (forceReset) resetPaginationState?.()
      const savedScrollTop = loadPaginationState?.()
      // Lazy load explore view
      const { loading } = await getExploreView()
      await loading.loadItems({ pageToLoad: appState.currentPage, append: false, restoreScrollTop: savedScrollTop })
      updateFilterCounts?.('explore')
      break
    }
    case 'collections': {
      if (forceReset) resetViewPagination?.('collections')
      else loadViewPaginationState?.('collections')
      // Lazy load collections view
      const { loaders } = await getCollectionsView()
      await loaders.loadCollections({ pageToLoad: viewPagination.collections.currentPage })
      break
    }
    case 'inventory': {
      if (forceReset) resetViewPagination?.('inventory')
      else loadViewPaginationState?.('inventory')
      // Lazy load inventory view
      const { subscriptions } = await getInventoryView()
      await subscriptions.subscribeToInventory({ pageToLoad: viewPagination.inventory.currentPage })
      updateFilterCounts?.('inventory')
      break
    }
    case 'offers': {
      if (forceReset) resetViewPagination?.('offers')
      else loadViewPaginationState?.('offers')
      updateFilterUIFromState?.('offers')
      // Lazy load offers view
      const { subscriptions } = await getOffersView()
      await subscriptions.subscribeToOffers({ pageToLoad: viewPagination.offers.currentPage })
      updateFilterCounts?.('offers')
      break
    }
    case 'activity': {
      if (forceReset) resetViewPagination?.('activity')
      else loadViewPaginationState?.('activity')
      updateFilterUIFromState?.('activity')
      // Lazy load activity view
      const { loaders } = await getActivityView()
      await loaders.loadActivity({ pageToLoad: viewPagination.activity.currentPage })
      break
    }
    case 'land': {
      await window.parcelDataManager?.loadAndSubscribe()
      break
    }
  }

  // Start countdown for views that may have auctions
  if (view === 'explore' || view === 'inventory') {
    setTimeout(() => startAuctionCountdown(), 100)
  }
}

/**
 * Refresh current view - used after blockchain transactions
 * Reloads the active view to reflect data changes
 */
export async function refreshCurrentView() {
  const currentView = window.getCurrentView?.() || 'explore'
  await loadViewData(currentView, true)
  updateFilterCounts?.(currentView)
}

/**
 * Setup window exports for view dispatcher
 */
export function setupViewDispatcherExports() {
  window.loadViewData = loadViewData
  window.refreshCurrentView = refreshCurrentView
}
