/**
 * Analytics chart module
 * @module core/analytics/chart
 *
 * EXTRACTED FROM: app-core.js (lines 1741-1917)
 * Functions for price chart calculation and rendering
 */

import { getPeriodMs, parsePrice } from '../rendering/utils.js'

// Module state
let db = null

/**
 * Initialize analytics chart module
 * @param {object} database - GenosDB instance
 */
export function initAnalyticsChart(database) {
  db = database
}

/**
 * Calculate chart data from GenosDB
 * @param {string} period - '24h', '7d', '30d', 'all'
 * @returns {Promise<object>} Chart data with dates, land, and other arrays
 */
export async function calculateChartData(period) {
  const now = Date.now()
  const periodMs = getPeriodMs(period)
  const cutoff = period === 'all' ? 0 : now - periodMs

  const { results } = await db.map({ query: {}, $limit: 2000 })
  const sales = results.filter(r =>
    r.value?.type === 'sale' || r.value?.type === 'purchase'
  ).filter(r => r.value.timestamp >= cutoff)

  let buckets, labels, effectivePeriodMs
  if (period === '24h') {
    buckets = 7
    labels = ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', '24:00']
    effectivePeriodMs = periodMs
  } else if (period === '7d') {
    buckets = 7
    labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    effectivePeriodMs = periodMs
  } else if (period === '30d') {
    buckets = 4
    labels = ['Week 1', 'Week 2', 'Week 3', 'Week 4']
    effectivePeriodMs = periodMs
  } else {
    // For 'all', use 180 days as effective period for bucket distribution
    buckets = 6
    labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']
    effectivePeriodMs = 180 * 24 * 60 * 60 * 1000
  }

  const bucketSize = effectivePeriodMs / buckets
  const effectiveCutoff = period === 'all' ? now - effectivePeriodMs : cutoff
  const landPrices = new Array(buckets).fill(0)
  const landCounts = new Array(buckets).fill(0)
  const otherPrices = new Array(buckets).fill(0)
  const otherCounts = new Array(buckets).fill(0)

  sales.forEach(s => {
    const v = s.value
    const timeDelta = v.timestamp - effectiveCutoff
    const bucketIndex = Math.max(0, Math.min(Math.floor(timeDelta / bucketSize), buckets - 1))
    if (timeDelta >= 0) {
      const price = parsePrice(v.price)
      if (v.category === 'land') {
        landPrices[bucketIndex] += price
        landCounts[bucketIndex]++
      } else {
        otherPrices[bucketIndex] += price
        otherCounts[bucketIndex]++
      }
    }
  })

  const land = landPrices.map((sum, i) => landCounts[i] > 0 ? sum / landCounts[i] : 0.5 + Math.random() * 0.4)
  const other = otherPrices.map((sum, i) => otherCounts[i] > 0 ? sum / otherCounts[i] : 0.2 + Math.random() * 0.2)

  return { dates: labels, land, other }
}

/**
 * Render price chart in analytics modal
 * @param {string} period - '24h', '7d', '30d', 'all'
 */
export async function renderModalPriceChart(period = '24h') {
  const canvas = document.getElementById('modalPriceChart')
  if (!canvas) return

  const ctx = canvas.getContext('2d')
  const rect = canvas.parentElement.getBoundingClientRect()

  // Ensure minimum valid dimensions
  const minWidth = 200
  canvas.width = Math.max(rect.width - 32, minWidth)
  canvas.height = 160

  const width = canvas.width
  const height = canvas.height
  const padding = { top: 15, right: 15, bottom: 25, left: 40 }
  const chartWidth = Math.max(width - padding.left - padding.right, 100)
  const chartHeight = Math.max(height - padding.top - padding.bottom, 80)

  const chartData = await calculateChartData(period)
  const { dates, land: landPrices, other: otherPrices } = chartData

  const floorEl = document.querySelector('.mp-floor-prices')
  if (floorEl && landPrices.length && otherPrices.length) {
    const landFloor = Math.min(...landPrices.filter(p => p > 0)) || 0
    const otherFloor = Math.min(...otherPrices.filter(p => p > 0)) || 0
    floorEl.innerHTML = `
      <span class="mp-floor-item">Land: <strong>${landFloor.toFixed(2)}</strong></span>
      <span class="mp-floor-item">Wearables: <strong>${otherFloor.toFixed(2)}</strong></span>
    `
  }

  const allPrices = [...landPrices, ...otherPrices].filter(p => p > 0)
  const maxPrice = allPrices.length ? Math.max(...allPrices) * 1.1 : 1
  const minPrice = allPrices.length ? Math.min(...allPrices) * 0.9 : 0

  ctx.fillStyle = 'rgba(25, 25, 35, 0.95)'
  ctx.fillRect(0, 0, width, height)

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)'
  ctx.lineWidth = 1
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (chartHeight * i / 4)
    ctx.beginPath()
    ctx.moveTo(padding.left, y)
    ctx.lineTo(width - padding.right, y)
    ctx.stroke()
  }

  const drawLine = (data, color) => {
    const validData = data.filter(p => p > 0)
    if (validData.length === 0) return

    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.beginPath()
    data.forEach((price, i) => {
      const x = padding.left + (i / Math.max(data.length - 1, 1)) * chartWidth
      const y = padding.top + chartHeight - ((price - minPrice) / (maxPrice - minPrice || 1)) * chartHeight
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.stroke()

    data.forEach((price, i) => {
      const x = padding.left + (i / Math.max(data.length - 1, 1)) * chartWidth
      const y = padding.top + chartHeight - ((price - minPrice) / (maxPrice - minPrice || 1)) * chartHeight
      ctx.beginPath()
      ctx.arc(x, y, 3, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
    })
  }

  drawLine(landPrices, '#6366f1')
  drawLine(otherPrices, '#22c55e')

  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'
  ctx.font = '10px system-ui'
  ctx.textAlign = 'center'
  dates.forEach((date, i) => {
    const x = padding.left + (i / Math.max(dates.length - 1, 1)) * chartWidth
    ctx.fillText(date, x, height - 8)
  })
}
