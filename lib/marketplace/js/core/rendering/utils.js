/**
 * Rendering utilities
 * @module core/rendering/utils
 *
 * EXTRACTED FROM: app-core.js (lines 645-708)
 * Sort icons and utility functions for rendering
 */

// Sort icons SVG
export const SORT_ICON_NONE = '<svg class="sort-icon" fill="currentColor" height="12" viewBox="0 -960 960 960" width="12"><path d="M480-80 240-320l57-57 183 183 183-183 57 57L480-80ZM298-584l-58-56 240-240 240 240-58 56-182-182-182 182Z"></path></svg>'
export const SORT_ICON_ASC = '<svg class="sort-icon" fill="currentColor" height="12" viewBox="0 -960 960 960" width="12"><path d="m296-345-56-56 240-240 240 240-56 56-184-184-184 184Z"></path></svg>'
export const SORT_ICON_DESC = '<svg class="sort-icon" fill="currentColor" height="12" viewBox="0 -960 960 960" width="12"><path d="M480-345 240-585l56-56 184 184 184-184 56 56-240 240Z"></path></svg>'

/**
 * Get normalized status from item value
 * @param {object} v - Item value
 * @returns {string} Normalized status
 */
export function getItemStatus(v) {
  return v?.status || (v?.isBundle ? 'bundle' : (v?.listed ? (v?.listingType || 'sale') : 'unlisted'))
}

/**
 * Check if a record is an asset (not activity/settings)
 * Assets have status field, activities have type field
 * @param {object} value - Record value
 * @returns {boolean} True if asset record
 */
export function isAssetRecord(value) {
  if (!value) return false
  if (value.type) return false
  return value.status !== undefined || value.owner !== undefined
}

/**
 * Get period in milliseconds
 * @param {string} period - '24h', '7d', '30d', 'all'
 * @returns {number} Milliseconds
 */
export function getPeriodMs(period) {
  const periods = {
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
    'all': Infinity
  }
  return periods[period] || periods['24h']
}

/**
 * Parse price string to number
 * @param {string|number} price - Price value
 * @returns {number}
 */
export function parsePrice(price) {
  if (typeof price === 'number') return price
  if (!price) return 0
  const match = String(price).match(/[\d.]+/)
  return match ? parseFloat(match[0]) : 0
}

/**
 * Format time ago
 * @param {number} timestamp - Unix timestamp
 * @returns {string}
 */
export function formatTimeAgo(timestamp) {
  const diff = Date.now() - timestamp
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return `${Math.floor(days / 7)}w ago`
}

/**
 * Format large numbers with K/M suffix
 * @param {number} num - Number to format
 * @returns {string}
 */
export function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K'
  return num.toString()
}

/**
 * Get the grouping key for an inventory item
 * Uses tokenId (ERC-1155) to identify all copies of the same asset type
 * Falls back to title+collection for legacy data without tokenId
 * @param {string} id - Item ID
 * @param {object} data - Item data
 * @returns {string} Group key
 */
export function getGroupKey(id, data) {
  // Prefer tokenId (ERC-1155 standard) - identifies ALL copies of same asset
  if (data.tokenId) {
    return `token::${data.tokenId}`
  }
  // Fallback for legacy data: group by title + collection
  const title = (data.title || data.name || '').toLowerCase().trim()
  const collection = (data.collection || '').toLowerCase().trim()
  return `legacy::${title}::${collection}`
}

/**
 * Group inventory items by their token/asset origin
 * @param {Array} items - Array of {id, value} items
 * @returns {Map} Groups map
 */
export function groupInventoryItems(items) {
  const groups = new Map()
  for (const item of items) {
    const key = getGroupKey(item.id, item.value)
    if (!groups.has(key)) {
      groups.set(key, [])
    }
    groups.get(key).push(item)
  }
  return groups
}

// Status badge HTML templates
export const STATUS_BADGES = {
  'auction': '<span class="mp-badge mp-badge-auction">Auction</span>',
  'rent': '<span class="mp-badge mp-badge-rent">Rent</span>',
  'sale': '<span class="mp-badge mp-badge-sale">Sale</span>',
  'bundle': '<span class="mp-badge mp-badge-bundle">Bundle</span>',
  'rare': '<span class="mp-badge mp-badge-rare">Rare</span>',
  'legendary': '<span class="mp-badge mp-badge-legendary">Legendary</span>',
  'unlisted': '<span class="mp-badge mp-badge-unlisted">Unlisted</span>',
  'rented-in': '<span class="mp-badge mp-badge-rented">Rented</span>'
}

/**
 * Get status badge HTML for a given status
 * @param {string} status - Item status
 * @returns {string} Badge HTML
 */
export function getStatusBadge(status) {
  return STATUS_BADGES[status] || STATUS_BADGES['unlisted']
}

/**
 * Get button configuration based on item status
 * @param {string} status - Item status (auction, rent, bundle, sale)
 * @returns {object} { btnText, btnTextFull, btnClass }
 */
export function getButtonConfig(status) {
  const configs = {
    'auction': { btnText: 'Bid', btnTextFull: 'Place Bid', btnClass: 'bid' },
    'rent': { btnText: 'Rent', btnTextFull: 'Rent Now', btnClass: 'rent' },
    'bundle': { btnText: 'Buy', btnTextFull: 'Buy Bundle', btnClass: 'buy' },
    'sale': { btnText: 'Buy', btnTextFull: 'Buy Now', btnClass: 'buy' }
  }
  return configs[status] || configs['sale']
}

/**
 * Check if a string looks like a hash (long hex string)
 * Used to detect and avoid using hash IDs as display titles
 * @param {string} str - String to check
 * @returns {boolean} True if string looks like a hash
 */
export function isHash(str) {
  return str && (str.length > 30 || /^[a-f0-9-]{20,}$/i.test(str))
}

/**
 * Generate SVG sparkline from data points
 * @param {number[]} points - Array of values
 * @param {boolean} isPositive - Determines line color (positive=green, negative=red)
 * @returns {string} SVG markup
 */
export function generateSparkline(points, isPositive) {
  if (!points?.length) return ''
  const width = 80
  const height = 28
  const padding = 2
  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = max - min || 1
  const xStep = (width - padding * 2) / (points.length - 1)

  const pathData = points.map((val, i) => {
    const x = padding + i * xStep
    const y = height - padding - ((val - min) / range) * (height - padding * 2)
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
  }).join(' ')

  return `<svg viewBox="0 0 ${width} ${height}" class="mp-table-sparkline">
    <path d="${pathData}" class="mp-sparkline-path ${isPositive ? 'positive' : 'negative'}"/>
  </svg>`
}
