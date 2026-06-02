/**
 * Time utilities and auction countdown system
 * @module core/time
 *
 * EXTRACTED FROM: app-core.js lines 29-82
 * DO NOT MODIFY - exact copy of original logic
 */

// ========== AUCTION COUNTDOWN SYSTEM ==========
let countdownInterval = null

/**
 * Format time remaining from timestamp
 * @param {number} endsAt - Unix timestamp in milliseconds
 * @returns {string} Formatted time remaining (e.g., "2d 5h 30m", "3h 24m 15s", "45m 12s", "Ended")
 */
export function formatTimeRemaining(endsAt) {
  if (!endsAt) return '--'
  const now = Date.now()
  const diff = endsAt - now
  if (diff <= 0) return 'Ended'

  const days = Math.floor(diff / (24 * 60 * 60 * 1000))
  const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000))
  const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000))
  const seconds = Math.floor((diff % (60 * 1000)) / 1000)

  if (days > 0) return `${days}d ${hours}h ${minutes}m`
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
  return `${minutes}m ${seconds}s`
}

/**
 * Start auction countdown - updates all visible auction timers every second
 */
export function startAuctionCountdown() {
  if (countdownInterval) return // Already running

  countdownInterval = setInterval(() => {
    const timers = document.querySelectorAll('.mp-timer-value[data-ends-at]')
    if (timers.length === 0) {
      stopAuctionCountdown()
      return
    }

    timers.forEach(timer => {
      const endsAt = parseInt(timer.dataset.endsAt)
      const remaining = endsAt - Date.now()
      timer.textContent = formatTimeRemaining(endsAt)
      // Add ending-soon class if less than 30 minutes
      timer.classList.toggle('ending-soon', remaining > 0 && remaining < 30 * 60 * 1000)
    })
  }, 1000)
}

/**
 * Stop auction countdown
 */
export function stopAuctionCountdown() {
  if (countdownInterval) {
    clearInterval(countdownInterval)
    countdownInterval = null
  }
}

/**
 * Initialize time module and expose to window
 */
export function initTime() {
  window.formatTimeRemaining = formatTimeRemaining
  window.startAuctionCountdown = startAuctionCountdown
  window.stopAuctionCountdown = stopAuctionCountdown
}
