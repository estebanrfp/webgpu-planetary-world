/**
 * Analytics Modal Observer Module
 * @module core/analytics/modalObserver
 *
 * Handles the MutationObserver for analytics modal opening
 * and period selection functionality.
 */

// Dependencies injected via init
let loadAnalyticsActivity = null
let loadAnalyticsStats = null
let loadAnalyticsTrending = null
let loadAnalyticsCategories = null
let renderModalPriceChart = null

/**
 * Initialize modal observer with dependencies
 * @param {Object} deps - Dependencies
 */
export function initAnalyticsModalObserver(deps) {
  loadAnalyticsActivity = deps.loadAnalyticsActivity
  loadAnalyticsStats = deps.loadAnalyticsStats
  loadAnalyticsTrending = deps.loadAnalyticsTrending
  loadAnalyticsCategories = deps.loadAnalyticsCategories
  renderModalPriceChart = deps.renderModalPriceChart
}

/**
 * Setup the MutationObserver for analytics modal
 * Loads data when modal opens
 */
export function setupAnalyticsModalObserver() {
  const analyticsModalEl = document.getElementById('analyticsModal')
  if (!analyticsModalEl) return

  const observer = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
      if (mutation.target.classList.contains('open')) {
        loadAnalyticsActivity?.()
        loadAnalyticsStats?.('24h')
        loadAnalyticsTrending?.()
        loadAnalyticsCategories?.()
        // Wait for modal animation and use RAF for reliable rendering
        setTimeout(() => {
          requestAnimationFrame(() => renderModalPriceChart?.('24h'))
        }, 300)
      }
    })
  })
  observer.observe(analyticsModalEl, { attributes: true, attributeFilter: ['class'] })
}

/**
 * Select stats period and update charts
 * @param {HTMLElement} btn - Period button element
 * @param {string} period - Period string (24h, 7d, 30d, etc.)
 */
export async function selectStatsPeriod(btn, period) {
  document.querySelectorAll('#analyticsStatsPeriod .mp-stats-period-btn').forEach(b => b.classList.remove('active'))
  btn.classList.add('active')
  await loadAnalyticsStats?.(period)
  await renderModalPriceChart?.(period)
}

/**
 * Setup window exports for analytics modal
 */
export function setupAnalyticsModalExports() {
  window.selectStatsPeriod = selectStatsPeriod
}
