/**
 * Toast Notification Manager
 * 
 * Provides non-blocking visual feedback for user actions.
 * Toasts appear in the top-right corner and auto-dismiss.
 * 
 * @module ToastManager
 */

/**
 * Create the Toast Manager
 * @returns {object} ToastManager API
 */
export const createToastManager = () => {
  let container = null
  let toastIdCounter = 0
  const activeToasts = new Map()

  /**
   * Initialize container if not present
   */
  const ensureContainer = () => {
    if (container) return

    container = document.createElement('div')
    container.id = 'toast-container'
    container.className = 'toast-container'
    document.body.appendChild(container)

    injectStyles()
  }

  /**
   * Inject CSS for toasts
   */
  const injectStyles = () => {
    if (document.getElementById('toast-manager-styles')) return

    const styles = document.createElement('style')
    styles.id = 'toast-manager-styles'
    styles.textContent = `
      .toast-container {
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 10000;
        display: flex;
        flex-direction: column;
        gap: 12px;
        pointer-events: none;
      }

      .toast {
        background: rgba(30, 30, 40, 0.95);
        backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        padding: 14px 18px;
        min-width: 280px;
        max-width: 400px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
        display: flex;
        align-items: center;
        gap: 12px;
        font-size: 14px;
        color: #fff;
        pointer-events: auto;
        animation: toastSlideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      }

      @keyframes toastSlideIn {
        from {
          transform: translateX(120%);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }

      .toast.toast-exit {
        animation: toastSlideOut 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
      }

      @keyframes toastSlideOut {
        from {
          transform: translateX(0);
          opacity: 1;
        }
        to {
          transform: translateX(120%);
          opacity: 0;
        }
      }

      .toast-icon {
        font-size: 20px;
        flex-shrink: 0;
      }

      .toast-content {
        flex: 1;
        line-height: 1.4;
      }

      .toast-close {
        background: none;
        border: none;
        color: #666;
        font-size: 18px;
        cursor: pointer;
        padding: 0;
        line-height: 1;
        transition: color 0.2s;
        flex-shrink: 0;
      }

      .toast-close:hover {
        color: #fff;
      }

      .toast-success {
        border-left: 3px solid #4ade80;
      }

      .toast-error {
        border-left: 3px solid #ef4444;
      }

      .toast-warning {
        border-left: 3px solid #fbbf24;
      }

      .toast-info {
        border-left: 3px solid #4a9eff;
      }
    `
    document.head.appendChild(styles)
  }

  /**
   * Get icon for toast type
   */
  const getIcon = (type) => {
    switch (type) {
      case 'success': return '✓'
      case 'error': return '✕'
      case 'warning': return '⚠'
      case 'info': return 'ℹ'
      default: return '•'
    }
  }

  /**
   * Show a toast notification
   * @param {string} message - Message to display
   * @param {string} type - Type: success, error, warning, info
   * @param {number} duration - Auto-dismiss time in ms (0 = no auto-dismiss)
   * @returns {string} Toast ID
   */
  const show = (message, type = 'info', duration = 4000) => {
    ensureContainer()

    const id = `toast-${toastIdCounter++}`
    const toast = document.createElement('div')
    toast.id = id
    toast.className = `toast toast-${type}`
    toast.innerHTML = `
      <div class="toast-icon">${getIcon(type)}</div>
      <div class="toast-content">${message}</div>
      <button class="toast-close" data-toast-id="${id}">×</button>
    `

    container.appendChild(toast)

    // Bind close button
    toast.querySelector('.toast-close').addEventListener('click', () => {
      dismiss(id)
    })

    // Auto-dismiss
    if (duration > 0) {
      const timer = setTimeout(() => {
        dismiss(id)
      }, duration)
      activeToasts.set(id, { element: toast, timer })
    } else {
      activeToasts.set(id, { element: toast, timer: null })
    }

    return id
  }

  /**
   * Dismiss a toast by ID
   * @param {string} id - Toast ID
   */
  const dismiss = (id) => {
    const toastData = activeToasts.get(id)
    if (!toastData) return

    const { element, timer } = toastData

    // Clear timer if exists
    if (timer) clearTimeout(timer)

    // Trigger exit animation
    element.classList.add('toast-exit')

    // Remove from DOM after animation
    setTimeout(() => {
      element.remove()
      activeToasts.delete(id)
    }, 300)
  }

  /**
   * Clear all active toasts
   */
  const clear = () => {
    activeToasts.forEach((_, id) => dismiss(id))
  }

  return {
    show,
    dismiss,
    clear
  }
}
