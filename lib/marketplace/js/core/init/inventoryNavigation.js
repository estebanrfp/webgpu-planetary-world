/**
 * Inventory Navigation Module
 * @module core/init/inventoryNavigation
 *
 * Handles inventory navigation: group filtering, asset expansion, and back navigation.
 * Uses lazy loading for view functions.
 */

import { appState } from '../../store/appState.js'
import { getInventoryView } from '../lazy.js'

/**
 * Lazy load renderExpandedAsset
 */
async function lazyRenderExpandedAsset() {
  const { rendering } = await getInventoryView()
  rendering.renderExpandedAsset()
}

/**
 * Initialize inventory navigation (no dependencies needed - uses lazy loading)
 */
export function initInventoryNavigation() {
  // No dependencies needed - uses lazy loading
}

/**
 * Filter inventory by group (when viewing a specific group)
 * @param {string} groupId - Group identifier
 * @param {string} groupTitle - Group title for display
 */
export async function filterInventoryByGroup(groupId, groupTitle) {
  appState.inventoryGroupFilter = groupId
  const backBtn = document.getElementById('inventoryBackBtn')
  if (backBtn) {
    backBtn.style.display = 'inline-flex'
  }
  const { subscriptions } = await getInventoryView()
  await subscriptions.subscribeToInventory({ pageToLoad: 1 })
}

/**
 * Get current inventory group filter
 * @returns {string|null} Current group filter
 */
export function getInventoryGroupFilter() {
  return appState.inventoryGroupFilter
}

/**
 * Expand asset group with navigation stack for multi-level expand
 * @param {string} groupKey - Group key to expand
 * @param {Array} items - Items in the group
 */
export async function expandAsset(groupKey, items) {
  // Push current state to stack before expanding (if we're already in expanded view)
  if (appState.expandedGroupKey) {
    appState.navigationStack.push({ key: appState.expandedGroupKey, items: appState.expandedGroupItems })
  }
  appState.expandedGroupKey = groupKey
  appState.expandedGroupItems = items
  appState.disableGrouping = true
  document.getElementById('inventoryBackBtn').style.display = 'inline-flex'
  await lazyRenderExpandedAsset()
}

/**
 * Clear expanded asset and navigate back
 */
export async function clearExpandedAsset() {
  // Pop previous state from stack if available
  if (appState.navigationStack.length > 0) {
    const prev = appState.navigationStack.pop()
    appState.expandedGroupKey = prev.key
    appState.expandedGroupItems = prev.items
    document.getElementById('inventoryBackBtn').style.display = 'inline-flex'
    await lazyRenderExpandedAsset()
  } else {
    appState.expandedGroupKey = null
    appState.expandedGroupItems = []
    appState.disableGrouping = false
    // Keep back button visible if still filtered by group (level 1)
    const backBtn = document.getElementById('inventoryBackBtn')
    if (backBtn) {
      backBtn.style.display = appState.inventoryGroupFilter ? 'inline-flex' : 'none'
    }
    const { subscriptions } = await getInventoryView()
    await subscriptions.subscribeToInventory({ pageToLoad: 1 })
  }
}

/**
 * Get expanded asset group key
 * @returns {string|null} Current expanded group key
 */
export function getExpandedAsset() {
  return appState.expandedGroupKey
}

/**
 * Clear inventory group filter and navigate back
 */
export async function clearInventoryGroupFilter() {
  if (appState.expandedGroupKey) {
    await clearExpandedAsset()
  } else if (appState.inventoryGroupFilter) {
    appState.inventoryGroupFilter = null
    document.getElementById('inventoryBackBtn').style.display = 'none'
    const { subscriptions } = await getInventoryView()
    await subscriptions.subscribeToInventory({ pageToLoad: 1 })
  }
}

/**
 * Setup window exports for inventory navigation
 */
export function setupInventoryNavigationExports() {
  window.filterInventoryByGroup = filterInventoryByGroup
  window.getInventoryGroupFilter = getInventoryGroupFilter
  window.expandAsset = expandAsset
  window.clearExpandedAsset = clearExpandedAsset
  window.getExpandedAsset = getExpandedAsset
  window.clearInventoryGroupFilter = clearInventoryGroupFilter
}
