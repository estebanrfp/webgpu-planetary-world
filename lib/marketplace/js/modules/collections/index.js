/**
 * Collections Module
 * @module modules/collections
 *
 * Re-exports all collections-related functionality.
 */

export {
  setCollectionsViewMode,
  getCollectionsViewMode,
  initCollectionsViewMode
} from './viewMode.js'

export {
  initCollectionsRendering,
  createCollectionCard,
  createCollectionTableRow
} from './rendering.js'

export {
  favoriteCollections,
  isCollectionFavorite,
  toggleCollectionFavorite,
  getFavoriteCollections,
  setupCollectionFavoritesExports
} from './favorites.js'
