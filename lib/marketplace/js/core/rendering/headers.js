/**
 * Table headers rendering module
 * @module core/rendering/headers
 *
 * EXTRACTED FROM: app-core.js
 * Functions for generating table headers with sorting support
 */

import { SORT_ICON_NONE, SORT_ICON_ASC, SORT_ICON_DESC } from './utils.js'

/**
 * Create sort icon generator for a specific state
 * @param {object} state - State with sortField and sortOrder
 * @returns {function} Function that returns sort icon for a field
 */
export function createSortIconFn(state) {
  return (field) => {
    if (state?.sortField !== field) return SORT_ICON_NONE
    return state.sortOrder === 'asc' ? SORT_ICON_ASC : SORT_ICON_DESC
  }
}

/**
 * Create sort class generator for a specific state
 * @param {object} state - State with sortField and sortOrder
 * @returns {function} Function that returns sort class for a field
 */
export function createSortClassFn(state) {
  return (field) => {
    if (state?.sortField !== field) return ''
    return state.sortOrder === 'asc' ? ' sort-asc' : ' sort-desc'
  }
}

/**
 * Get explore table header HTML
 * @param {object} filtersState - Filters state with sortField and sortOrder
 * @returns {string} HTML string
 */
export function getExploreTableHeader(filtersState) {
  const getSortIcon = createSortIconFn(filtersState)
  const getSortClass = createSortClassFn(filtersState)

  return `
    <div class="mp-table-header">
      <div class="mp-table-header-cell sortable${getSortClass('title')}" data-sort="title">ITEM ${getSortIcon('title')}</div>
      <div class="mp-table-header-cell sortable${getSortClass('type')}" data-sort="type">TYPE ${getSortIcon('type')}</div>
      <div class="mp-table-header-cell sortable${getSortClass('rarity')}" data-sort="rarity">RARITY ${getSortIcon('rarity')}</div>
      <div class="mp-table-header-cell sortable${getSortClass('supply')}" data-sort="supply">QTY ${getSortIcon('supply')}</div>
      <div class="mp-table-header-cell sortable${getSortClass('priceNum')}" data-sort="priceNum">PRICE ${getSortIcon('priceNum')}</div>
      <div class="mp-table-header-cell sortable${getSortClass('timestamp')}" data-sort="timestamp">LISTED ${getSortIcon('timestamp')}</div>
      <div class="mp-table-header-cell sortable${getSortClass('endsAt')}" data-sort="endsAt">ENDS ${getSortIcon('endsAt')}</div>
      <div class="mp-table-header-cell">ACTION</div>
    </div>
  `
}

/**
 * Get inventory table header HTML
 * @param {object} state - Pagination state with sortField and sortOrder
 * @returns {string} HTML string
 */
export function getInventoryTableHeader(state) {
  const getSortIcon = createSortIconFn(state)
  const getSortClass = createSortClassFn(state)

  return `
    <div class="mp-table-header">
      <div class="mp-table-header-cell sortable${getSortClass('title')}" data-sort="title">ITEM ${getSortIcon('title')}</div>
      <div class="mp-table-header-cell sortable${getSortClass('category')}" data-sort="category">CATEGORY ${getSortIcon('category')}</div>
      <div class="mp-table-header-cell sortable${getSortClass('rarity')}" data-sort="rarity">RARITY ${getSortIcon('rarity')}</div>
      <div class="mp-table-header-cell sortable${getSortClass('supply')}" data-sort="supply">QTY ${getSortIcon('supply')}</div>
      <div class="mp-table-header-cell sortable${getSortClass('listed')}" data-sort="listed">STATUS ${getSortIcon('listed')}</div>
      <div class="mp-table-header-cell">ACTION</div>
    </div>
  `
}

/**
 * Get offers table header HTML
 * @param {object} state - Pagination state with sortField and sortOrder
 * @returns {string} HTML string
 */
export function getOffersTableHeader(state) {
  const getSortIcon = createSortIconFn(state)
  const getSortClass = createSortClassFn(state)

  return `
    <div class="mp-table-header">
      <div class="mp-table-header-cell sortable${getSortClass('assetName')}" data-sort="assetName">ITEM ${getSortIcon('assetName')}</div>
      <div class="mp-table-header-cell sortable${getSortClass('counterparty')}" data-sort="counterparty">ADDRESS ${getSortIcon('counterparty')}</div>
      <div class="mp-table-header-cell sortable${getSortClass('direction')}" data-sort="direction">TYPE ${getSortIcon('direction')}</div>
      <div class="mp-table-header-cell sortable${getSortClass('status')}" data-sort="status">STATUS ${getSortIcon('status')}</div>
      <div class="mp-table-header-cell sortable${getSortClass('price')}" data-sort="price">PRICE ${getSortIcon('price')}</div>
      <div class="mp-table-header-cell sortable${getSortClass('timestamp')}" data-sort="timestamp">OFFERED ${getSortIcon('timestamp')}</div>
      <div class="mp-table-header-cell sortable${getSortClass('expiresIn')}" data-sort="expiresIn">EXPIRES ${getSortIcon('expiresIn')}</div>
      <div class="mp-table-header-cell">ACTION</div>
    </div>
  `
}

/**
 * Get collections table header HTML (static, no sorting state needed)
 * @returns {string} HTML string
 */
export function getCollectionsTableHeader() {
  return `
    <div class="mp-table-header">
      <div class="mp-table-header-cell"></div>
      <div class="mp-table-header-cell active" data-sort="name">COLLECTION <span class="sort-icon">▼</span></div>
      <div class="mp-table-header-cell" data-sort="type">TYPE</div>
      <div class="mp-table-header-cell" data-sort="floor">FLOOR PRICE <span class="sort-icon">↕</span></div>
      <div class="mp-table-header-cell" data-sort="change24h">24H % <span class="sort-icon">↕</span></div>
      <div class="mp-table-header-cell" data-sort="topOffer">TOP OFFER <span class="sort-icon">↕</span></div>
      <div class="mp-table-header-cell" data-sort="volume24h">24H VOL <span class="sort-icon">↕</span></div>
      <div class="mp-table-header-cell" data-sort="sales24h">SALES <span class="sort-icon">↕</span></div>
      <div class="mp-table-header-cell" data-sort="owners">OWNERS <span class="sort-icon">↕</span></div>
      <div class="mp-table-header-cell" data-sort="supply">SUPPLY <span class="sort-icon">↕</span></div>
      <div class="mp-table-header-cell">LAST 7D</div>
    </div>
  `
}
