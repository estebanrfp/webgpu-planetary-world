/**
 * Inventory Grouping State
 * @module modules/inventory/grouping
 *
 * EXACT COPY of app-core.js lines 1938-2000
 * Only change: variables accessed via appState object
 *
 * ORIGINAL:
 *   inventoryGroupFilter, expandedGroupKey, expandedGroupItems,
 *   disableGrouping, navigationStack, inventoryGroupsCache
 *
 * MIGRATED:
 *   appState.inventoryGroupFilter, appState.expandedGroupKey, etc.
 */

import { appState } from '../../store/appState.js'

/**
 * Filter inventory by group
 * EXACT COPY of app-core.js lines 1940-1948
 * @param {string} groupId - Group ID to filter by
 * @param {string} groupTitle - Group title for display
 * @param {function} subscribeToInventory - Subscribe function callback
 */
export function filterInventoryByGroup(groupId, groupTitle, subscribeToInventory) {
  appState.inventoryGroupFilter = groupId                // was: inventoryGroupFilter = groupId
  // Show back button (arrow only)
  const backBtn = document.getElementById('inventoryBackBtn')
  if (backBtn) {
    backBtn.style.display = 'inline-flex'
  }
  subscribeToInventory({ pageToLoad: 1 })
}

/**
 * Get current inventory group filter
 * EXACT COPY of app-core.js line 1949
 * @returns {string|null} Current group filter
 */
export function getInventoryGroupFilter() {
  return appState.inventoryGroupFilter                   // was: return inventoryGroupFilter
}

/**
 * Expand asset group with navigation stack for multi-level expand
 * EXACT COPY of app-core.js lines 1958-1968
 * @param {string} groupKey - Group key to expand
 * @param {array} items - Items in the group
 * @param {function} renderExpandedAsset - Render function callback
 */
export function expandAsset(groupKey, items, renderExpandedAsset) {
  // Push current state to stack before expanding (if we're already in expanded view)
  if (appState.expandedGroupKey) {                       // was: if (expandedGroupKey)
    appState.navigationStack.push({                      // was: navigationStack.push
      key: appState.expandedGroupKey,                    // was: key: expandedGroupKey
      items: appState.expandedGroupItems                 // was: items: expandedGroupItems
    })
  }
  appState.expandedGroupKey = groupKey                   // was: expandedGroupKey = groupKey
  appState.expandedGroupItems = items                    // was: expandedGroupItems = items
  appState.disableGrouping = true                        // was: disableGrouping = true
  document.getElementById('inventoryBackBtn').style.display = 'inline-flex'
  renderExpandedAsset()
}

/**
 * Clear expanded asset state
 * EXACT COPY of app-core.js lines 1970-1995
 * @param {function} renderExpandedAsset - Render function callback
 * @param {function} subscribeToInventory - Subscribe function callback
 */
export function clearExpandedAsset(renderExpandedAsset, subscribeToInventory) {
  // Pop previous state from stack if available
  if (appState.navigationStack.length > 0) {             // was: if (navigationStack.length > 0)
    const prev = appState.navigationStack.pop()          // was: navigationStack.pop()
    appState.expandedGroupKey = prev.key                 // was: expandedGroupKey = prev.key
    appState.expandedGroupItems = prev.items             // was: expandedGroupItems = prev.items
    renderExpandedAsset()
  } else {
    // No more stack - return to grouped view
    appState.expandedGroupKey = null                     // was: expandedGroupKey = null
    appState.expandedGroupItems = []                     // was: expandedGroupItems = []
    appState.disableGrouping = false                     // was: disableGrouping = false
    appState.inventoryGroupFilter = null                 // was: inventoryGroupFilter = null
    document.getElementById('inventoryBackBtn').style.display = 'none'
    subscribeToInventory({ pageToLoad: 1 })
  }
}

/**
 * Get expanded asset key
 * EXACT COPY of app-core.js line 1997
 * @returns {string|null} Current expanded group key
 */
export function getExpandedAsset() {
  return appState.expandedGroupKey                       // was: return expandedGroupKey
}

/**
 * Clear inventory group filter
 * EXACT COPY of app-core.js lines 2000-2007
 * @param {function} subscribeToInventory - Subscribe function callback
 */
export function clearInventoryGroupFilter(subscribeToInventory) {
  appState.inventoryGroupFilter = null                   // was: inventoryGroupFilter = null
  appState.expandedGroupKey = null                       // was: expandedGroupKey = null
  appState.expandedGroupItems = []                       // was: expandedGroupItems = []
  appState.disableGrouping = false                       // was: disableGrouping = false
  appState.navigationStack = []                          // was: navigationStack = []
  document.getElementById('inventoryBackBtn').style.display = 'none'
  subscribeToInventory({ pageToLoad: 1 })
}

/**
 * Get inventory groups cache
 * @returns {Map} Inventory groups cache
 */
export function getInventoryGroupsCache() {
  return appState.inventoryGroupsCache                   // was: return inventoryGroupsCache
}

/**
 * Check if grouping is disabled
 * @returns {boolean} True if grouping is disabled
 */
export function isGroupingDisabled() {
  return appState.disableGrouping                        // was: return disableGrouping
}

/**
 * Get expanded group items
 * @returns {array} Expanded group items
 */
export function getExpandedGroupItems() {
  return appState.expandedGroupItems                     // was: return expandedGroupItems
}

/**
 * Initialize inventory grouping state
 * Call this during app initialization
 */
export function initInventoryGrouping() {
  appState.inventoryGroupFilter = null
  appState.expandedGroupKey = null
  appState.expandedGroupItems = []
  appState.disableGrouping = false
  appState.navigationStack = []
  appState.inventoryGroupsCache = new Map()
}
