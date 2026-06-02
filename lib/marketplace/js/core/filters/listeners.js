/**
 * Filter Event Listeners Module
 * @module core/filters/listeners
 *
 * Handles all filter-related event listeners (search, category, status, price, etc.)
 * Uses lazy loading for view functions.
 */

import { appState } from '../../store/appState.js'
import { filters } from './state.js'
import { SORT_ICON_NONE, SORT_ICON_ASC, SORT_ICON_DESC } from '../rendering/utils.js'
import {
  getExploreView,
  getInventoryView,
  getOffersView,
  getCollectionsView,
  getActivityView
} from '../lazy.js'

// Dependencies injected via init
let resetPaginationState = null
let resetInventoryPagination = null
let resetViewPagination = null
let loadViewByName = null
let saveViewPaginationState = null
let createCollectionTableRow = null
let favoriteItems = null
let showToast = null

/**
 * Initialize filter listeners with dependencies
 * @param {Object} deps - Dependencies
 */
export function initFilterListeners(deps) {
  resetPaginationState = deps.resetPaginationState
  resetInventoryPagination = deps.resetInventoryPagination
  resetViewPagination = deps.resetViewPagination
  loadViewByName = deps.loadViewByName
  saveViewPaginationState = deps.saveViewPaginationState
  createCollectionTableRow = deps.createCollectionTableRow
  favoriteItems = deps.favoriteItems
  showToast = deps.showToast
}

/** Helper: lazy load and call explore loadItems */
async function lazyLoadItems(options) {
  const { loading } = await getExploreView()
  await loading.loadItems(options)
}

/** Helper: lazy load and call inventory subscribeToInventory */
async function lazySubscribeToInventory(options) {
  const { subscriptions } = await getInventoryView()
  await subscriptions.subscribeToInventory(options)
}

/** Helper: lazy load and call offers subscribeToOffers */
async function lazySubscribeToOffers(options) {
  const { subscriptions } = await getOffersView()
  await subscriptions.subscribeToOffers(options)
}

/** Helper: lazy load and call collections loadViewWithPagination */
async function lazyLoadCollections(viewName, createCardFn, gridClass, loadingText, options) {
  const { loaders } = await getCollectionsView()
  await loaders.loadViewWithPagination(viewName, createCardFn, gridClass, loadingText, options)
}

/**
 * Setup search input listener with debounce
 */
export function setupSearchListener() {
  const elements = appState.elements
  let searchTimeout

  elements.searchInput?.addEventListener('input', (e) => {
    clearTimeout(searchTimeout)
    searchTimeout = setTimeout(async () => {
      filters.search = e.target.value
      const activeView = window.getCurrentView?.() || 'explore'
      if (activeView === 'inventory') {
        resetInventoryPagination()
        await lazySubscribeToInventory({ pageToLoad: 1 })
      } else if (activeView === 'offers') {
        resetViewPagination('offers')
        await lazySubscribeToOffers({ pageToLoad: 1 })
      } else if (activeView === 'collections') {
        resetViewPagination('collections')
        await lazyLoadCollections('collections', createCollectionTableRow, '.mp-table-body', 'Searching collections...', { prependHeader: true })
      } else {
        resetPaginationState()
        await lazyLoadItems({ pageToLoad: 1, append: false })
      }
    }, 300)
  })
}

/**
 * Setup category filter listeners (multi-select pills)
 */
export function setupCategoryFilterListener() {
  const elements = appState.elements

  elements.categoryFilter?.querySelectorAll('.mp-filter-pill').forEach(option => {
    option.addEventListener('click', async () => {
      const category = option.dataset.category

      // Handle "Favorites" option (additive filter, doesn't affect categories)
      if (category === 'favorites') {
        const wasActive = option.classList.contains('active')
        filters.showFavoritesOnly = !wasActive
        option.classList.toggle('active')

        // When favorites is active, keep other filters but add favorites constraint
        if (!wasActive && favoriteItems?.size === 0) {
          showToast?.('info', 'No Favorites', 'Add items to favorites by clicking the heart icon')
        }

        // Load appropriate view based on current view
        const activeView = window.getCurrentView?.() || 'explore'
        if (activeView === 'inventory') {
          resetInventoryPagination()
          await lazySubscribeToInventory({ pageToLoad: 1 })
        } else {
          resetPaginationState()
          await lazyLoadItems({ pageToLoad: 1, append: false })
        }
        return
      }

      // Toggle individual category (multi-select)
      option.classList.toggle('active')
      if (option.classList.contains('active')) {
        if (!filters.categories.includes(category)) filters.categories.push(category)
      } else {
        filters.categories = filters.categories.filter(c => c !== category)
      }

      // Load appropriate view based on current view
      const activeView2 = window.getCurrentView?.() || 'explore'
      if (activeView2 === 'inventory') {
        resetInventoryPagination()
        await lazySubscribeToInventory({ pageToLoad: 1 })
      } else {
        resetPaginationState()
        await lazyLoadItems({ pageToLoad: 1, append: false })
      }
    })
  })
}

/**
 * Setup status/type filter listeners (multi-select pills)
 */
export function setupStatusFilterListener() {
  const elements = appState.elements

  elements.statusFilter?.querySelectorAll('.mp-filter-pill[data-type]').forEach(pill => {
    pill.addEventListener('click', async () => {
      pill.classList.toggle('active')
      const type = pill.dataset.type
      if (pill.classList.contains('active')) {
        if (!filters.types.includes(type)) filters.types.push(type)
      } else {
        filters.types = filters.types.filter(t => t !== type)
      }
      resetPaginationState()
      await lazyLoadItems({ pageToLoad: 1, append: false })
    })
  })
}

/**
 * Setup rarity filter listeners (multi-select pills)
 */
export function setupRarityFilterListener() {
  document.querySelectorAll('.mp-filter-pill[data-rarity]').forEach(pill => {
    pill.addEventListener('click', async () => {
      pill.classList.toggle('active')
      const rarity = pill.dataset.rarity
      if (pill.classList.contains('active')) {
        if (!filters.rarities.includes(rarity)) filters.rarities.push(rarity)
      } else {
        filters.rarities = filters.rarities.filter(r => r !== rarity)
      }
      resetPaginationState()
      await lazyLoadItems({ pageToLoad: 1, append: false })
    })
  })
}

/**
 * Setup inventory status filter listeners
 */
export function setupInventoryStatusFilterListener() {
  const viewPagination = appState.viewPagination

  document.querySelectorAll('[data-inventory-status]').forEach(pill => {
    pill.addEventListener('click', async () => {
      pill.classList.toggle('active')
      const activePills = document.querySelectorAll('[data-inventory-status].active')
      filters.listingStatuses = Array.from(activePills).map(p => p.dataset.inventoryStatus)

      if ((window.getCurrentView?.() || 'explore') === 'inventory') {
        const state = viewPagination.inventory
        state.currentPage = 1
        state.cursors = {}
        state.noMoreItems = false
        state.maxKnownPage = 1
        await lazySubscribeToInventory({ pageToLoad: 1 })
      }
    })
  })
}

/**
 * Setup inventory category filter listeners
 */
export function setupInventoryCategoryFilterListener() {
  const viewPagination = appState.viewPagination

  document.querySelectorAll('[data-inventory-category]').forEach(pill => {
    pill.addEventListener('click', async () => {
      pill.classList.toggle('active')
      const activePills = document.querySelectorAll('[data-inventory-category].active')
      filters.categories = Array.from(activePills).map(p => p.dataset.inventoryCategory)

      if ((window.getCurrentView?.() || 'explore') === 'inventory') {
        const state = viewPagination.inventory
        state.currentPage = 1
        state.cursors = {}
        state.noMoreItems = false
        state.maxKnownPage = 1
        await lazySubscribeToInventory({ pageToLoad: 1 })
      }
    })
  })
}

/**
 * Setup inventory rarity filter listeners
 */
export function setupInventoryRarityFilterListener() {
  const viewPagination = appState.viewPagination

  document.querySelectorAll('[data-inventory-rarity]').forEach(pill => {
    pill.addEventListener('click', async () => {
      pill.classList.toggle('active')
      const activePills = document.querySelectorAll('[data-inventory-rarity].active')
      filters.inventoryRarities = Array.from(activePills).map(p => p.dataset.inventoryRarity)

      if ((window.getCurrentView?.() || 'explore') === 'inventory') {
        const state = viewPagination.inventory
        state.currentPage = 1
        state.cursors = {}
        state.noMoreItems = false
        state.maxKnownPage = 1
        await lazySubscribeToInventory({ pageToLoad: 1 })
      }
    })
  })
}

/**
 * Setup price range filter listeners with debounce
 */
export function setupPriceFilterListener() {
  const elements = appState.elements
  let priceTimeout

  const handlePriceChange = () => {
    clearTimeout(priceTimeout)
    priceTimeout = setTimeout(async () => {
      const min = elements.priceMin?.value ? parseFloat(elements.priceMin.value) : null
      const max = elements.priceMax?.value ? parseFloat(elements.priceMax.value) : null
      filters.priceMin = min
      filters.priceMax = max
      resetPaginationState()
      await lazyLoadItems({ pageToLoad: 1, append: false })
    }, 500)
  }

  elements.priceMin?.addEventListener('input', handlePriceChange)
  elements.priceMax?.addEventListener('input', handlePriceChange)
}

/**
 * Setup table header sort listeners (OpenSea style)
 */
export function setupTableSortListener() {
  const elements = appState.elements
  const viewPagination = appState.viewPagination

  elements.gridContainer?.addEventListener('click', async (e) => {
    const headerCell = e.target.closest('.mp-table-header-cell.sortable')
    if (!headerCell) return

    const field = headerCell.dataset.sort
    if (!field) return

    const allHeaders = elements.gridContainer.querySelectorAll('.mp-table-header-cell.sortable')

    // Determine new sort state: none → asc → desc → none
    let newOrder = 'asc'
    if (headerCell.classList.contains('sort-asc')) {
      newOrder = 'desc'
    } else if (headerCell.classList.contains('sort-desc')) {
      newOrder = null
    }

    // Reset all headers to default icon
    allHeaders.forEach(h => {
      h.classList.remove('sort-asc', 'sort-desc')
      const icon = h.querySelector('.sort-icon')
      if (icon) icon.outerHTML = SORT_ICON_NONE
    })

    // Apply new sort state
    if (newOrder) {
      headerCell.classList.add(newOrder === 'asc' ? 'sort-asc' : 'sort-desc')
      const icon = headerCell.querySelector('.sort-icon')
      if (icon) icon.outerHTML = newOrder === 'asc' ? SORT_ICON_ASC : SORT_ICON_DESC

      const sortView = window.getCurrentView?.() || 'explore'
      if (sortView === 'explore') {
        filters.sortField = field
        filters.sortOrder = newOrder
        resetPaginationState()
        await lazyLoadItems({ pageToLoad: 1, append: false })
      } else if (viewPagination[sortView]) {
        const state = viewPagination[sortView]
        state.sortField = field
        state.sortOrder = newOrder
        state.currentPage = 1
        state.cursors = {}
        state.noMoreItems = false
        state.maxKnownPage = 1
        await loadViewByName(sortView)
      }
    } else {
      // Reset to default sort
      if ((window.getCurrentView?.() || 'explore') === 'explore') {
        filters.sortField = 'timestamp'
        filters.sortOrder = 'desc'
        resetPaginationState()
        await lazyLoadItems({ pageToLoad: 1, append: false })
      }
    }
  })
}

/**
 * Setup collections sort filter listeners (radio style)
 */
export function setupCollectionSortListener() {
  const viewPagination = appState.viewPagination

  document.querySelectorAll('[data-collection-sort]').forEach(option => {
    option.addEventListener('click', async () => {
      const sortField = option.dataset.collectionSort
      document.querySelectorAll('[data-collection-sort]').forEach(o => o.classList.remove('selected'))
      option.classList.add('selected')

      const state = viewPagination.collections
      state.sortField = sortField
      state.sortOrder = 'desc'
      state.currentPage = 1
      state.cursors = {}
      state.noMoreItems = false
      state.maxKnownPage = 1
      if ((window.getCurrentView?.() || 'explore') === 'collections') await loadViewByName('collections')
    })
  })
}

/**
 * Setup offers direction filter listeners (single-select pills)
 */
export function setupOfferDirectionFilterListener() {
  const viewPagination = appState.viewPagination

  document.querySelectorAll('[data-offer-direction]').forEach(pill => {
    pill.addEventListener('click', async () => {
      const direction = pill.dataset.offerDirection
      document.querySelectorAll('[data-offer-direction]').forEach(p => p.classList.remove('active'))
      pill.classList.add('active')
      viewPagination.offers.filterDirection = direction
      resetViewPagination('offers')
      viewPagination.offers.filterDirection = direction
      saveViewPaginationState('offers')
      if ((window.getCurrentView?.() || 'explore') === 'offers') await lazySubscribeToOffers({ pageToLoad: 1 })
    })
  })
}

/**
 * Setup offers status filter listeners (single-select pills)
 */
export function setupOfferStatusFilterListener() {
  const viewPagination = appState.viewPagination

  document.querySelectorAll('[data-offer-status]').forEach(pill => {
    pill.addEventListener('click', async () => {
      const status = pill.dataset.offerStatus
      document.querySelectorAll('[data-offer-status]').forEach(p => p.classList.remove('active'))
      pill.classList.add('active')
      viewPagination.offers.filterStatus = status
      resetViewPagination('offers')
      viewPagination.offers.filterStatus = status
      saveViewPaginationState('offers')
      if ((window.getCurrentView?.() || 'explore') === 'offers') await lazySubscribeToOffers({ pageToLoad: 1 })
    })
  })
}

/**
 * Setup activity type filter listeners (radio style)
 */
export function setupActivityTypeFilterListener() {
  const viewPagination = appState.viewPagination

  document.querySelectorAll('[data-activity-type]').forEach(option => {
    option.addEventListener('click', async () => {
      const type = option.dataset.activityType
      document.querySelectorAll('[data-activity-type]').forEach(o => o.classList.remove('selected'))
      option.classList.add('selected')
      viewPagination.activity.filterType = type
      resetViewPagination('activity')
      viewPagination.activity.filterType = type
      saveViewPaginationState('activity')
      if ((window.getCurrentView?.() || 'explore') === 'activity') await loadViewByName('activity')
    })
  })
}

/**
 * Setup land map filter listeners (multi-select toggle pills)
 */
export function setupLandFilterListener() {
  document.querySelectorAll('[data-land-filter]').forEach(pill => {
    pill.addEventListener('click', () => {
      pill.classList.toggle('active')
      const activeTypes = [...document.querySelectorAll('[data-land-filter].active')]
        .map(p => p.dataset.landFilter)
      window.dispatchEvent(new CustomEvent('parcelFilterChanged', { detail: { activeTypes } }))
    })
  })
}

/**
 * Initialize all filter listeners
 * Call this after dependencies are injected via initFilterListeners
 */
export function setupAllFilterListeners() {
  setupSearchListener()
  setupCategoryFilterListener()
  setupStatusFilterListener()
  setupRarityFilterListener()
  setupInventoryStatusFilterListener()
  setupInventoryCategoryFilterListener()
  setupInventoryRarityFilterListener()
  setupPriceFilterListener()
  setupTableSortListener()
  setupCollectionSortListener()
  setupOfferDirectionFilterListener()
  setupOfferStatusFilterListener()
  setupActivityTypeFilterListener()
  setupLandFilterListener()
}
