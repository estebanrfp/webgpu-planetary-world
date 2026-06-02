/**
 * Pagination state management
 * @module core/pagination/state
 *
 * EXTRACTED FROM: app-core.js lines 65-89
 * DO NOT MODIFY - exact copy of original logic
 */

import { DB_NAME, ITEMS_PER_PAGE, LOCAL_STORAGE_KEY, VIEW_PAGINATION_KEY } from '../constants.js'

// --- Pagination Constants ---
export const VISIBLE_PAGE_NUMBERS = 5
export const DB_ORDER_FIELD = 'timestamp'
export const DB_ORDER_DIRECTION = 'desc'
export const VIEW_ITEMS_PER_PAGE = 24

// Re-export from constants for backward compatibility
export { LOCAL_STORAGE_KEY, VIEW_PAGINATION_KEY }

// --- Application State (Explore view) ---
export let currentPage = 1
export let maxKnownPage = 1
export let isLoading = false
export let noMoreItemsToLoad = false
export let pageLastItemCursors = {}
export let itemsCurrentlyInView = new Set()
export let lastBatchResultCount = 0
export let pageVisibilityObserver = null
export let visibleItemsMap = new Map()

// --- View Pagination State (other views) ---
export const viewPagination = {
  collections: { currentPage: 1, maxKnownPage: 1, cursors: {}, isLoading: false, noMoreItems: false, lastCount: 0, sortField: 'volume', sortOrder: 'desc' },
  inventory: { currentPage: 1, maxKnownPage: 1, cursors: {}, isLoading: false, noMoreItems: false, lastCount: 0, sortField: 'timestamp', sortOrder: 'desc' },
  offers: { currentPage: 1, maxKnownPage: 1, cursors: {}, isLoading: false, noMoreItems: false, lastCount: 0, sortField: 'timestamp', sortOrder: 'desc', filterDirection: 'all', filterStatus: 'pending' },
  activity: { currentPage: 1, maxKnownPage: 1, cursors: {}, isLoading: false, noMoreItems: false, lastCount: 0, sortField: 'timestamp', sortOrder: 'desc', filterType: 'all' }
}

// --- State Setters (needed because ES modules export bindings, not values) ---
export function setCurrentPage(value) { currentPage = value }
export function setMaxKnownPage(value) { maxKnownPage = value }
export function setIsLoading(value) { isLoading = value }
export function setNoMoreItemsToLoad(value) { noMoreItemsToLoad = value }
export function setPageLastItemCursors(value) { pageLastItemCursors = value }
export function setLastBatchResultCount(value) { lastBatchResultCount = value }
export function setPageVisibilityObserver(value) { pageVisibilityObserver = value }

export function clearItemsCurrentlyInView() { itemsCurrentlyInView.clear() }
export function clearVisibleItemsMap() { visibleItemsMap.clear() }
export function addToItemsCurrentlyInView(id) { itemsCurrentlyInView.add(id) }
