/**
 * Pagination Handlers Module
 * @module core/pagination/handlers
 *
 * Handles pagination controls, navigation, and infinite scroll.
 * Uses lazy loading for view modules.
 */

import { appState } from '../../store/appState.js'
import { ITEMS_PER_PAGE } from '../constants.js'
import { VISIBLE_PAGE_NUMBERS } from './state.js'
import { savePaginationState } from '../../modules/explore/persistence.js'
import { getExploreView } from '../lazy.js'
import { loadViewByName } from '../../modules/views/dispatcher.js'

/**
 * Lazy load and call loadItems
 */
async function lazyLoadItems(options) {
  const { loading } = await getExploreView()
  return loading.loadItems(options)
}

/**
 * Update pagination controls UI
 */
export function updatePaginationControls() {
  const elements = appState.elements
  const itemsPerPage = ITEMS_PER_PAGE

  // Update info
  const start = (appState.currentPage - 1) * itemsPerPage + 1
  const end = start + appState.lastBatchResultCount - 1
  elements.paginationInfo.innerHTML = `${start}-${end > 0 ? end : start}`

  // Page numbers
  elements.pageNumbersContainer.innerHTML = ''
  let startPage = Math.max(1, appState.currentPage - Math.floor(VISIBLE_PAGE_NUMBERS / 2))
  let endPage = Math.min(appState.maxKnownPage, startPage + VISIBLE_PAGE_NUMBERS - 1)
  if (endPage - startPage + 1 < VISIBLE_PAGE_NUMBERS && startPage > 1) {
    startPage = Math.max(1, endPage - VISIBLE_PAGE_NUMBERS + 1)
  }

  for (let i = startPage; i <= endPage; i++) {
    const pageButton = document.createElement('button')
    pageButton.className = 'mp-pagination-btn'
    pageButton.textContent = i
    if (i === appState.currentPage) pageButton.classList.add('active')
    const page = i
    pageButton.addEventListener('click', () => handlePaginationPage(page))
    elements.pageNumbersContainer.appendChild(pageButton)
  }

  // Nav buttons
  elements.prevPageButton.disabled = appState.currentPage === 1
  elements.firstPageButton.disabled = appState.currentPage === 1

  const canGoNext = appState.currentPage < appState.maxKnownPage || (appState.currentPage === appState.maxKnownPage && !appState.noMoreItemsToLoad && appState.lastBatchResultCount === itemsPerPage)
  elements.nextPageButton.disabled = !canGoNext || (appState.noMoreItemsToLoad && appState.currentPage === appState.maxKnownPage)
  elements.lastPageButton.disabled = appState.currentPage === appState.maxKnownPage && (appState.noMoreItemsToLoad || appState.lastBatchResultCount < itemsPerPage)
}

/**
 * Handle first page navigation
 */
export async function handlePaginationFirst() {
  const viewPagination = appState.viewPagination
  const view = window.getCurrentView?.() || 'explore'
  if (view === 'explore') {
    if (appState.currentPage !== 1) await lazyLoadItems({ pageToLoad: 1, append: false })
  } else if (viewPagination[view]) {
    const state = viewPagination[view]
    if (state.currentPage !== 1) {
      state.currentPage = 1
      await loadViewByName(view)
    }
  }
}

/**
 * Handle previous page navigation
 */
export async function handlePaginationPrev() {
  const viewPagination = appState.viewPagination
  const view = window.getCurrentView?.() || 'explore'
  if (view === 'explore') {
    if (appState.currentPage > 1) await lazyLoadItems({ pageToLoad: appState.currentPage - 1, append: false })
  } else if (viewPagination[view]) {
    const state = viewPagination[view]
    if (state.currentPage > 1) {
      state.currentPage--
      await loadViewByName(view)
    }
  }
}

/**
 * Handle next page navigation
 */
export async function handlePaginationNext() {
  const viewPagination = appState.viewPagination
  const view = window.getCurrentView?.() || 'explore'
  if (view === 'explore') {
    const itemsPerPage = ITEMS_PER_PAGE
    if ((appState.currentPage < appState.maxKnownPage) || (appState.currentPage === appState.maxKnownPage && !appState.noMoreItemsToLoad && appState.itemsCurrentlyInView.size > 0 && appState.lastBatchResultCount === itemsPerPage)) {
      await lazyLoadItems({ pageToLoad: appState.currentPage + 1, append: false })
    }
  } else if (viewPagination[view]) {
    const state = viewPagination[view]
    if (!state.noMoreItems || state.currentPage < state.maxKnownPage) {
      state.currentPage++
      state.maxKnownPage = Math.max(state.maxKnownPage, state.currentPage)
      await loadViewByName(view)
    }
  }
}

/**
 * Handle last page navigation
 */
export async function handlePaginationLast() {
  const viewPagination = appState.viewPagination
  const view = window.getCurrentView?.() || 'explore'
  if (view === 'explore') {
    if (appState.currentPage !== appState.maxKnownPage && appState.maxKnownPage > 0) {
      if (appState.maxKnownPage === 1 || appState.pageLastItemCursors[appState.maxKnownPage - 1] || appState.lastBatchResultCount < ITEMS_PER_PAGE) {
        await lazyLoadItems({ pageToLoad: appState.maxKnownPage, append: false })
      } else {
        if (appState.maxKnownPage > 1 && appState.pageLastItemCursors[appState.maxKnownPage - 2]) {
          await lazyLoadItems({ pageToLoad: appState.maxKnownPage - 1, append: false })
        } else {
          await lazyLoadItems({ pageToLoad: 1, append: false })
        }
      }
    }
  } else if (viewPagination[view]) {
    const state = viewPagination[view]
    if (state.currentPage !== state.maxKnownPage) {
      state.currentPage = state.maxKnownPage
      await loadViewByName(view)
    }
  }
}

/**
 * Handle specific page navigation
 * @param {number} page - Page number to navigate to
 */
export async function handlePaginationPage(page) {
  const viewPagination = appState.viewPagination
  const view = window.getCurrentView?.() || 'explore'
  if (view === 'explore') {
    if (page !== appState.currentPage) await lazyLoadItems({ pageToLoad: page, append: false })
  } else if (viewPagination[view]) {
    const state = viewPagination[view]
    if (page !== state.currentPage) {
      state.currentPage = page
      await loadViewByName(view)
    }
  }
}

/**
 * Handle infinite scroll
 */
export async function handleScroll() {
  const elements = appState.elements
  const viewPagination = appState.viewPagination
  const container = elements.scrollContainer
  if (!container) return

  const view = window.getCurrentView?.() || 'explore'
  const { scrollTop, scrollHeight, clientHeight } = container

  // Handle Explore view
  if (view === 'explore') {
    // Infinite scroll DOWN (Append)
    if (scrollTop + clientHeight >= scrollHeight - 400 && !appState.isLoading && !appState.noMoreItemsToLoad) {
      const items = elements.gridContainer.querySelectorAll('[data-page]')
      const lastItem = items[items.length - 1]
      const nextTargetPage = lastItem ? parseInt(lastItem.dataset.page) + 1 : appState.currentPage + 1

      if (appState.pageLastItemCursors[nextTargetPage - 1]) {
        await lazyLoadItems({ pageToLoad: nextTargetPage, append: true })
      }
    }

    // Infinite scroll UP (Prepend)
    if (scrollTop < 400 && !appState.isLoading) {
      const firstItem = elements.gridContainer.querySelector('[data-page]')
      const firstLoadedPage = firstItem ? parseInt(firstItem.dataset.page) : appState.currentPage
      const prevTargetPage = firstLoadedPage - 1

      if (prevTargetPage >= 1 && (prevTargetPage === 1 || appState.pageLastItemCursors[prevTargetPage - 1])) {
        await lazyLoadItems({ pageToLoad: prevTargetPage, prepend: true })
      }
    }
  }
  // Handle other views with viewPagination
  else if (viewPagination[view]) {
    const state = viewPagination[view]

    // Infinite scroll DOWN (Append)
    if (scrollTop + clientHeight >= scrollHeight - 400 && !state.isLoading && !state.noMoreItems) {
      const lastItem = elements.gridContainer.lastElementChild
      const lastItemPage = lastItem?.dataset?.page ? parseInt(lastItem.dataset.page) : state.currentPage
      const nextTargetPage = lastItemPage + 1

      // Check if page already loaded
      const isAlreadyLoaded = [...elements.gridContainer.children].some(el => parseInt(el.dataset?.page) === nextTargetPage)
      if (isAlreadyLoaded) return

      // Check if we have the cursor for the previous page
      if (nextTargetPage === 1 || state.cursors[nextTargetPage - 1]) {
        await loadViewByName(view, { append: true, pageToLoad: nextTargetPage })
      }
    }
  }
}

/**
 * Initialize pagination event listeners
 * Call this after elements are available
 */
export function initPaginationHandlers() {
  const elements = appState.elements

  // Pagination button listeners
  elements.firstPageButton?.addEventListener('click', handlePaginationFirst)
  elements.prevPageButton?.addEventListener('click', handlePaginationPrev)
  elements.nextPageButton?.addEventListener('click', handlePaginationNext)
  elements.lastPageButton?.addEventListener('click', handlePaginationLast)

  // Scroll listener with debounced save
  let scrollTimeout
  elements.scrollContainer?.addEventListener('scroll', () => {
    handleScroll()
    clearTimeout(scrollTimeout)
    scrollTimeout = setTimeout(savePaginationState, 250)
  })
}
