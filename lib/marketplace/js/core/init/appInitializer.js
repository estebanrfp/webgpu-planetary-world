/**
 * App Initializer Module
 * @module core/init/appInitializer
 *
 * Handles application initialization: IntersectionObserver, wallet connection,
 * initial data loading, and view setup. Uses lazy loading for view functions.
 */

import { appState } from '../../store/appState.js'
import { getExploreView } from '../lazy.js'

// Dependencies injected via init
let loadPaginationState = null
let savePaginationState = null
let updatePaginationControls = null
let loadBlockchainData = null
let updateFilterCounts = null

/**
 * Initialize app initializer with dependencies
 * @param {Object} deps - Dependencies
 */
export function initAppInitializer(deps) {
  loadPaginationState = deps.loadPaginationState
  savePaginationState = deps.savePaginationState
  updatePaginationControls = deps.updatePaginationControls
  loadBlockchainData = deps.loadBlockchainData
  updateFilterCounts = deps.updateFilterCounts
}

/**
 * Initialize the application
 * Sets up IntersectionObserver, loads wallet, checks data, and loads initial view
 * @param {Object} db - Database instance
 * @param {HTMLElement} scrollContainer - Scroll container element
 */
export async function initializeApp(db, scrollContainer) {
  const restoredScrollTop = loadPaginationState?.()

  // Initialize IntersectionObserver for page synchronization
  appState.pageVisibilityObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        appState.visibleItemsMap.set(entry.target, parseInt(entry.target.dataset.page))
      } else {
        appState.visibleItemsMap.delete(entry.target)
      }
    })

    if (appState.visibleItemsMap.size > 0) {
      // Find the page of the item highest in viewport
      let highestItem = null
      let minTop = Infinity

      appState.visibleItemsMap.forEach((page, element) => {
        const rect = element.getBoundingClientRect()
        if (rect.top < minTop) {
          minTop = rect.top
          highestItem = { element, page }
        }
      })

      if (highestItem && highestItem.page !== appState.currentPage) {
        appState.currentPage = highestItem.page
        updatePaginationControls?.()
        savePaginationState?.()
      }
    }
  }, {
    root: scrollContainer,
    threshold: 0.1,
    rootMargin: '-10% 0px -10% 0px'
  })

  if (appState.currentPage > 1 && Object.keys(appState.pageLastItemCursors).length === 0) {
    appState.currentPage = 1
    appState.maxKnownPage = 1
  }

  let initialPageToLoad = 1
  if (appState.currentPage > 1 && appState.pageLastItemCursors[appState.currentPage - 1]) {
    initialPageToLoad = appState.currentPage
  } else if (appState.currentPage > 1) {
    appState.currentPage = 1
  }

  // Always get user wallet address first (needed for inventory filtering)
  try {
    const { getBlockchainManager } = await import('../../../../../lib/blockchain/BlockchainManager.js')
    const bm = await getBlockchainManager()
    const signer = await bm.getSigner?.()
    const userAddress = signer ? await signer.getAddress() : null
    if (userAddress) {
      window.updateCurrentUser?.(userAddress.toLowerCase())
    }
  } catch (e) {
    console.warn('[App] Could not get wallet address:', e.message)
  }

  // Check if data exists - only load from blockchain if database is empty
  const { results: assetCheck } = await db.map({ query: {}, $limit: 5 })
  const hasAnyData = assetCheck.length > 0

  if (!hasAnyData) {
    // Database is virgin - load initial data from blockchain
    await loadBlockchainData?.()
  }
  // If database has records, preserve them (user can manually sync via refresh button)

  // Lazy load explore view and load initial page
  const { loading } = await getExploreView()
  await loading.loadItems({
    pageToLoad: initialPageToLoad,
    append: false,
    restoreScrollTop: initialPageToLoad === appState.currentPage ? restoredScrollTop : 0
  })

  // Update category counts after init
  updateFilterCounts?.()

  // Initialize subheader for default view (explore)
  window.updateSubheaderForView?.('explore')

  // Sync view mode toggle buttons with saved state
  window.syncViewToggleButtons?.('explore')
}
