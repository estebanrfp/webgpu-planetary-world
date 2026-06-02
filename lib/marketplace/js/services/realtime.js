/**
 * Real-time Subscription Service
 * Manages reactive subscriptions to GenosDB for live updates
 * @module marketplace/services/realtime
 */

/** Active subscriptions by view name */
const subscriptions = {
  explore: null,
  inventory: null,
  offers: null,
  activity: null
}

/** Current items in view (for tracking) */
const viewItems = {
  explore: new Map(),
  inventory: new Map(),
  offers: new Map(),
  activity: new Map()
}

/**
 * Get the database instance
 * @returns {object} GenosDB instance
 */
function getDb() {
  return window.db
}

/**
 * Subscribe to explore view (active listings)
 * @param {object} query - Filter query
 * @param {object} options - Sort options { field, order }
 * @param {Function} onAdd - Callback when item added
 * @param {Function} onUpdate - Callback when item updated
 * @param {Function} onRemove - Callback when item removed
 */
export async function subscribeToExplore(query, options = {}, onAdd, onUpdate, onRemove) {
  const db = getDb()
  if (!db) return

  // Cancel previous subscription
  if (subscriptions.explore) {
    subscriptions.explore()
    subscriptions.explore = null
    viewItems.explore.clear()
  }

  const { field = 'timestamp', order = 'desc' } = options

  // Query all assets - filter client-side for real-time sync
  // Both Explore and Inventory use same data source
  const { unsubscribe } = await db.map(
    {
      query: { ...query },
      field,
      order,
      realtime: true
    },
    ({ id, value, action }) => {
      // Normalize status for compatibility
      const status = value?.status || (value?.isBundle ? 'bundle' : (value?.listed ? (value?.listingType || 'sale') : 'unlisted'))
      const isListed = status !== 'unlisted'

      if (action === 'initial' || action === 'added') {
        if (isListed && !viewItems.explore.has(id)) {
          viewItems.explore.set(id, value)
          onAdd?.(id, value)
        }
      } else if (action === 'updated') {
        if (!isListed) {
          viewItems.explore.delete(id)
          onRemove?.(id)
        } else {
          viewItems.explore.set(id, value)
          onUpdate?.(id, value)
        }
      } else if (action === 'removed') {
        viewItems.explore.delete(id)
        onRemove?.(id)
      }
    }
  )

  subscriptions.explore = unsubscribe
  return unsubscribe
}

/**
 * Subscribe to inventory view (user's assets)
 * @param {string} owner - Owner wallet address
 * @param {object} query - Additional filter query
 * @param {object} options - Sort options
 * @param {Function} onAdd - Callback when item added
 * @param {Function} onUpdate - Callback when item updated
 * @param {Function} onRemove - Callback when item removed
 */
export async function subscribeToInventory(owner, query = {}, options = {}, onAdd, onUpdate, onRemove) {
  const db = getDb()
  if (!db) return

  // Cancel previous subscription
  if (subscriptions.inventory) {
    subscriptions.inventory()
    subscriptions.inventory = null
    viewItems.inventory.clear()
  }

  const { field = 'timestamp', order = 'desc' } = options

  const { unsubscribe } = await db.map(
    {
      query: { ...query, owner },
      field,
      order,
      realtime: true
    },
    ({ id, value, action }) => {
      if (action === 'initial' || action === 'added') {
        if (!viewItems.inventory.has(id)) {
          viewItems.inventory.set(id, value)
          onAdd?.(id, value)
        }
      } else if (action === 'updated') {
        // Check if still owned by user
        if (value.owner !== owner) {
          viewItems.inventory.delete(id)
          onRemove?.(id)
        } else {
          viewItems.inventory.set(id, value)
          onUpdate?.(id, value)
        }
      } else if (action === 'removed') {
        viewItems.inventory.delete(id)
        onRemove?.(id)
      }
    }
  )

  subscriptions.inventory = unsubscribe
  return unsubscribe
}

/**
 * Subscribe to offers view
 * Offers are assets with status='offer' (unified model)
 * @param {object} query - Filter query
 * @param {object} options - Sort options
 * @param {Function} onAdd - Callback when item added
 * @param {Function} onUpdate - Callback when item updated
 * @param {Function} onRemove - Callback when item removed
 */
export async function subscribeToOffers(query = {}, options = {}, onAdd, onUpdate, onRemove) {
  const db = getDb()
  if (!db) return

  if (subscriptions.offers) {
    subscriptions.offers()
    subscriptions.offers = null
    viewItems.offers.clear()
  }

  const { field = 'timestamp', order = 'desc' } = options

  const { unsubscribe } = await db.map(
    {
      query: { ...query, status: 'offer' },
      field,
      order,
      realtime: true
    },
    ({ id, value, action }) => {
      if (action === 'initial' || action === 'added') {
        if (!viewItems.offers.has(id)) {
          viewItems.offers.set(id, value)
          onAdd?.(id, value)
        }
      } else if (action === 'updated') {
        viewItems.offers.set(id, value)
        onUpdate?.(id, value)
      } else if (action === 'removed') {
        viewItems.offers.delete(id)
        onRemove?.(id)
      }
    }
  )

  subscriptions.offers = unsubscribe
  return unsubscribe
}

/**
 * Subscribe to activity view
 * @param {object} query - Filter query
 * @param {object} options - Sort options
 * @param {Function} onAdd - Callback when item added
 * @param {Function} onUpdate - Callback when item updated
 * @param {Function} onRemove - Callback when item removed
 */
export async function subscribeToActivity(query = {}, options = {}, onAdd, onUpdate, onRemove) {
  const db = getDb()
  if (!db) return

  if (subscriptions.activity) {
    subscriptions.activity()
    subscriptions.activity = null
    viewItems.activity.clear()
  }

  const { field = 'timestamp', order = 'desc' } = options

  // Activities are identified by having a 'type' field (purchase, sale, bid, etc.)
  const { unsubscribe } = await db.map(
    {
      query: { ...query },
      field,
      order,
      realtime: true
    },
    ({ id, value, action }) => {
      // Only process activity records (have 'type' field)
      if (!value?.type) return

      if (action === 'initial' || action === 'added') {
        if (!viewItems.activity.has(id)) {
          viewItems.activity.set(id, value)
          onAdd?.(id, value)
        }
      } else if (action === 'updated') {
        viewItems.activity.set(id, value)
        onUpdate?.(id, value)
      } else if (action === 'removed') {
        viewItems.activity.delete(id)
        onRemove?.(id)
      }
    }
  )

  subscriptions.activity = unsubscribe
  return unsubscribe
}

/**
 * Unsubscribe from a specific view
 * @param {string} viewName - View to unsubscribe from
 */
export function unsubscribeFrom(viewName) {
  if (subscriptions[viewName]) {
    subscriptions[viewName]()
    subscriptions[viewName] = null
    viewItems[viewName]?.clear()
  }
}

/**
 * Unsubscribe from all views
 */
export function unsubscribeAll() {
  Object.keys(subscriptions).forEach(view => unsubscribeFrom(view))
}

/**
 * Get current items count for a view
 * @param {string} viewName - View name
 * @returns {number} Item count
 */
export function getItemCount(viewName) {
  return viewItems[viewName]?.size || 0
}

/**
 * Check if subscribed to a view
 * @param {string} viewName - View name
 * @returns {boolean} Is subscribed
 */
export function isSubscribed(viewName) {
  return subscriptions[viewName] !== null
}

// Expose to global for debugging
window.realtimeService = {
  subscribeToExplore,
  subscribeToInventory,
  subscribeToOffers,
  subscribeToActivity,
  unsubscribeFrom,
  unsubscribeAll,
  getItemCount,
  isSubscribed
}
