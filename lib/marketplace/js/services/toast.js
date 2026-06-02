/**
 * Toast Notification Service
 * @module marketplace/services/toast
 */

/** Toast container element */
let toastContainer = null

/** Active toasts with their timeouts */
const activeToasts = new Map()

/** Recent toast keys to prevent duplicates */
const recentKeys = new Map()

/** Max toasts visible at once */
const MAX_TOASTS = 5

/**
 * Get or create toast container
 * @returns {HTMLElement} Toast container
 */
function getContainer() {
  if (!toastContainer || !document.body.contains(toastContainer)) {
    toastContainer = document.getElementById('toastContainer')
    if (!toastContainer) {
      toastContainer = document.createElement('div')
      toastContainer.id = 'toastContainer'
      toastContainer.className = 'mp-toast-container'
      document.body.appendChild(toastContainer)
    }
  }
  return toastContainer
}

/**
 * Show a toast notification
 * @param {string} type - Toast type: 'success', 'error', 'warning', 'info'
 * @param {string} title - Toast title
 * @param {string} message - Toast message
 * @param {number} duration - Duration in ms (0 for persistent)
 * @returns {string} Toast ID
 */
export function showToast(type, title, message, duration = 4000) {
  // Prevent duplicate toasts within 1 second
  const key = `${type}-${title}-${message}`
  if (recentKeys.has(key)) return recentKeys.get(key)

  const container = getContainer()
  const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

  // Limit active toasts - remove oldest if at max
  if (activeToasts.size >= MAX_TOASTS) {
    const oldestId = activeToasts.keys().next().value
    dismissToast(oldestId)
  }

  const toast = document.createElement('div')
  toast.id = id
  toast.className = `mp-toast mp-toast-${type}`
  toast.innerHTML = `
    <div class="mp-toast-icon">${getIcon(type)}</div>
    <div class="mp-toast-content">
      <div class="mp-toast-title">${title}</div>
      <div class="mp-toast-message">${message}</div>
    </div>
    <button class="mp-toast-close">&times;</button>
  `

  // Use event listener instead of inline onclick
  toast.querySelector('.mp-toast-close')?.addEventListener('click', () => dismissToast(id))

  container.appendChild(toast)

  // Store toast and timeout reference
  const timeoutId = duration > 0 ? setTimeout(() => dismissToast(id), duration) : null
  activeToasts.set(id, { element: toast, timeoutId })

  // Track recent key to prevent duplicates
  recentKeys.set(key, id)
  setTimeout(() => recentKeys.delete(key), 1000)

  // Trigger animation
  requestAnimationFrame(() => toast.classList.add('show'))

  return id
}

/**
 * Dismiss a toast
 * @param {string} id - Toast ID
 */
export function dismissToast(id) {
  const data = activeToasts.get(id)
  if (!data) return

  const { element, timeoutId } = data

  // Clear pending timeout
  if (timeoutId) clearTimeout(timeoutId)

  // Remove from map immediately to prevent double dismiss
  activeToasts.delete(id)

  // Animate out
  element.classList.remove('show')
  setTimeout(() => element.remove(), 300)
}

/**
 * Clear all toasts
 */
export function clearToasts() {
  for (const id of activeToasts.keys()) {
    dismissToast(id)
  }
}

/**
 * Get icon for toast type
 * @param {string} type - Toast type
 * @returns {string} Icon HTML
 */
function getIcon(type) {
  const icons = {
    success: '&#10004;',
    error: '&#10006;',
    warning: '&#9888;',
    info: '&#8505;'
  }
  return icons[type] || icons.info
}

// Expose to global
window.showToast = showToast
window.dismissToast = dismissToast
window.clearToasts = clearToasts

export default { showToast, dismissToast, clearToasts }
