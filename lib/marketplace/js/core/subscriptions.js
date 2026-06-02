/**
 * Realtime subscriptions management
 * @module core/subscriptions
 *
 * EXTRACTED FROM: app-core.js lines 84-135
 * DO NOT MODIFY - exact copy of original logic
 */

import { getDatabase } from './database.js'
import { isAssetRecord } from './rendering/utils.js'

// ========== REALTIME SUBSCRIPTIONS ==========
// Track active subscriptions for each view (stores unsubscribe functions)
export const subscriptions = {
  explore: null,
  inventory: null,
  offers: null,
  activity: null,
  land: null
}

// Track rendered items to avoid duplicates
export const renderedItems = {
  explore: new Set(),
  inventory: new Set(),
  offers: new Set(),
  activity: new Set()
}

/**
 * Cancel subscription for a specific view
 * @param {string} viewName - View name (explore, inventory, offers, activity)
 */
export function cancelSubscription(viewName) {
  if (subscriptions[viewName]) {
    subscriptions[viewName]()
    subscriptions[viewName] = null
  }
  renderedItems[viewName]?.clear()
}

/**
 * Cancel all active subscriptions
 */
export function cancelAllSubscriptions() {
  Object.keys(subscriptions).forEach(cancelSubscription)
}

/**
 * Clear all items of a specific record type from the database
 * @param {string} recordType - Type to clear: 'asset', 'offer', 'activity', 'collection'
 */
export async function clearDataType(recordType) {
  const db = getDatabase()
  const { results } = await db.map({ query: {}, $limit: 9999 })
  const toRemove = results.filter(item => {
    const v = item.value
    if (!v) return false
    if (recordType === 'asset') return isAssetRecord(v) && v.status !== 'offer'
    if (recordType === 'offer') return v.status === 'offer'
    if (recordType === 'activity') return v.type !== undefined
    if (recordType === 'collection') return v.recordType === 'collection'
    return false
  })
  await Promise.all(toRemove.map(item => db.remove(item.id)))
}
