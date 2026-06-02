/**
 * Stats View Rendering
 * @module modules/stats/rendering
 *
 * EXACT COPY of app-core.js stats view rendering functions.
 * Dependencies are passed via init function.
 */

import { appState } from '../../store/appState.js'

// Stats data by period (placeholder until blockchain stats implemented)
const statsByPeriod = {
  '24h': { volume: '1,247.50', sales: '89', avgPrice: '14.02', activeListings: '3,421', change: '+12.5%', changeClass: 'positive' },
  '7d': { volume: '8,932.75', sales: '612', avgPrice: '14.59', activeListings: '3,421', change: '+8.2%', changeClass: 'positive' },
  '30d': { volume: '34,521.00', sales: '2,847', avgPrice: '12.12', activeListings: '3,421', change: '-2.1%', changeClass: 'negative' },
  'All': { volume: '156,789.25', sales: '12,456', avgPrice: '12.59', activeListings: '3,421', change: '+45.3%', changeClass: 'positive' }
}

// Chart data by period
const chartDataByPeriod = {
  '24h': {
    dates: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', '24:00'],
    land: [0.82, 0.84, 0.86, 0.85, 0.88, 0.87, 0.85],
    other: [0.30, 0.31, 0.32, 0.31, 0.33, 0.32, 0.32]
  },
  '7d': {
    dates: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    land: [0.78, 0.80, 0.82, 0.85, 0.83, 0.86, 0.85],
    other: [0.28, 0.29, 0.30, 0.32, 0.31, 0.33, 0.32]
  },
  '30d': {
    dates: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
    land: [0.72, 0.78, 0.82, 0.85],
    other: [0.25, 0.28, 0.30, 0.32]
  },
  'All': {
    dates: ['Q1', 'Q2', 'Q3', 'Q4'],
    land: [0.45, 0.58, 0.72, 0.85],
    other: [0.15, 0.20, 0.26, 0.32]
  }
}

/**
 * Initialize stats rendering
 * (currently no dependencies needed, but kept for consistency)
 */
export function initStatsRendering() {
  // No initialization needed currently
}

/**
 * Load stats view - renders the entire stats dashboard
 * EXACT COPY of app-core.js lines 1945-2184
 */
export function loadStats() {
  const grid = appState.elements.gridContainer
  grid.className = 'mp-card-grid mp-stats-view'
  grid.innerHTML = `
    <div class="mp-stats-dashboard">
      <div class="mp-stats-header">
        <h2 class="mp-stats-title">&#128202; Marketplace Stats</h2>
        <div class="mp-stats-period">
          <button class="mp-stats-period-btn active">24h</button>
          <button class="mp-stats-period-btn">7d</button>
          <button class="mp-stats-period-btn">30d</button>
          <button class="mp-stats-period-btn">All</button>
        </div>
      </div>

      <div class="mp-stats-grid">
        <div class="mp-stat-card">
          <div class="mp-stat-icon">&#128176;</div>
          <div class="mp-stat-value">12,450 OVG</div>
          <div class="mp-stat-label">Total Volume</div>
          <div class="mp-stat-change positive">&#9650; 12.5%</div>
        </div>
        <div class="mp-stat-card">
          <div class="mp-stat-icon">&#128722;</div>
          <div class="mp-stat-value">89</div>
          <div class="mp-stat-label">Sales</div>
          <div class="mp-stat-change positive">&#9650; 8.3%</div>
        </div>
        <div class="mp-stat-card">
          <div class="mp-stat-icon">&#127968;</div>
          <div class="mp-stat-value">0.85 OVG</div>
          <div class="mp-stat-label">Floor Price (Land)</div>
          <div class="mp-stat-change negative">&#9660; 2.1%</div>
        </div>
        <div class="mp-stat-card">
          <div class="mp-stat-icon">&#128100;</div>
          <div class="mp-stat-value">234</div>
          <div class="mp-stat-label">Active Traders</div>
          <div class="mp-stat-change positive">&#9650; 15.2%</div>
        </div>
        <div class="mp-stat-card">
          <div class="mp-stat-icon">&#128081;</div>
          <div class="mp-stat-value">456.8 OVG</div>
          <div class="mp-stat-label">Royalties Paid</div>
          <div class="mp-stat-change positive">&#9650; 22.1%</div>
        </div>
        <div class="mp-stat-card">
          <div class="mp-stat-icon">&#128203;</div>
          <div class="mp-stat-value">1,247</div>
          <div class="mp-stat-label">Active Listings</div>
          <div class="mp-stat-change positive">&#9650; 5.8%</div>
        </div>
      </div>

      <!-- Price Chart Section -->
      <div class="mp-chart-section">
        <div class="mp-chart-header">
          <h4>&#128200; Price Trends</h4>
          <div class="mp-floor-prices">
            <span class="mp-floor-item">Land: <strong>0.85 OVG</strong></span>
            <span class="mp-floor-item">Wearables: <strong>0.32 OVG</strong></span>
          </div>
        </div>
        <div class="mp-chart-container">
          <canvas id="priceChart" class="mp-chart-canvas"></canvas>
        </div>
        <div class="mp-chart-legend">
          <span class="mp-legend-item mp-legend-land">Land</span>
          <span class="mp-legend-item mp-legend-other">Wearables</span>
        </div>
      </div>

      <!-- Recent Transactions -->
      <div class="mp-stats-section">
        <h3 class="mp-stats-section-title">&#128260; Recent Transactions</h3>
        <div class="mp-transactions-list">
          <div class="mp-tx-item">
            <div class="mp-tx-type mp-tx-sale">&#128176;</div>
            <div class="mp-tx-details">
              <div class="mp-tx-main">&#127968; Central Plaza #42 &#8594; 0x7a3f...8c2d</div>
              <div class="mp-tx-time">Block #4,521,089 • 2 min ago</div>
            </div>
            <div class="mp-tx-amount">+2.50 OVG</div>
          </div>
          <div class="mp-tx-item">
            <div class="mp-tx-type mp-tx-royalty">&#128081;</div>
            <div class="mp-tx-details">
              <div class="mp-tx-main">&#127918; Cyber Helmet #156 &#8594; Royalty</div>
              <div class="mp-tx-time">Block #4,521,087 • 5 min ago</div>
            </div>
            <div class="mp-tx-amount mp-tx-amount-royalty">+0.12 OVG</div>
          </div>
          <div class="mp-tx-item">
            <div class="mp-tx-type mp-tx-sale">&#128176;</div>
            <div class="mp-tx-details">
              <div class="mp-tx-main">&#128526; Neon Visor Pro &#8594; 0x2b4c...9f1a</div>
              <div class="mp-tx-time">Block #4,521,082 • 12 min ago</div>
            </div>
            <div class="mp-tx-amount">+0.95 OVG</div>
          </div>
          <div class="mp-tx-item">
            <div class="mp-tx-type mp-tx-rental">&#128260;</div>
            <div class="mp-tx-details">
              <div class="mp-tx-main">&#127968; Beach Plot #7 &#8594; 0x9d2e...4b3c (Rent)</div>
              <div class="mp-tx-time">Block #4,521,075 • 18 min ago</div>
            </div>
            <div class="mp-tx-amount">+0.05 OVG/day</div>
          </div>
          <div class="mp-tx-item">
            <div class="mp-tx-type mp-tx-sale">&#128176;</div>
            <div class="mp-tx-details">
              <div class="mp-tx-main">&#9876;&#65039; Shadow Blade #77 &#8594; 0x5f8a...2e7d</div>
              <div class="mp-tx-time">Block #4,521,068 • 25 min ago</div>
            </div>
            <div class="mp-tx-amount">+1.85 OVG</div>
          </div>
        </div>
      </div>

      <div class="mp-stats-section">
        <h3 class="mp-stats-section-title">&#128293; Trending Items</h3>
        <div class="mp-trending-list">
          <div class="mp-trending-item">
            <div class="mp-trending-rank">1</div>
            <div class="mp-trending-image"><img src="https://picsum.photos/100/100?random=30" alt="" loading="lazy"></div>
            <div class="mp-trending-info">
              <div class="mp-trending-name">Genesis Dragon #001</div>
              <div class="mp-trending-collection">Mythic Beasts</div>
            </div>
            <div class="mp-trending-price">
              <div class="mp-trending-price-value">5.2 OVG</div>
              <div class="mp-trending-price-change">+45% today</div>
            </div>
          </div>
          <div class="mp-trending-item">
            <div class="mp-trending-rank">2</div>
            <div class="mp-trending-image"><img src="https://picsum.photos/100/100?random=31" alt="" loading="lazy"></div>
            <div class="mp-trending-info">
              <div class="mp-trending-name">Central Plaza Plot</div>
              <div class="mp-trending-collection">Prime Locations</div>
            </div>
            <div class="mp-trending-price">
              <div class="mp-trending-price-value">3.8 OVG</div>
              <div class="mp-trending-price-change">+28% today</div>
            </div>
          </div>
          <div class="mp-trending-item">
            <div class="mp-trending-rank">3</div>
            <div class="mp-trending-image"><img src="https://picsum.photos/100/100?random=32" alt="" loading="lazy"></div>
            <div class="mp-trending-info">
              <div class="mp-trending-name">Cyber Armor Set</div>
              <div class="mp-trending-collection">Neon Collection</div>
            </div>
            <div class="mp-trending-price">
              <div class="mp-trending-price-value">1.5 OVG</div>
              <div class="mp-trending-price-change">+22% today</div>
            </div>
          </div>
          <div class="mp-trending-item">
            <div class="mp-trending-rank">4</div>
            <div class="mp-trending-image"><img src="https://picsum.photos/100/100?random=33" alt="" loading="lazy"></div>
            <div class="mp-trending-info">
              <div class="mp-trending-name">Shadow Blade #077</div>
              <div class="mp-trending-collection">Mythic Weapons</div>
            </div>
            <div class="mp-trending-price">
              <div class="mp-trending-price-value">2.1 OVG</div>
              <div class="mp-trending-price-change">+18% today</div>
            </div>
          </div>
          <div class="mp-trending-item">
            <div class="mp-trending-rank">5</div>
            <div class="mp-trending-image"><img src="https://picsum.photos/100/100?random=34" alt="" loading="lazy"></div>
            <div class="mp-trending-info">
              <div class="mp-trending-name">Neon Visor Pro</div>
              <div class="mp-trending-collection">Cyber Tech</div>
            </div>
            <div class="mp-trending-price">
              <div class="mp-trending-price-value">0.95 OVG</div>
              <div class="mp-trending-price-change">+15% today</div>
            </div>
          </div>
        </div>
      </div>

      <div class="mp-stats-section">
        <h3 class="mp-stats-section-title">&#127942; Top Collections</h3>
        <div class="mp-top-collections">
          <div class="mp-top-collection-item">
            <div class="mp-top-collection-rank">1</div>
            <div class="mp-top-collection-info">
              <div class="mp-top-collection-name">Genesis Plaza</div>
              <div class="mp-top-collection-floor">Floor: 0.5 OVG</div>
            </div>
            <div class="mp-top-collection-volume">
              <div class="mp-top-collection-value">1,234 OVG</div>
              <div class="mp-top-collection-change positive">+32%</div>
            </div>
          </div>
          <div class="mp-top-collection-item">
            <div class="mp-top-collection-rank">2</div>
            <div class="mp-top-collection-info">
              <div class="mp-top-collection-name">Mythic Weapons</div>
              <div class="mp-top-collection-floor">Floor: 1.2 OVG</div>
            </div>
            <div class="mp-top-collection-volume">
              <div class="mp-top-collection-value">987 OVG</div>
              <div class="mp-top-collection-change positive">+18%</div>
            </div>
          </div>
          <div class="mp-top-collection-item">
            <div class="mp-top-collection-rank">3</div>
            <div class="mp-top-collection-info">
              <div class="mp-top-collection-name">Prime Estates</div>
              <div class="mp-top-collection-floor">Floor: 2.5 OVG</div>
            </div>
            <div class="mp-top-collection-volume">
              <div class="mp-top-collection-value">756 OVG</div>
              <div class="mp-top-collection-change negative">-5%</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `

  document.getElementById('paginationBar').style.display = 'none'

  // Add event listeners for period buttons
  grid.querySelectorAll('.mp-stats-period-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      grid.querySelectorAll('.mp-stats-period-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      updateStatsForPeriod(btn.textContent.trim())
    })
  })

  // Render price chart
  renderPriceChart()
}

/**
 * Update stats for selected period
 * EXACT COPY of app-core.js lines 2194-2216
 */
export function updateStatsForPeriod(period) {
  const data = statsByPeriod[period]
  if (!data) return

  const grid = appState.elements.gridContainer

  // Update stat values
  const statCards = grid.querySelectorAll('.mp-stat-card')
  if (statCards[0]) {
    statCards[0].querySelector('.mp-stat-value').textContent = data.volume
    const change0 = statCards[0].querySelector('.mp-stat-change')
    if (change0) {
      change0.textContent = data.change
      change0.className = 'mp-stat-change ' + data.changeClass
    }
  }
  if (statCards[1]) statCards[1].querySelector('.mp-stat-value').textContent = data.sales
  if (statCards[2]) statCards[2].querySelector('.mp-stat-value').textContent = data.avgPrice
  if (statCards[3]) statCards[3].querySelector('.mp-stat-value').textContent = data.activeListings

  // Re-render chart with period data
  renderPriceChart(period)
}

/**
 * Render price chart on canvas
 * EXACT COPY of app-core.js lines 2243-2326
 */
export function renderPriceChart(period = '24h') {
  const canvas = document.getElementById('priceChart')
  if (!canvas) return

  const ctx = canvas.getContext('2d')
  const rect = canvas.parentElement.getBoundingClientRect()
  canvas.width = rect.width - 32
  canvas.height = 200

  const width = canvas.width
  const height = canvas.height
  const padding = { top: 20, right: 20, bottom: 30, left: 50 }
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom

  // Get data for selected period
  const chartData = chartDataByPeriod[period] || chartDataByPeriod['24h']
  const { dates, land: landPrices, other: otherPrices } = chartData

  const allPrices = [...landPrices, ...otherPrices]
  const maxPrice = Math.max(...allPrices) * 1.1
  const minPrice = Math.min(...allPrices) * 0.9

  // Clear canvas
  ctx.fillStyle = 'rgba(25, 25, 35, 0.95)'
  ctx.fillRect(0, 0, width, height)

  // Draw grid lines
  ctx.strokeStyle = 'rgba(100, 100, 140, 0.2)'
  ctx.lineWidth = 1

  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (chartHeight * i / 4)
    ctx.beginPath()
    ctx.moveTo(padding.left, y)
    ctx.lineTo(width - padding.right, y)
    ctx.stroke()

    const price = maxPrice - ((maxPrice - minPrice) * i / 4)
    ctx.fillStyle = '#666'
    ctx.font = '10px system-ui'
    ctx.textAlign = 'right'
    ctx.fillText(price.toFixed(2), padding.left - 8, y + 3)
  }

  // Draw lines helper
  const drawLine = (data, color) => {
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.beginPath()

    data.forEach((price, i) => {
      const x = padding.left + (i / Math.max(data.length - 1, 1)) * chartWidth
      const y = padding.top + chartHeight - ((price - minPrice) / (maxPrice - minPrice)) * chartHeight

      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.stroke()

    // Draw points
    data.forEach((price, i) => {
      const x = padding.left + (i / Math.max(data.length - 1, 1)) * chartWidth
      const y = padding.top + chartHeight - ((price - minPrice) / (maxPrice - minPrice)) * chartHeight

      ctx.beginPath()
      ctx.arc(x, y, 4, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
    })
  }

  drawLine(landPrices, '#4ade80')
  drawLine(otherPrices, '#4a9eff')

  // X-axis labels
  ctx.fillStyle = '#666'
  ctx.font = '10px system-ui'
  ctx.textAlign = 'center'
  dates.forEach((date, i) => {
    const x = padding.left + (i / Math.max(dates.length - 1, 1)) * chartWidth
    ctx.fillText(date, x, height - 10)
  })
}
