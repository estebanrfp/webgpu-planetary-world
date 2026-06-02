/**
 * Analytics activity module
 * @module core/analytics/activity
 *
 * EXTRACTED FROM: app-core.js (lines 1727-1818)
 * Functions for analytics activity loading and rendering
 */

import { formatTimeAgo } from '../rendering/utils.js'

// Module state
let db = null
let getCurrentUser = null
let currentActivityMode = 'global'

/**
 * Initialize analytics activity module
 * @param {object} database - GenosDB instance
 * @param {function} getUserFn - Function to get current user
 */
export function initAnalyticsActivity(database, getUserFn) {
  db = database
  getCurrentUser = getUserFn
}

/**
 * Get current activity mode
 * @returns {string} Current mode ('global' or 'personal')
 */
export function getActivityMode() {
  return currentActivityMode
}

/**
 * Load analytics activity with mode filter (Global/Personal)
 * @param {string} mode - 'global' or 'personal'
 */
export async function loadAnalyticsActivity(mode = currentActivityMode) {
  currentActivityMode = mode
  const container = document.getElementById('analyticsActivityList')
  if (!container) return

  container.innerHTML = '<div class="mp-loading" style="padding:20px;text-align:center;color:var(--mp-text-muted);">Loading activity...</div>'

  try {
    // Get activity data (records with 'type' field)
    const { results: allData } = await db.map({
      query: {},
      field: 'timestamp',
      order: 'desc',
      $limit: 500
    })

    // Filter by type field (activity records)
    let results = allData.filter(r => r.value?.type)

    // Apply mode filter
    const currentUser = getCurrentUser?.() || ''
    if (mode === 'personal') {
      results = results.filter(r => {
        const v = r.value
        return v.owner === currentUser ||
               v.buyer === currentUser ||
               v.seller === currentUser ||
               v.from === currentUser ||
               v.to === currentUser
      })
    }

    renderAnalyticsActivity(container, results.slice(0, 50))
  } catch (error) {
    container.innerHTML = '<div class="mp-empty-state" style="padding:20px;text-align:center;color:var(--mp-text-muted);">Error loading activity</div>'
  }
}

/**
 * Switch activity mode (Global/Personal)
 * @param {string} mode - 'global' or 'personal'
 */
export function switchActivityMode(mode) {
  currentActivityMode = mode
  document.querySelectorAll('#analyticsModal .mp-mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode)
  })
  loadAnalyticsActivity(mode)
}

/**
 * Render analytics activity items
 * @param {HTMLElement} container - Container element
 * @param {Array} items - Activity items
 */
export function renderAnalyticsActivity(container, items) {
  if (!items || !items.length) {
    const modeText = currentActivityMode === 'personal' ? 'your' : ''
    container.innerHTML = `<div class="mp-empty-state" style="padding:40px;text-align:center;"><div style="font-size:32px;margin-bottom:8px;">&#128202;</div><div style="color:var(--mp-text-muted);">No ${modeText} activity yet</div></div>`
    return
  }

  const eventLabels = { sale: 'Sold', purchase: 'Bought', listing: 'Listed', bid: 'Bid', transfer: 'Transfer', mint: 'Minted', burn: 'Burned', rental: 'Rented', batch_listing: 'Batch Listed' }
  const eventIcons = { sale: '&#128176;', purchase: '&#128722;', listing: '&#128204;', bid: '&#128200;', transfer: '&#128228;', mint: '&#10024;', burn: '&#128293;', rental: '&#127968;', batch_listing: '&#128203;' }

  container.innerHTML = items.map(item => {
    const data = item.value || item
    const type = data.type || data.eventType || 'sale'
    const icon = eventIcons[type] || '&#128202;'
    const label = eventLabels[type] || 'Traded'
    const iconClass = type
    const imageUrl = data.image || `https://picsum.photos/seed/${data.assetName || 'asset'}/80/80`
    const timeAgo = data.timestamp ? formatTimeAgo(data.timestamp) : 'just now'
    const priceDisplay = data.price || '--'

    return `
      <div class="mp-activity-item">
        <div class="mp-activity-asset">
          <img src="${imageUrl}" alt="${data.assetName}" class="mp-activity-asset-img" loading="lazy">
          <div class="mp-activity-badge ${iconClass}">${icon}</div>
        </div>
        <div class="mp-activity-info">
          <div class="mp-activity-title">${data.assetName || data.title || 'Unknown Asset'}</div>
          <div class="mp-activity-event">
            <span class="mp-activity-label ${iconClass}">${label}</span>
            <span class="mp-activity-subtitle">${data.subtitle || ''}</span>
          </div>
        </div>
        <div class="mp-activity-right">
          <div class="mp-activity-amount ${data.priceClass || ''}">${priceDisplay}</div>
          <div class="mp-activity-time">${timeAgo}</div>
        </div>
      </div>
    `
  }).join('')
}
