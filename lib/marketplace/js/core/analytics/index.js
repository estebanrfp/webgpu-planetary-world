/**
 * Analytics module index
 * @module core/analytics/index
 */

export {
  initAnalyticsActivity,
  getActivityMode,
  loadAnalyticsActivity,
  switchActivityMode,
  renderAnalyticsActivity
} from './activity.js'

export {
  initAnalyticsStats,
  getStatsPeriod,
  setStatsPeriod,
  calculateStats,
  loadAnalyticsStats,
  loadAnalyticsTrending,
  loadAnalyticsCategories
} from './stats.js'

export {
  initAnalyticsChart,
  calculateChartData,
  renderModalPriceChart
} from './chart.js'

export {
  initAnalyticsModalObserver,
  setupAnalyticsModalObserver,
  selectStatsPeriod,
  setupAnalyticsModalExports
} from './modalObserver.js'
