/**
 * Modal Handlers
 * Open/close modals, focus trap, loading overlay
 * @module marketplace/handlers/modals
 */

import { store } from '../state/store.js'
import { showToast } from '../services/toast.js'

/** Previous focus element for restoration */
let previousFocusElement = null

/**
 * Open a modal by ID
 * @param {string} modalId - Modal element ID
 */
export function openModal(modalId) {
  const modal = document.getElementById(modalId)
  if (!modal) return

  previousFocusElement = document.activeElement

  // Force reflow for CSS transition when modal is newly inserted
  modal.offsetHeight

  // Use requestAnimationFrame for smooth transition
  requestAnimationFrame(() => {
    modal.classList.add('open')
    store.setState({ activeModal: modalId })

    // Focus first input or button
    const focusable = modal.querySelector('input, button, select, textarea')
    focusable?.focus()
  })
}

/**
 * Close a modal by ID
 * @param {string} modalId - Modal element ID
 */
export function closeModal(modalId) {
  const modal = document.getElementById(modalId)
  modal?.classList.remove('open')
  store.setState({ activeModal: null })

  // Restore focus
  previousFocusElement?.focus()
  previousFocusElement = null
}

/**
 * Show loading overlay
 * @param {string} message - Loading message
 */
export function showLoading(message = 'Processing...') {
  const overlay = document.getElementById('loadingOverlay')
  overlay?.classList.add('active')
  showToast('info', 'Processing', message)
}

/**
 * Hide loading overlay
 */
export function hideLoading() {
  const overlay = document.getElementById('loadingOverlay')
  overlay?.classList.remove('active')
}

/**
 * Initialize modal handlers
 */
export function initModals() {
  // Close buttons
  document.querySelectorAll('[data-action="close-modal"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modalId = btn.closest('.mp-modal-overlay')?.id
      if (modalId) closeModal(modalId)
    })
  })

  // Escape key to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const { activeModal } = store.getState()
      if (activeModal) {
        closeModal(activeModal)
      }
    }
  })

  // Expose to global
  window.openModal = openModal
  window.closeModal = closeModal
  window.showLoading = showLoading
  window.hideLoading = hideLoading
}

export default { initModals, openModal, closeModal, showLoading, hideLoading }
