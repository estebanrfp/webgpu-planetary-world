/**
 * Explore Loading Module
 * @module modules/explore/loading
 *
 * Handles loading of items in explore view with pagination.
 * Dependencies are passed via init function.
 */

import { appState } from '../../store/appState.js'
import { ITEMS_PER_PAGE } from '../../core/constants.js'
import { subscriptions, renderedItems, cancelSubscription } from '../../core/subscriptions.js'
import { filters } from '../../core/filters/state.js'
import { buildViewQuery } from '../../core/filters/query.js'
import { getExploreTableHeader } from '../../core/rendering/headers.js'
import { createItemElement, createExploreTableRow } from './rendering.js'
import { savePaginationState } from './persistence.js'

// Dependencies set via init
let db = null
let updatePaginationControlsFn = null

/**
 * Initialize explore loading with dependencies
 * @param {object} deps - Dependencies
 * @param {object} deps.db - GenosDB instance
 * @param {function} deps.updatePaginationControls - Function to update pagination UI
 */
export function initExploreLoading(deps) {
  db = deps.db
  updatePaginationControlsFn = deps.updatePaginationControls
}

/**
 * Load items with pagination (follows pagination-example.html pattern exactly)
 */
export async function loadItems({ pageToLoad, append = false, prepend = false, restoreScrollTop = 0 }) {
  const elements = appState.elements
  if (appState.isLoading) return

  // Prevent duplicate loading of same page in infinite scroll
  const isAlreadyLoaded = [...elements.gridContainer.children].some(el => parseInt(el.dataset.page) === pageToLoad)
  if ((append || prepend) && isAlreadyLoaded) return

  appState.isLoading = true
  appState.lastBatchResultCount = 0

  // Reset appState.noMoreItemsToLoad when starting new view (manual jump)
  if (!append && !prepend) {
    appState.noMoreItemsToLoad = false
    cancelSubscription('explore')
  }

  // Check cursor exists for pages > 1
  if (pageToLoad > 1) {
    const cursor = appState.pageLastItemCursors[pageToLoad - 1]
    if (!cursor) {
      if (!append && !prepend && appState.currentPage > 1 && Object.keys(appState.pageLastItemCursors).length === 0) {
        pageToLoad = 1
      } else {
        appState.isLoading = false
        if (append) appState.noMoreItemsToLoad = true
        updatePaginationControlsFn?.()
        return
      }
    }
  }

  // Query GenosDB with filters + pagination
  const queryOptions = {
    query: buildViewQuery('explore'),
    field: filters.sortField,
    order: filters.sortOrder,
    $limit: ITEMS_PER_PAGE,
    $after: pageToLoad > 1 ? appState.pageLastItemCursors[pageToLoad - 1] : null
  }

  try {
    const isTableMode = appState.exploreViewMode === 'table-expanded'
    const createItem = isTableMode ? createExploreTableRow : createItemElement

    // For append/prepend use static mode, for fresh load use realtime callback
    const mapOptions = (append || prepend) ? { ...queryOptions, realtime: false } : queryOptions

    // Debounce for realtime updates to avoid multiple re-renders
    let reloadTimeout = null
    const callback = (append || prepend) ? null : ({ action }) => {
      if ((window.getCurrentView?.() || 'explore') !== 'explore') return

      // Re-execute query on any change - GenosDB handles filtering/sorting
      if (action === 'added' || action === 'updated' || action === 'removed') {
        clearTimeout(reloadTimeout)
        reloadTimeout = setTimeout(() => {
          loadItems({ pageToLoad: appState.currentPage, append: false })
        }, 100) // Small debounce to batch rapid changes
      }
    }

    const { results, unsubscribe } = callback
      ? await db.map(mapOptions, callback)
      : await db.map(mapOptions)

    if (unsubscribe) subscriptions.explore = unsubscribe
    appState.lastBatchResultCount = results.length

    // Clear container when not appending/prepending (like pagination-example.html)
    if (!append && !prepend) {
      elements.gridContainer.className = isTableMode
        ? 'mp-table-view explore-table table-expanded'
        : 'mp-card-grid'
      elements.gridContainer.innerHTML = isTableMode ? getExploreTableHeader(filters) : ''
      renderedItems.explore.clear()
      appState.itemsCurrentlyInView.clear()
      appState.visibleItemsMap.clear()
    }

    if (results.length > 0) {
      const scrollHeightBefore = elements.scrollContainer?.scrollHeight || 0
      const scrollTopBefore = elements.scrollContainer?.scrollTop || 0

      if (prepend) {
        const fragment = document.createDocumentFragment()
        results.forEach(item => {
          if (!renderedItems.explore.has(item.id)) {
            const element = createItem(item.id, item.value, pageToLoad)
            fragment.appendChild(element)
            renderedItems.explore.add(item.id)
            appState.itemsCurrentlyInView.add(item.id)
            appState.pageVisibilityObserver?.observe(element)
          }
        })
        const header = elements.gridContainer.querySelector('.mp-table-header')
        if (header) header.after(fragment)
        else elements.gridContainer.prepend(fragment)
        // Maintain scroll position
        const scrollHeightAfter = elements.scrollContainer?.scrollHeight || 0
        if (elements.scrollContainer) {
          elements.scrollContainer.scrollTop = scrollTopBefore + (scrollHeightAfter - scrollHeightBefore)
        }
      } else {
        results.forEach(item => {
          if (!renderedItems.explore.has(item.id)) {
            const element = createItem(item.id, item.value, pageToLoad)
            elements.gridContainer.appendChild(element)
            renderedItems.explore.add(item.id)
            appState.itemsCurrentlyInView.add(item.id)
            appState.pageVisibilityObserver?.observe(element)
          }
        })
      }

      // Save cursor for next page
      appState.pageLastItemCursors[pageToLoad] = results[results.length - 1].id
      if (!append && !prepend) appState.currentPage = pageToLoad
      appState.maxKnownPage = Math.max(appState.maxKnownPage, pageToLoad)

      if (results.length < ITEMS_PER_PAGE) {
        if (append) appState.noMoreItemsToLoad = true
        appState.maxKnownPage = pageToLoad
      }
    } else {
      if (append) appState.noMoreItemsToLoad = true
      if (!append && !prepend) {
        elements.gridContainer.innerHTML += '<div class="mp-empty-state">No items found in the marketplace.</div>'
        appState.maxKnownPage = Math.max(1, pageToLoad - 1)
        if (pageToLoad > appState.maxKnownPage) appState.currentPage = appState.maxKnownPage
      }
    }

    savePaginationState()
  } catch (error) {
    appState.lastBatchResultCount = 0
    if (append) appState.noMoreItemsToLoad = true
  } finally {
    appState.isLoading = false
    updatePaginationControlsFn?.()
    if (restoreScrollTop > 0 && elements.scrollContainer) {
      elements.scrollContainer.scrollTop = restoreScrollTop
    }
  }
}
