/**
 * View Modes Exports Module
 * @module core/viewModes/exports
 *
 * Centralizes all view mode window exports (setXViewMode, getXViewMode).
 * Uses lazy loading for view functions.
 */

import { appState } from '../../store/appState.js'
import {
  getExploreView,
  getInventoryView,
  getCollectionsView
} from '../lazy.js'

// Dependencies injected via init
let saveViewMode = null
let resetPaginationState = null
let resetViewPagination = null

/**
 * Initialize view modes exports with dependencies
 * @param {Object} deps - Dependencies
 */
export function initViewModesExports(deps) {
  saveViewMode = deps.saveViewMode
  resetPaginationState = deps.resetPaginationState
  resetViewPagination = deps.resetViewPagination
}

/**
 * Set explore view mode (async - uses lazy loading)
 * @param {string} mode - 'grid' or 'table-expanded'
 */
export async function setExploreViewMode(mode) {
  appState.exploreViewMode = mode
  saveViewMode?.('explore', mode)
  resetPaginationState?.()
  const { loading } = await getExploreView()
  await loading.loadItems({ pageToLoad: 1, append: false })
}

/**
 * Get explore view mode
 * @returns {string}
 */
export function getExploreViewMode() {
  return appState.exploreViewMode
}

/**
 * Set inventory view mode (async - uses lazy loading)
 * @param {string} mode - 'grid' or 'table-expanded'
 */
export async function setInventoryViewMode(mode) {
  appState.inventoryViewMode = mode
  saveViewMode?.('inventory', mode)
  resetViewPagination?.('inventory')
  const { subscriptions } = await getInventoryView()
  await subscriptions.subscribeToInventory({ pageToLoad: 1 })
}

/**
 * Get inventory view mode
 * @returns {string}
 */
export function getInventoryViewMode() {
  return appState.inventoryViewMode
}

/**
 * Set collections view mode (async - uses lazy loading)
 * @param {string} mode - 'grid' or 'table-expanded'
 */
export async function setCollectionsViewMode(mode) {
  appState.collectionsViewMode = mode
  saveViewMode?.('collections', mode)
  const { loaders } = await getCollectionsView()
  await loaders.loadCollections()
}

/**
 * Get collections view mode
 * @returns {string}
 */
export function getCollectionsViewMode() {
  return appState.collectionsViewMode
}

/**
 * Setup all view mode window exports
 */
export function setupViewModesExports() {
  window.setExploreViewMode = setExploreViewMode
  window.getExploreViewMode = getExploreViewMode
  window.setInventoryViewMode = setInventoryViewMode
  window.getInventoryViewMode = getInventoryViewMode
  window.setCollectionsViewMode = setCollectionsViewMode
  window.getCollectionsViewMode = getCollectionsViewMode
}
