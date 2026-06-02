/**
 * View Subscriptions Module
 * @module modules/views/subscriptions
 *
 * Handles reactive subscriptions to GenosDB for inventory and offers views.
 * Uses dynamic imports to avoid loading all renderers at once.
 */

import { appState } from '../../store/appState.js'
import { VIEW_ITEMS_PER_PAGE } from '../../core/pagination/state.js'
import { subscriptions, renderedItems, cancelSubscription } from '../../core/subscriptions.js'
import { buildViewQuery } from '../../core/filters/query.js'
import { getGroupKey, groupInventoryItems } from '../../core/rendering/utils.js'
import { getInventoryTableHeader, getOffersTableHeader } from '../../core/rendering/headers.js'
import { saveViewPaginationState } from './pagination.js'

// Dependencies set via init
let db = null

// Cached renderers (lazy loaded)
let inventoryRenderer = null
let offersRenderer = null
let loadersModule = null

/**
 * Initialize view subscriptions with dependencies
 * @param {object} deps - Dependencies
 * @param {object} deps.db - GenosDB instance
 */
export function initViewSubscriptions(deps) {
  db = deps.db
}

/**
 * Lazy load inventory renderer
 */
async function getInventoryRenderer() {
  if (!inventoryRenderer) {
    inventoryRenderer = await import('../inventory/rendering.js')
  }
  return inventoryRenderer
}

/**
 * Lazy load offers renderer
 */
async function getOffersRenderer() {
  if (!offersRenderer) {
    offersRenderer = await import('../offers/rendering.js')
  }
  return offersRenderer
}

/**
 * Lazy load loaders module (for updateViewPaginationControls)
 */
async function getLoaders() {
  if (!loadersModule) {
    loadersModule = await import('./loaders.js')
  }
  return loadersModule
}

/**
 * Apply filters and re-render inventory grid
 * Uses GenosDB cursor-based pagination with filters
 */
export async function applyInventoryFilters() {
  const activeView = window.getCurrentView?.() || 'explore'
  if (activeView !== 'inventory') return

  // Lazy load renderers
  const {
    createInventoryCard,
    createInventoryTableRow,
    createInventoryGroup,
    createInventoryGroupRow
  } = await getInventoryRenderer()
  const { updateViewPaginationControls } = await getLoaders()

  const viewPagination = appState.viewPagination
  const elements = appState.elements
  const state = viewPagination.inventory
  const isTableMode = appState.inventoryViewMode === 'table-expanded'
  const createFn = isTableMode ? createInventoryTableRow : createInventoryCard

  // Build query with GenosDB filters + pagination
  const queryOptions = {
    query: buildViewQuery('inventory'),
    field: state.sortField,
    order: state.sortOrder,
    $limit: VIEW_ITEMS_PER_PAGE,
    $after: state.currentPage > 1 ? state.cursors[state.currentPage - 1] : null
  }

  cancelSubscription('inventory')

  // Debounce for realtime updates
  let reloadTimeout = null
  const { results, unsubscribe } = await db.map(queryOptions, ({ action }) => {
    if ((window.getCurrentView?.() || 'explore') !== 'inventory') return

    // Re-execute query on any change - GenosDB handles filtering/sorting
    if (action === 'added' || action === 'updated' || action === 'removed') {
      clearTimeout(reloadTimeout)
      reloadTimeout = setTimeout(() => {
        subscribeToInventory({ pageToLoad: state.currentPage })
      }, 100)
    }
  })

  subscriptions.inventory = unsubscribe
  state.lastCount = results.length

  // Setup grid container
  const containerClass = isTableMode ? 'mp-table-view inventory-table' : 'mp-card-grid'
  elements.gridContainer.className = containerClass
  elements.gridContainer.innerHTML = isTableMode ? getInventoryTableHeader(viewPagination.inventory) : ''

  // Clear tracking
  renderedItems.inventory.clear()

  // Render items
  const groupFilter = window.getInventoryGroupFilter?.()

  if (results.length > 0) {
    if (groupFilter) {
      // Filtered by group (Level 1): render items, but check if any need further expansion
      results.forEach(item => {
        const supply = item.value.supply || 1
        if (supply > 1) {
          // Item with supply > 1 needs to be expandable to Level 2
          // Create a pseudo-group with just this item
          const pseudoGroupId = `record::${item.id}`
          const itemsArray = [item]
          appState.inventoryGroupsCache.set(pseudoGroupId, [{ id: item.id, ...item.value }])
          const groupElement = isTableMode
            ? createInventoryGroupRow(pseudoGroupId, itemsArray)
            : createInventoryGroup(pseudoGroupId, itemsArray)
          groupElement.dataset.page = state.currentPage
          elements.gridContainer.appendChild(groupElement)
        } else {
          // Single unit item - render normally
          const element = createFn(item.id, item.value)
          element.dataset.page = state.currentPage
          elements.gridContainer.appendChild(element)
        }
        renderedItems.inventory.add(item.id)
      })
    } else if (appState.disableGrouping) {
      // Grouping disabled (expanded view): filter by expandedGroupKey and render
      const currentGroupKey = window.getExpandedAsset?.()
      let filteredResults = results

      if (currentGroupKey) {
        // Filter results to only show items from the expanded group
        filteredResults = results.filter(item => {
          const itemGroupKey = getGroupKey(item.id, item.value)
          return itemGroupKey === currentGroupKey
        })
        // Update expandedGroupItems for consistency
        appState.expandedGroupItems = filteredResults.map(i => ({ id: i.id, ...i.value }))
      }

      filteredResults.forEach(item => {
        const element = createFn(item.id, item.value)
        element.dataset.page = state.currentPage
        elements.gridContainer.appendChild(element)
        renderedItems.inventory.add(item.id)
      })
    } else {
      // Group items by title::collection
      const groups = groupInventoryItems(results)

      // Clear and rebuild the groups cache
      appState.inventoryGroupsCache.clear()

      for (const [groupId, items] of groups) {
        // Cache the group for expand functionality
        const itemsWithId = items.map(i => ({ id: i.id, ...i.value }))
        appState.inventoryGroupsCache.set(groupId, itemsWithId)

        // Check if should render as group: multiple records OR single record with supply > 1
        const totalSupply = items.reduce((sum, i) => sum + (i.value.supply || 1), 0)
        const shouldRenderAsGroup = items.length > 1 || totalSupply > 1

        if (!shouldRenderAsGroup) {
          // Single item with supply=1 - render as regular card/row
          const element = createFn(items[0].id, items[0].value)
          element.dataset.page = state.currentPage
          elements.gridContainer.appendChild(element)
          renderedItems.inventory.add(items[0].id)
        } else {
          // Multiple items OR supply > 1 - render as group card/row
          const groupElement = isTableMode
            ? createInventoryGroupRow(groupId, items)
            : createInventoryGroup(groupId, items)
          groupElement.dataset.page = state.currentPage
          elements.gridContainer.appendChild(groupElement)
          items.forEach(i => renderedItems.inventory.add(i.id))
        }
      }
    }

    // Save cursor for next page
    state.cursors[state.currentPage] = results[results.length - 1].id
    state.maxKnownPage = Math.max(state.maxKnownPage, state.currentPage)

    if (results.length < VIEW_ITEMS_PER_PAGE) {
      state.noMoreItems = true
      state.maxKnownPage = state.currentPage
    }
  } else {
    elements.gridContainer.innerHTML += '<div class="mp-empty-state">No inventory items found.</div>'
    state.noMoreItems = true
  }

  updateViewPaginationControls('inventory')
  saveViewPaginationState('inventory')
  document.getElementById('paginationBar').style.display = 'flex'
}

/**
 * Subscribe to Inventory view
 * Uses GenosDB cursor-based pagination with filters
 */
export async function subscribeToInventory({ pageToLoad = 1 } = {}) {
  const activeView = window.getCurrentView?.() || 'explore'
  if (activeView !== 'inventory') return

  const viewPagination = appState.viewPagination
  const state = viewPagination.inventory
  if (state.isLoading) return

  state.isLoading = true
  state.currentPage = pageToLoad
  await applyInventoryFilters()
  state.isLoading = false
}

/**
 * Apply filters and re-render offers grid
 * Uses GenosDB cursor-based pagination with filters
 */
export async function applyOffersFilters() {
  const activeView = window.getCurrentView?.() || 'explore'
  if (activeView !== 'offers') return

  // Lazy load renderers
  const { createOfferTableRow } = await getOffersRenderer()
  const { updateViewPaginationControls } = await getLoaders()

  const viewPagination = appState.viewPagination
  const elements = appState.elements
  const state = viewPagination.offers
  const CURRENT_USER = window.CURRENT_USER || ''

  // Build query with GenosDB filters + pagination
  const queryOptions = {
    query: buildViewQuery('offers'),
    field: state.sortField,
    order: state.sortOrder,
    $limit: VIEW_ITEMS_PER_PAGE,
    $after: state.currentPage > 1 ? state.cursors[state.currentPage - 1] : null
  }

  cancelSubscription('offers')

  // Debounce for realtime updates
  let reloadTimeout = null
  const { results, unsubscribe } = await db.map(queryOptions, ({ action }) => {
    if ((window.getCurrentView?.() || 'explore') !== 'offers') return

    // Re-execute query on any change - GenosDB handles filtering/sorting
    if (action === 'added' || action === 'updated' || action === 'removed') {
      clearTimeout(reloadTimeout)
      reloadTimeout = setTimeout(() => {
        subscribeToOffers({ pageToLoad: state.currentPage })
      }, 100)
    }
  })

  subscriptions.offers = unsubscribe
  state.lastCount = results.length

  // Setup grid container
  elements.gridContainer.className = 'mp-table-view offers-table'
  elements.gridContainer.innerHTML = getOffersTableHeader(viewPagination.offers)

  // Clear tracking
  renderedItems.offers.clear()

  // Render items
  if (results.length > 0) {
    results.forEach(item => {
      // Add isOwner flag for UI (show Cancel vs Accept buttons)
      const itemWithOwnerFlag = {
        ...item.value,
        isOwner: item.value.owner === CURRENT_USER
      }
      const element = createOfferTableRow(item.id, itemWithOwnerFlag)
      element.dataset.page = state.currentPage
      elements.gridContainer.appendChild(element)
      renderedItems.offers.add(item.id)
    })

    // Save cursor for next page
    state.cursors[state.currentPage] = results[results.length - 1].id
    state.maxKnownPage = Math.max(state.maxKnownPage, state.currentPage)

    if (results.length < VIEW_ITEMS_PER_PAGE) {
      state.noMoreItems = true
      state.maxKnownPage = state.currentPage
    }
  } else {
    elements.gridContainer.innerHTML += '<div class="mp-empty-state">No offers found.</div>'
    state.noMoreItems = true
  }

  updateViewPaginationControls('offers')
  saveViewPaginationState('offers')
  document.getElementById('paginationBar').style.display = 'flex'
}

/**
 * Subscribe to Offers view
 * Uses GenosDB cursor-based pagination with filters
 */
export async function subscribeToOffers({ pageToLoad = 1 } = {}) {
  const activeView = window.getCurrentView?.() || 'explore'
  if (activeView !== 'offers') return

  const viewPagination = appState.viewPagination
  const state = viewPagination.offers
  if (state.isLoading) return

  state.isLoading = true
  state.currentPage = pageToLoad
  await applyOffersFilters()
  state.isLoading = false
}
