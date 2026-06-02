/**
 * Filter state management
 * @module core/filters/state
 *
 * EXTRACTED FROM: app-core.js lines 93-107
 * DO NOT MODIFY - exact copy of original logic
 */

// --- Filter State ---
export const filters = {
  categories: ['land', 'wearables', 'objects', 'collections'],
  types: ['sale', 'rent', 'auction', 'bundle'],
  rarities: ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'],
  listingStatuses: ['unlisted', 'sale', 'rent', 'auction', 'bundle'], // multi-select
  inventoryRarities: ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'], // inventory rarity filter
  listingType: 'all', // 'all', 'sale', 'rent', 'auction', 'bundle' - for filter chips
  showFavoritesOnly: false, // Filter by favorites
  search: '',
  priceMin: null,
  priceMax: null,
  sortField: 'timestamp',
  sortOrder: 'desc'
}

// --- Default filter values (for reset) ---
export const DEFAULT_FILTERS = {
  categories: ['land', 'wearables', 'objects', 'collections'],
  types: ['sale', 'rent', 'auction', 'bundle'],
  rarities: ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'],
  listingStatuses: ['unlisted', 'sale', 'rent', 'auction', 'bundle'],
  inventoryRarities: ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'],
  listingType: 'all',
  showFavoritesOnly: false,
  search: '',
  priceMin: null,
  priceMax: null,
  sortField: 'timestamp',
  sortOrder: 'desc'
}

/**
 * Reset filters to default values
 */
export function resetFilters() {
  Object.assign(filters, DEFAULT_FILTERS)
}
