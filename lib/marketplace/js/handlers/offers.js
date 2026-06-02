/**
 * Offers Handlers
 * Accept, withdraw offers with GenosDB integration
 * @module marketplace/handlers/offers
 */

import { showToast } from '../services/toast.js'
import { blockchain } from '../services/blockchain.js'

/**
 * Set button loading state with spinner
 * @param {HTMLElement} btn - Button element
 * @param {boolean} loading - Loading state
 */
function setButtonLoading(btn, loading) {
  if (!btn) return
  if (loading) {
    btn.classList.add('loading')
    btn.dataset.originalHtml = btn.innerHTML
    btn.innerHTML = '<span class="mp-btn-spinner"></span>'
  } else {
    btn.classList.remove('loading')
    if (btn.dataset.originalHtml) btn.innerHTML = btn.dataset.originalHtml
  }
}

/**
 * Animate row removal
 * @param {HTMLElement} element - Row element to animate out
 */
function animateRowRemoval(element) {
  if (!element) return
  element.style.transition = 'all 0.3s ease'
  element.style.opacity = '0'
  element.style.transform = 'translateX(100%)'
  setTimeout(() => element.remove(), 300)
}

/**
 * Accept an offer (seller action - unified model)
 * @param {HTMLElement} offerElement - Offer row element
 * @param {string} offerId - Offer ID (GenosDB hash)
 */
export async function acceptOffer(offerElement, offerId) {
  if (!offerElement || !offerId) return

  const btn = offerElement.querySelector('.accept')
  const allBtns = offerElement.querySelectorAll('.mp-table-action-sm')

  allBtns.forEach(b => b.disabled = true)
  setButtonLoading(btn, true)

  try {
    await blockchain.acceptOffer(offerId)
    // UI update handled by realtime subscription
  } catch (error) {
    showToast('error', 'Error', error.message || 'Failed to accept offer')
    allBtns.forEach(b => b.disabled = false)
    setButtonLoading(btn, false)
  }
}

/**
 * Reject an offer (seller action - unified model)
 * @param {HTMLElement} offerElement - Offer row element
 * @param {string} offerId - Offer ID (GenosDB hash)
 */
export async function rejectOffer(offerElement, offerId) {
  if (!offerElement || !offerId) return

  const btn = offerElement.querySelector('.reject')
  const allBtns = offerElement.querySelectorAll('.mp-table-action-sm')

  allBtns.forEach(b => b.disabled = true)
  setButtonLoading(btn, true)

  try {
    await blockchain.rejectOffer(offerId)
    // UI update handled by realtime subscription
  } catch (error) {
    showToast('error', 'Error', error.message || 'Failed to reject offer')
    allBtns.forEach(b => b.disabled = false)
    setButtonLoading(btn, false)
  }
}

/**
 * Withdraw/cancel an offer (buyer action - unified model)
 * @param {HTMLElement} offerElement - Offer row element
 * @param {string} offerId - Offer ID (GenosDB hash)
 */
export async function withdrawOffer(offerElement, offerId) {
  if (!offerElement || !offerId) return

  const btn = offerElement.querySelector('.withdraw')
  const allBtns = offerElement.querySelectorAll('.mp-table-action-sm')

  allBtns.forEach(b => b.disabled = true)
  setButtonLoading(btn, true)

  try {
    await blockchain.withdrawOffer(offerId)
    // UI update handled by realtime subscription - offer removed
  } catch (error) {
    showToast('error', 'Error', error.message || 'Failed to cancel offer')
    allBtns.forEach(b => b.disabled = false)
    setButtonLoading(btn, false)
  }
}

/**
 * Alias for withdrawOffer
 */
export function cancelOffer(offerElement, offerId) {
  withdrawOffer(offerElement, offerId)
}

/**
 * Initialize offers handlers
 */
export function initOffers() {
  window.acceptOffer = acceptOffer
  window.rejectOffer = rejectOffer
  window.withdrawOffer = withdrawOffer
  window.cancelOffer = cancelOffer
}

export default { initOffers, acceptOffer, rejectOffer, withdrawOffer, cancelOffer }
