/**
 * Analytics Wizard
 * View detailed analytics for marketplace activity and stats
 * @module marketplace/wizards/analyticsWizard
 */

import { openModal, closeModal } from '../handlers/modals.js'

const MODAL_ID = 'analyticsModal'
let currentAsset = null
let initialized = false

/**
 * Generate modal HTML template
 * @returns {string} HTML string
 */
export function generateHTML() {
  return `
  <div class="mp-modal-overlay" id="${MODAL_ID}" role="dialog" aria-modal="true">
    <div class="mp-modal mp-modal-lg mp-modal-analytics">
      <div class="mp-modal-header">
        <h2 class="mp-modal-title">&#128202; Analytics</h2>
        <button class="mp-modal-close" onclick="closeModal('${MODAL_ID}')">&times;</button>
      </div>
      <div class="mp-modal-body mp-analytics-modal-body">
        <div class="mp-settings-tabs">
          <button class="mp-settings-tab active" data-analytics-tab="activity">Activity</button>
          <button class="mp-settings-tab" data-analytics-tab="stats">Stats</button>
        </div>

        <!-- Activity Tab -->
        <div class="mp-analytics-tab-content active" data-analytics-content="activity">
          <div class="mp-analytics-controls">
            <div class="mp-activity-mode-toggle">
              <button class="mp-mode-btn active" data-mode="global">
                <span class="mp-mode-icon">&#127760;</span>
                Global
              </button>
              <button class="mp-mode-btn" data-mode="personal">
                <span class="mp-mode-icon">&#128100;</span>
                Personal
              </button>
            </div>
          </div>
          <div class="mp-analytics-list" id="analyticsActivityList">
            <!-- Activity items will be loaded here -->
          </div>
        </div>

        <!-- Stats Tab -->
        <div class="mp-analytics-tab-content" data-analytics-content="stats">
          <div class="mp-analytics-controls">
            <div class="mp-stats-period" id="analyticsStatsPeriod">
              <button class="mp-stats-period-btn active" data-period="24h">24h</button>
              <button class="mp-stats-period-btn" data-period="7d">7d</button>
              <button class="mp-stats-period-btn" data-period="30d">30d</button>
              <button class="mp-stats-period-btn" data-period="all">All</button>
            </div>
          </div>
          <div class="mp-stats-overview mp-stats-overview-6">
            <div class="mp-stat-card mp-stat-card-mini">
              <div class="mp-stat-icon">&#128176;</div>
              <div class="mp-stat-info">
                <div class="mp-stat-value" id="analyticsVolume">12,450 OVG</div>
                <div class="mp-stat-label">Volume</div>
                <div class="mp-stat-change positive">&#9650; 12.5%</div>
              </div>
            </div>
            <div class="mp-stat-card mp-stat-card-mini">
              <div class="mp-stat-icon">&#128722;</div>
              <div class="mp-stat-info">
                <div class="mp-stat-value" id="analyticsSales">89</div>
                <div class="mp-stat-label">Sales</div>
                <div class="mp-stat-change positive">&#9650; 8.3%</div>
              </div>
            </div>
            <div class="mp-stat-card mp-stat-card-mini">
              <div class="mp-stat-icon">&#127968;</div>
              <div class="mp-stat-info">
                <div class="mp-stat-value" id="analyticsFloor">0.85 OVG</div>
                <div class="mp-stat-label">Floor</div>
                <div class="mp-stat-change negative">&#9660; 2.1%</div>
              </div>
            </div>
            <div class="mp-stat-card mp-stat-card-mini">
              <div class="mp-stat-icon">&#128100;</div>
              <div class="mp-stat-info">
                <div class="mp-stat-value" id="analyticsTraders">234</div>
                <div class="mp-stat-label">Traders</div>
                <div class="mp-stat-change positive">&#9650; 15.2%</div>
              </div>
            </div>
            <div class="mp-stat-card mp-stat-card-mini">
              <div class="mp-stat-icon">&#128081;</div>
              <div class="mp-stat-info">
                <div class="mp-stat-value" id="analyticsRoyalties">456.8 OVG</div>
                <div class="mp-stat-label">Royalties</div>
                <div class="mp-stat-change positive">&#9650; 22.1%</div>
              </div>
            </div>
            <div class="mp-stat-card mp-stat-card-mini">
              <div class="mp-stat-icon">&#128203;</div>
              <div class="mp-stat-info">
                <div class="mp-stat-value" id="analyticsListings">1,247</div>
                <div class="mp-stat-label">Listings</div>
                <div class="mp-stat-change positive">&#9650; 5.8%</div>
              </div>
            </div>
          </div>
          <!-- Price Chart -->
          <div class="mp-chart-section mp-modal-chart">
            <div class="mp-chart-header">
              <h4>Price Trends</h4>
              <div class="mp-floor-prices">
                <span class="mp-floor-item">Land: <strong>0.85</strong></span>
                <span class="mp-floor-item">Wearables: <strong>0.32</strong></span>
              </div>
            </div>
            <div class="mp-chart-container">
              <canvas id="modalPriceChart" class="mp-chart-canvas"></canvas>
            </div>
            <div class="mp-chart-legend">
              <span class="mp-legend-item mp-legend-land">Land</span>
              <span class="mp-legend-item mp-legend-other">Wearables</span>
            </div>
          </div>
          <!-- Trending Items -->
          <div class="mp-stats-section">
            <h4 class="mp-stats-section-title">&#128293; Trending</h4>
            <div class="mp-trending-compact" id="analyticsTrending">
              <div style="padding:12px;text-align:center;color:var(--mp-text-muted);">Loading trending...</div>
            </div>
          </div>
          <!-- Top Categories -->
          <div class="mp-stats-section">
            <h4 class="mp-stats-section-title">Top Categories</h4>
            <div class="mp-category-stats" id="analyticsCategoryStats">
              <div style="padding:12px;text-align:center;color:var(--mp-text-muted);">Loading categories...</div>
            </div>
          </div>
        </div>
      </div>
      <div class="mp-modal-footer">
        <button class="mp-btn mp-btn-ghost" onclick="closeModal('${MODAL_ID}')">Close</button>
      </div>
    </div>
  </div>`
}

/**
 * Ensure modal exists in DOM
 */
function ensureModal() {
  if (!initialized && !document.getElementById(MODAL_ID)) {
    const container = document.getElementById('modals-container') || document.body
    container.insertAdjacentHTML('beforeend', generateHTML())
    bindEvents()
    initialized = true
  }
}

/**
 * Bind event listeners
 */
function bindEvents() {
  // Tab switching
  document.querySelectorAll(`#${MODAL_ID} [data-analytics-tab]`).forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.analyticsTab))
  })

  // Activity mode toggle
  document.querySelectorAll(`#${MODAL_ID} .mp-mode-btn`).forEach(btn => {
    btn.addEventListener('click', () => switchActivityMode(btn.dataset.mode))
  })

  // Stats period buttons
  document.querySelectorAll(`#${MODAL_ID} .mp-stats-period-btn`).forEach(btn => {
    btn.addEventListener('click', () => selectStatsPeriod(btn, btn.dataset.period))
  })
}

/**
 * Open analytics wizard
 * @param {object} asset - Optional asset data {id, name, collection}
 */
export function open(asset = null) {
  ensureModal()
  currentAsset = asset

  if (asset) {
    const nameEl = document.getElementById('analyticsAssetName')
    const collectionEl = document.getElementById('analyticsCollection')
    if (nameEl) nameEl.textContent = asset.title || asset.name || 'Unnamed Asset'
    if (collectionEl) collectionEl.textContent = asset.collection || 'Unknown Collection'
    populateAnalytics(asset)
  }

  openModal(MODAL_ID)

  // Load real data from GenosDB after modal opens
  setTimeout(() => {
    if (typeof window.loadAnalyticsActivity === 'function') window.loadAnalyticsActivity()
    if (typeof window.loadAnalyticsStats === 'function') window.loadAnalyticsStats('24h')
    if (typeof window.loadAnalyticsTrending === 'function') window.loadAnalyticsTrending()
    if (typeof window.loadAnalyticsCategories === 'function') window.loadAnalyticsCategories()
    if (typeof window.renderModalPriceChart === 'function') {
      requestAnimationFrame(() => window.renderModalPriceChart('24h'))
    }
  }, 100)
}

/**
 * Close analytics wizard
 */
export function close() {
  currentAsset = null
  closeModal(MODAL_ID)
}

/**
 * Populate analytics data (mock)
 * @param {object} asset - Asset data
 */
function populateAnalytics(asset) {
  const mockData = {
    views: Math.floor(Math.random() * 1000) + 100,
    favorites: Math.floor(Math.random() * 50) + 5,
    offers: Math.floor(Math.random() * 10),
    avgPrice: (Math.random() * 10 + 1).toFixed(2),
    floorPrice: (Math.random() * 5 + 0.5).toFixed(2),
    volume24h: (Math.random() * 100 + 10).toFixed(2),
    volume7d: (Math.random() * 500 + 50).toFixed(2),
    holders: Math.floor(Math.random() * 100) + 10
  }

  const viewsEl = document.getElementById('analyticsViews')
  const favoritesEl = document.getElementById('analyticsFavorites')
  const offersEl = document.getElementById('analyticsOffers')
  const avgPriceEl = document.getElementById('analyticsAvgPrice')
  const floorEl = document.getElementById('analyticsFloor')
  const volume24hEl = document.getElementById('analyticsVolume24h')
  const volume7dEl = document.getElementById('analyticsVolume7d')
  const holdersEl = document.getElementById('analyticsHolders')

  if (viewsEl) viewsEl.textContent = mockData.views.toLocaleString()
  if (favoritesEl) favoritesEl.textContent = mockData.favorites.toLocaleString()
  if (offersEl) offersEl.textContent = mockData.offers
  if (avgPriceEl) avgPriceEl.textContent = `${mockData.avgPrice} OVG`
  if (floorEl) floorEl.textContent = `${mockData.floorPrice} OVG`
  if (volume24hEl) volume24hEl.textContent = `${mockData.volume24h} OVG`
  if (volume7dEl) volume7dEl.textContent = `${mockData.volume7d} OVG`
  if (holdersEl) holdersEl.textContent = mockData.holders.toLocaleString()
}

/**
 * Switch analytics tab
 * @param {string} tab - Tab name ('activity', 'stats')
 */
export function switchTab(tab) {
  document.querySelectorAll(`#${MODAL_ID} [data-analytics-tab]`).forEach(t => {
    t.classList.toggle('active', t.dataset.analyticsTab === tab)
  })
  document.querySelectorAll(`#${MODAL_ID} [data-analytics-content]`).forEach(p => {
    p.classList.toggle('active', p.dataset.analyticsContent === tab)
  })
}

/**
 * Switch activity mode - delegates to app-core for data loading
 * @param {string} mode - Mode ('global', 'personal')
 */
export function switchActivityMode(mode) {
  document.querySelectorAll(`#${MODAL_ID} .mp-mode-btn`).forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode)
  })
  // Delegate to app-core function if available (loads data from GenosDB)
  if (typeof window.loadAnalyticsActivity === 'function') {
    window.loadAnalyticsActivity(mode)
  }
}

/**
 * Select stats period - delegates to app-core for data loading
 * @param {HTMLElement} btn - Button element
 * @param {string} period - Period ('24h', '7d', '30d', 'all')
 */
export async function selectStatsPeriod(btn, period) {
  document.querySelectorAll(`#${MODAL_ID} .mp-stats-period-btn`).forEach(b => {
    b.classList.remove('active')
  })
  btn.classList.add('active')
  // Delegate to app-core functions if available (loads data from GenosDB)
  if (typeof window.loadAnalyticsStats === 'function') {
    await window.loadAnalyticsStats(period)
  }
  if (typeof window.renderModalPriceChart === 'function') {
    await window.renderModalPriceChart(period)
  }
}

export function init() {
  window.analyticsWizard = { open, close, switchTab, switchActivityMode, selectStatsPeriod, generateHTML }
  window.switchAnalyticsTab = switchTab
  window.switchActivityMode = switchActivityMode
  window.selectStatsPeriod = selectStatsPeriod
}

init()

export default { open, close, switchTab, switchActivityMode, selectStatsPeriod, generateHTML, init }
