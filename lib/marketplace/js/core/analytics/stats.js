/**
 * Analytics stats module
 * @module core/analytics/stats
 *
 * EXTRACTED FROM: app-core.js (lines 1738-1933)
 * Functions for analytics stats calculation and display
 */

import { getPeriodMs, parsePrice } from '../rendering/utils.js'

// Module state
let db = null
let currentStatsPeriod = '24h'

/**
 * Initialize analytics stats module
 * @param {object} database - GenosDB instance
 */
export function initAnalyticsStats(database) {
  db = database
}

/**
 * Get current stats period
 * @returns {string} Current period
 */
export function getStatsPeriod() {
  return currentStatsPeriod
}

/**
 * Set current stats period
 * @param {string} period - Period to set
 */
export function setStatsPeriod(period) {
  currentStatsPeriod = period
}

/**
 * Calculate stats from GenosDB
 * @param {string} period - '24h', '7d', '30d', 'all'
 * @returns {Promise<object>} Stats object
 */
export async function calculateStats(period) {
  const now = Date.now()
  const periodMs = getPeriodMs(period)
  const cutoff = period === 'all' ? 0 : now - periodMs
  const prevCutoff = period === 'all' ? 0 : cutoff - periodMs

  const { results: allData } = await db.map({ query: {}, $limit: 5000 })

  // Filter activity records (have 'type' field)
  const activities = allData.filter(r => r.value?.type && r.value.timestamp >= cutoff)
  const prevActivities = allData.filter(r => r.value?.type && r.value.timestamp >= prevCutoff && r.value.timestamp < cutoff)

  // Filter assets (for listings and floor price)
  const assets = allData.filter(r => {
    const v = r.value
    return v && !v.type && v.status && v.status !== 'unlisted' && v.status !== 'bundled' && v.status !== 'offer'
  })

  // Calculate current period stats
  const sales = activities.filter(a => a.value.type === 'sale' || a.value.type === 'purchase')
  const volume = sales.reduce((sum, a) => sum + parsePrice(a.value.price), 0)
  const salesCount = sales.length

  // Unique traders
  const traderSet = new Set()
  activities.forEach(a => {
    if (a.value.owner) traderSet.add(a.value.owner)
    if (a.value.buyer) traderSet.add(a.value.buyer)
    if (a.value.seller) traderSet.add(a.value.seller)
  })
  const traders = traderSet.size

  // Floor price
  const listingsWithPrice = assets.filter(a => a.value.priceNum > 0)
  const floor = listingsWithPrice.length > 0
    ? Math.min(...listingsWithPrice.map(a => a.value.priceNum))
    : 0

  // Royalties (5% of volume)
  const royalties = volume * 0.05
  const listings = assets.length

  // Calculate previous period for comparison
  const prevSales = prevActivities.filter(a => a.value.type === 'sale' || a.value.type === 'purchase')
  const prevVolume = prevSales.reduce((sum, a) => sum + parsePrice(a.value.price), 0)
  const prevSalesCount = prevSales.length
  const prevTraderSet = new Set()
  prevActivities.forEach(a => {
    if (a.value.owner) prevTraderSet.add(a.value.owner)
    if (a.value.buyer) prevTraderSet.add(a.value.buyer)
  })
  const prevTraders = prevTraderSet.size
  const prevRoyalties = prevVolume * 0.05

  const calcChange = (current, previous) => {
    if (previous === 0) return current > 0 ? '+100%' : '0%'
    const change = ((current - previous) / previous) * 100
    return (change >= 0 ? '+' : '') + change.toFixed(1) + '%'
  }

  return {
    volume: volume.toFixed(2) + ' OVG',
    sales: salesCount.toString(),
    floor: floor.toFixed(2) + ' OVG',
    traders: traders.toString(),
    royalties: royalties.toFixed(2) + ' OVG',
    listings: listings.toString(),
    changes: [
      calcChange(volume, prevVolume),
      calcChange(salesCount, prevSalesCount),
      calcChange(floor, floor),
      calcChange(traders, prevTraders),
      calcChange(royalties, prevRoyalties),
      calcChange(listings, listings)
    ]
  }
}

/**
 * Load and display stats for period
 * @param {string} period - '24h', '7d', '30d', 'all'
 */
export async function loadAnalyticsStats(period) {
  currentStatsPeriod = period
  const statCards = document.querySelectorAll('.mp-stats-overview-6 .mp-stat-card-mini')
  statCards.forEach(card => {
    const valueEl = card.querySelector('.mp-stat-value')
    if (valueEl) valueEl.textContent = '...'
  })

  try {
    const data = await calculateStats(period)
    const values = [data.volume, data.sales, data.floor, data.traders, data.royalties, data.listings]
    const changes = data.changes

    statCards.forEach((card, i) => {
      const valueEl = card.querySelector('.mp-stat-value')
      const changeEl = card.querySelector('.mp-stat-change')
      if (valueEl) valueEl.textContent = values[i]
      if (changeEl) {
        const isNegative = changes[i].startsWith('-')
        changeEl.textContent = (isNegative ? '▼' : '▲') + ' ' + changes[i].replace(/[+-]/, '')
        changeEl.className = 'mp-stat-change ' + (isNegative ? 'negative' : 'positive')
      }
    })
  } catch (error) {
    statCards.forEach(card => {
      const valueEl = card.querySelector('.mp-stat-value')
      if (valueEl) valueEl.textContent = '0'
    })
  }
}

/**
 * Load trending items from GenosDB
 */
export async function loadAnalyticsTrending() {
  const container = document.getElementById('analyticsTrending')
  if (!container) return

  try {
    const { results } = await db.map({
      query: { status: { $in: ['sale', 'rent', 'auction', 'bundle'] } },
      field: 'views',
      order: 'desc',
      $limit: 50
    })

    if (results.length === 0) {
      container.innerHTML = '<div style="padding:12px;text-align:center;color:var(--mp-text-muted);">No trending items</div>'
      return
    }

    const sorted = results
      .map(r => ({ ...r.value, id: r.id }))
      .sort((a, b) => ((b.views || 0) + (b.likes || 0) * 2) - ((a.views || 0) + (a.likes || 0) * 2))
      .slice(0, 5)

    container.innerHTML = sorted.map((item, i) => {
      const change = Math.floor(Math.random() * 50) + 5
      return `
        <div class="mp-trending-compact-item">
          <span class="mp-trending-compact-rank">${i + 1}</span>
          <img loading="lazy" decoding="async" src="${item.image || `https://picsum.photos/seed/${item.id}/32/32`}" class="mp-trending-compact-img" alt="">
          <span class="mp-trending-compact-name">${item.title || item.name || 'Unknown'}</span>
          <span class="mp-trending-compact-change positive">+${change}%</span>
        </div>
      `
    }).join('')
  } catch (error) {
    container.innerHTML = '<div style="padding:12px;text-align:center;color:var(--mp-text-muted);">Error loading trending</div>'
  }
}

/**
 * Load category stats from GenosDB
 */
export async function loadAnalyticsCategories() {
  const container = document.getElementById('analyticsCategoryStats')
  if (!container) return

  try {
    const { results } = await db.map({
      query: { status: { $in: ['sale', 'rent', 'auction', 'bundle'] } },
      $limit: 1000
    })

    const categories = { land: 0, wearables: 0, objects: 0, collections: 0 }
    results.forEach(r => {
      const cat = r.value?.category
      if (cat && categories[cat] !== undefined) categories[cat]++
    })

    const total = Object.values(categories).reduce((a, b) => a + b, 0) || 1
    const categoryIcons = { land: '&#127968;', wearables: '&#128085;', objects: '&#128230;', collections: '&#128230;' }
    const categoryLabels = { land: 'Land', wearables: 'Wearables', objects: 'Objects', collections: 'Collections' }

    container.innerHTML = Object.entries(categories)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, count]) => {
        const percent = Math.round((count / total) * 100)
        return `
          <div class="mp-category-stat-item">
            <span class="mp-category-name">${categoryIcons[cat]} ${categoryLabels[cat]}</span>
            <div class="mp-category-bar-wrap"><div class="mp-category-bar" style="width: ${percent}%"></div></div>
            <span class="mp-category-percent">${percent}%</span>
          </div>
        `
      }).join('')
  } catch (error) {
    // Keep default content
  }
}
