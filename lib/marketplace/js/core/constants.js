/**
 * Global constants for the marketplace
 * @module core/constants
 */

export const DB_NAME = 'ovgrid-marketplace-db'

export const NO_IMAGE = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect fill="#1a1a24" width="400" height="400"/><text x="200" y="200" text-anchor="middle" fill="#444" font-family="system-ui" font-size="32">No Image</text></svg>`)}`

export const ITEMS_PER_PAGE = 24

export const VIEW_MODE_STORAGE_KEY = `${DB_NAME}_viewModes`

// OVG to USD conversion rate
export const OVG_USD_RATE = 355

// Pagination constants
export const LOCAL_STORAGE_KEY = `${DB_NAME}_paginationState`
export const VIEW_PAGINATION_KEY = `${DB_NAME}_viewPagination`
