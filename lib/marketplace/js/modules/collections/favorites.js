/**
 * Collection Favorites Module
 * @module modules/collections/favorites
 *
 * Handles collection favorites persistence and toggle functionality.
 */

const STORAGE_KEY = 'mp-favorite-collections'

/**
 * Set of favorite collection IDs
 * @type {Set<string>}
 */
export const favoriteCollections = new Set(
  JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
)

/**
 * Check if a collection is favorited
 * @param {string} id - Collection ID
 * @returns {boolean}
 */
export function isCollectionFavorite(id) {
  return favoriteCollections.has(id)
}

/**
 * Toggle collection favorite status
 * @param {string} id - Collection ID
 * @param {Event} [event] - Optional click event
 */
export function toggleCollectionFavorite(id, event) {
  event?.stopPropagation()

  if (favoriteCollections.has(id)) {
    favoriteCollections.delete(id)
  } else {
    favoriteCollections.add(id)
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify([...favoriteCollections]))

  // Update UI
  const star = event?.target?.closest('.mp-table-favorite')
  if (star) {
    star.classList.toggle('active')
    star.innerHTML = favoriteCollections.has(id) ? '★' : '☆'
  }
}

/**
 * Get all favorite collection IDs
 * @returns {string[]}
 */
export function getFavoriteCollections() {
  return [...favoriteCollections]
}

/**
 * Setup window exports for collection favorites
 */
export function setupCollectionFavoritesExports() {
  window.favoriteCollections = favoriteCollections
  window.toggleCollectionFavorite = toggleCollectionFavorite
}
