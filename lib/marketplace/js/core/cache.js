/**
 * Cache management module
 * @module core/cache
 *
 * EXTRACTED FROM: app-core.js
 * Functions for clearing cached data
 */

// Module state
let db = null

/**
 * Initialize cache module
 * @param {object} database - GenosDB instance
 */
export function initCache(database) {
  db = database
}

/**
 * Clear all cached data: GenosDB instances, IndexedDB, and localStorage
 * Shows toast notification on completion
 */
export async function clearAllCache() {
  try {
    // Clear GenosDB instance (all records)
    await db.clear()

    // Clear all IndexedDB databases
    const databases = await indexedDB.databases?.() ?? []
    await Promise.all(
      databases.map(({ name }) =>
        new Promise((resolve, reject) => {
          const request = indexedDB.deleteDatabase(name)
          request.onsuccess = resolve
          request.onerror = reject
        })
      )
    )

    // Clear localStorage
    localStorage.clear()

    // Show success toast
    window.showToast?.('success', 'Cache Cleared', 'All local data has been removed')

    // Reload page after short delay
    setTimeout(() => location.reload(), 1500)
  } catch (error) {
    window.showToast?.('error', 'Error', 'Failed to clear cache')
  }
}
