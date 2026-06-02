/**
 * Collections Rendering
 * @module modules/collections/rendering
 *
 * Creates collection cards and table rows.
 * Uses lazy loading for view functions.
 */

import { appState } from '../../store/appState.js'
import { filters } from '../../core/filters/state.js'
import { generateSparkline, formatNumber } from '../../core/rendering/utils.js'
import { getExploreView } from '../../core/lazy.js'

// Callbacks set via init
let resetPaginationState = null

/**
 * Initialize collections rendering with dependencies
 * @param {object} deps - Dependencies
 * @param {function} deps.resetPaginationState - Reset pagination function
 */
export function initCollectionsRendering(deps) {
  resetPaginationState = deps.resetPaginationState
}

/**
 * Create collection card
 * @param {string} id - Collection ID
 * @param {object} data - Collection data
 * @returns {HTMLElement} Card element
 */
export function createCollectionCard(id, data) {
  const card = document.createElement('div')
  card.className = 'mp-collection-card'
  card.dataset.collectionId = id
  card.innerHTML = `
    <div class="mp-collection-cover">
      <img src="${data.cover || `https://picsum.photos/seed/${id}/400/200`}" alt="${data.name}" loading="lazy">
    </div>
    <div class="mp-collection-info">
      <div class="mp-collection-name">${data.name}</div>
      <div class="mp-collection-creator">by ${data.creator || 'Unknown'}</div>
      <div class="mp-collection-stats">
        <span><span class="mp-collection-stat-value">${data.items || 0}</span> items</span>
        <span>Floor: <span class="mp-collection-stat-value">${data.floor || '0'} OVG</span></span>
      </div>
    </div>
  `
  card.onclick = async () => {
    // Filter explore view by this collection
    filters.search = data.name
    appState.elements.searchInput.value = data.name
    window.switchView('explore')
    resetPaginationState()
    const { loading } = await getExploreView()
    await loading.loadItems({ pageToLoad: 1, append: false })
  }
  return card
}

/**
 * Create collection table row
 * @param {string} id - Collection ID
 * @param {object} data - Collection data
 * @returns {HTMLElement} Row element
 */
export function createCollectionTableRow(id, data) {
  const row = document.createElement('div')
  row.className = 'mp-table-row'
  row.dataset.collectionId = id

  const isFav = window.favoriteCollections?.has(id) || false
  const change = data.change24h || 0
  const changeClass = change > 0 ? 'positive' : change < 0 ? 'negative' : 'neutral'
  const changeSign = change > 0 ? '+' : ''
  const trend7d = data.trend7d || Array.from({ length: 7 }, () => Math.random() * 100)
  const trendPositive = trend7d[trend7d.length - 1] >= trend7d[0]

  const typeIcons = { land: '🌍', wearable: '👕', vehicle: '🚗', building: '🏛️', emote: '💃' }
  const type = data.type || 'wearable'

  row.innerHTML = `
    <div class="mp-table-favorite ${isFav ? 'active' : ''}" onclick="toggleCollectionFavorite('${id}', event)">
      ${isFav ? '★' : '☆'}
    </div>
    <div class="mp-table-collection">
      <div class="mp-table-avatar">
        <img src="${data.cover || `https://picsum.photos/seed/${id}/80/80`}" alt="${data.name}" loading="lazy">
      </div>
      <div class="mp-table-name">
        <span>${data.name || 'Unknown'}</span>
        ${data.verified ? '<span class="mp-table-verified">✓</span>' : ''}
      </div>
    </div>
    <div class="mp-table-cell">
      <span class="mp-table-type ${type}">${typeIcons[type] || '📦'} ${type.charAt(0).toUpperCase() + type.slice(1)}</span>
    </div>
    <div class="mp-table-cell mp-table-price-cell">
      <span class="mp-table-price">${data.floor || '0'} <span class="mp-table-token">OVG</span></span>
    </div>
    <div class="mp-table-cell mp-table-change-cell mp-table-change ${changeClass}">
      ${changeSign}${change.toFixed(1)}%
    </div>
    <div class="mp-table-cell mono right">
      ${data.topOffer ? `${data.topOffer} OVG` : '—'}
    </div>
    <div class="mp-table-cell mono right">
      ${formatNumber(data.volume24h || 0)} OVG
    </div>
    <div class="mp-table-cell mono center">
      ${data.sales24h || 0}
    </div>
    <div class="mp-table-cell mono center">
      ${formatNumber(data.owners || 0)}
    </div>
    <div class="mp-table-cell mono center">
      ${formatNumber(data.supply || data.items || 0)}
    </div>
    <div class="mp-table-cell">
      ${generateSparkline(trend7d, trendPositive)}
    </div>
  `

  row.onclick = async (e) => {
    if (e.target.closest('.mp-table-favorite')) return
    filters.search = data.name
    appState.elements.searchInput.value = data.name
    window.switchView('explore')
    resetPaginationState()
    const { loading } = await getExploreView()
    await loading.loadItems({ pageToLoad: 1, append: false })
  }

  return row
}
