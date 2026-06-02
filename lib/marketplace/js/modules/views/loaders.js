/**
 * View Loaders
 * @module modules/views/loaders
 *
 * Uses dynamic imports to avoid loading all renderers at once.
 * Each view only loads its own renderer when needed.
 */

import { appState } from '../../store/appState.js'
import { VIEW_ITEMS_PER_PAGE } from '../../core/pagination/state.js'
import { buildViewQuery } from '../../core/filters/query.js'
import { groupInventoryItems } from '../../core/rendering/utils.js'
import {
  getCollectionsTableHeader,
  getInventoryTableHeader,
  getOffersTableHeader
} from '../../core/rendering/headers.js'
import { saveViewPaginationState } from './pagination.js'

// Dependencies set via init
let db = null
let handlePaginationPageFn = null

// Cached renderers (lazy loaded)
let collectionsRenderer = null
let inventoryRenderer = null
let offersRenderer = null

/**
 * Initialize view loaders with dependencies
 * @param {object} deps - Dependencies
 * @param {object} deps.db - GenosDB instance
 * @param {function} deps.handlePaginationPage - Pagination page handler
 */
export function initViewLoaders(deps) {
  db = deps.db
  handlePaginationPageFn = deps.handlePaginationPage
}

/**
 * Get current user from window
 */
function getCurrentUser() {
  return window.CURRENT_USER || ''
}

/**
 * Lazy load collections renderer
 */
async function getCollectionsRenderer() {
  if (!collectionsRenderer) {
    collectionsRenderer = await import('../collections/rendering.js')
  }
  return collectionsRenderer
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
 * Load view with static pagination
 */
export async function loadViewWithPagination(viewName, createCardFn, gridClass, loadingText, { prependHeader = false, append = false, pageToLoad = null } = {}) {
  const viewPagination = appState.viewPagination
  const elements = appState.elements
  const state = viewPagination[viewName]
  if (state.isLoading) return

  const targetPage = pageToLoad ?? state.currentPage
  state.isLoading = true

  const grid = elements.gridContainer

  // Setup grid with spinner (only if not appending)
  if (!append) {
    grid.className = gridClass
    const headerHtml = prependHeader ? grid.querySelector('.mp-table-header')?.outerHTML || '' : ''
    grid.innerHTML = headerHtml + `<div class="mp-spinner-container" style="grid-column:1/-1;"><div class="mp-spinner"></div><div class="mp-spinner-text">${loadingText}</div></div>`
  }

  try {
    // Build query with pagination
    const queryOptions = {
      query: buildViewQuery(viewName),
      field: state.sortField || 'timestamp',
      order: state.sortOrder || 'desc',
      $limit: VIEW_ITEMS_PER_PAGE,
      $after: targetPage > 1 ? state.cursors[targetPage - 1] : null
    }

    const { results } = await db.map(queryOptions)
    state.lastCount = results.length

    // Clear grid if not appending
    if (!append) {
      if (prependHeader) {
        const header = grid.querySelector('.mp-table-header')
        grid.innerHTML = header ? header.outerHTML : ''
      } else {
        grid.innerHTML = ''
      }
    }

    if (results.length > 0) {
      results.forEach(item => {
        const card = createCardFn(item.id, item.value)
        card.dataset.itemId = item.id
        card.dataset.page = targetPage
        grid.appendChild(card)
      })

      state.cursors[targetPage] = results[results.length - 1].id
      state.currentPage = targetPage
      state.maxKnownPage = Math.max(state.maxKnownPage, targetPage)

      if (results.length < VIEW_ITEMS_PER_PAGE) {
        state.noMoreItems = true
        state.maxKnownPage = targetPage
      }
    } else if (!append) {
      grid.innerHTML += `<div class="mp-empty-state">No ${viewName} found.</div>`
      state.noMoreItems = true
    }

    updateViewPaginationControls(viewName)
    saveViewPaginationState(viewName)
    document.getElementById('paginationBar').style.display = 'flex'

  } catch (error) {
    grid.innerHTML = `<div class="mp-empty-state">Error loading ${viewName}: ${error.message}</div>`
  } finally {
    state.isLoading = false
  }
}

/**
 * Update view pagination controls
 */
export function updateViewPaginationControls(viewName) {
  const viewPagination = appState.viewPagination
  const elements = appState.elements
  const state = viewPagination[viewName]
  const start = (state.currentPage - 1) * VIEW_ITEMS_PER_PAGE + 1
  const end = start + state.lastCount - 1
  elements.paginationInfo.innerHTML = `${start}-${end > 0 ? end : start}`

  // Generate page number buttons
  elements.pageNumbersContainer.innerHTML = ''
  let startPage = Math.max(1, state.currentPage - 2)
  let endPage = Math.min(state.maxKnownPage, startPage + 4)
  if (endPage - startPage + 1 < 5 && startPage > 1) {
    startPage = Math.max(1, endPage - 4)
  }

  for (let i = startPage; i <= endPage; i++) {
    const btn = document.createElement('button')
    btn.className = 'mp-pagination-btn'
    btn.textContent = i
    if (i === state.currentPage) btn.classList.add('active')
    const page = i
    btn.addEventListener('click', () => handlePaginationPageFn(page))
    elements.pageNumbersContainer.appendChild(btn)
  }

  // Update button states only (handlers are unified)
  elements.firstPageButton.disabled = state.currentPage === 1
  elements.prevPageButton.disabled = state.currentPage === 1
  elements.nextPageButton.disabled = state.noMoreItems && state.currentPage >= state.maxKnownPage
  elements.lastPageButton.disabled = state.noMoreItems && state.currentPage >= state.maxKnownPage
}

/**
 * Load collections view (lazy loads renderer)
 */
export async function loadCollections(options = {}) {
  const elements = appState.elements
  const isTableMode = appState.collectionsViewMode === 'table'
  const gridClass = isTableMode ? 'mp-table-view collections-view' : 'mp-view-grid collections-view'

  // Lazy load collections renderer
  const { createCollectionCard, createCollectionTableRow } = await getCollectionsRenderer()
  const creator = isTableMode ? createCollectionTableRow : createCollectionCard

  // For table mode, prepend header
  if (isTableMode && !options.append) {
    const grid = elements.gridContainer
    grid.className = gridClass
    grid.innerHTML = getCollectionsTableHeader()
  }

  await loadViewWithPagination('collections', creator, gridClass, 'Loading collections...', {
    ...options,
    skipClear: isTableMode && !options.append ? false : options.skipClear,
    prependHeader: isTableMode
  })
}

/**
 * Load inventory view (lazy loads renderer)
 */
export async function loadInventory(options = {}) {
  const elements = appState.elements
  const viewPagination = appState.viewPagination
  const isTableMode = appState.inventoryViewMode === 'table-expanded'
  const containerClass = isTableMode ? 'mp-table-view inventory-table' : 'mp-card-grid'

  // Lazy load inventory renderer
  const { createInventoryCard, createInventoryTableRow, createInventoryGroup } = await getInventoryRenderer()

  // Table mode: use standard pagination (no grouping)
  if (isTableMode) {
    if (!options.append) {
      elements.gridContainer.className = containerClass
      elements.gridContainer.innerHTML = getInventoryTableHeader(viewPagination.inventory)
    }
    await loadViewWithPagination('inventory', createInventoryTableRow, containerClass, 'Loading inventory...', { ...options, prependHeader: true })
    return
  }

  // Grid mode: use grouped view
  await loadInventoryGrouped(options, { createInventoryCard, createInventoryGroup })
}

/**
 * Load inventory with grouped items (for grid view)
 */
export async function loadInventoryGrouped(options = {}, renderers = null) {
  const viewPagination = appState.viewPagination
  const elements = appState.elements
  const state = viewPagination.inventory
  if (state.isLoading) return

  // Get renderers (passed or lazy load)
  const { createInventoryCard, createInventoryGroup } = renderers || await getInventoryRenderer()

  state.isLoading = true
  const grid = elements.gridContainer

  if (!options.append) {
    grid.className = 'mp-card-grid'
    grid.innerHTML = `<div class="mp-spinner-container" style="grid-column:1/-1;"><div class="mp-spinner"></div><div class="mp-spinner-text">Loading inventory...</div></div>`
  }

  try {
    // Load ALL inventory items for grouping (no pagination limit for now)
    const { results } = await db.map({
      query: { owner: getCurrentUser() },
      field: state.sortField || 'timestamp',
      order: state.sortOrder || 'desc',
      $limit: 200 // reasonable limit for inventory
    })

    grid.innerHTML = ''

    if (results.length > 0) {
      // Group items by tokenId/originalAssetId
      const groups = groupInventoryItems(results)

      // Render each group
      for (const [groupId, items] of groups) {
        // Check if should render as group: multiple records OR single record with supply > 1
        const totalSupply = items.reduce((sum, i) => sum + (i.value.supply || 1), 0)
        const shouldRenderAsGroup = items.length > 1 || totalSupply > 1

        if (!shouldRenderAsGroup) {
          // Single item with supply=1 - render as regular card
          const card = createInventoryCard(items[0].id, items[0].value)
          grid.appendChild(card)
        } else {
          // Multiple items OR supply > 1 - render as group
          const groupCard = createInventoryGroup(groupId, items)
          grid.appendChild(groupCard)
        }
      }

      state.currentPage = 1
      state.noMoreItems = true // grouped view loads all
    } else {
      grid.innerHTML = `<div class="mp-empty-state">No inventory found.</div>`
    }

    state.isLoading = false
    updateViewPaginationControls('inventory')
  } catch (error) {
    console.error('Error loading grouped inventory:', error)
    grid.innerHTML = `<div class="mp-empty-state">Error loading inventory.</div>`
    state.isLoading = false
  }
}

/**
 * Load offers view (lazy loads renderer)
 */
export async function loadOffers(options = {}) {
  const elements = appState.elements
  const viewPagination = appState.viewPagination

  // Lazy load offers renderer
  const { createOfferTableRow } = await getOffersRenderer()

  // Pre-set table header before loading
  if (!options.append) {
    elements.gridContainer.className = 'mp-table-view offers-table'
    elements.gridContainer.innerHTML = getOffersTableHeader(viewPagination.offers)
  }
  await loadViewWithPagination('offers', createOfferTableRow, 'mp-table-view offers-table', 'Loading offers...', { ...options, prependHeader: true })
}

/**
 * Load activity view (lazy loads renderer)
 */
export async function loadActivity(options = {}) {
  // Lazy load offers renderer (activity uses createActivityItem from offers)
  const { createActivityItem } = await getOffersRenderer()
  await loadViewWithPagination('activity', createActivityItem, 'mp-list-view', 'Loading activity...', options)
}

/**
 * Load view by name
 */
export function loadViewByName(viewName, options = {}) {
  switch (viewName) {
    case 'collections': return loadCollections(options)
    case 'inventory': return loadInventory(options)
    case 'offers': return loadOffers(options)
    case 'activity': return loadActivity(options)
  }
}
