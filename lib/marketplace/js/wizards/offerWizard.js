/**
 * Offer Wizard
 * Make an offer on a listed asset
 * @module marketplace/wizards/offerWizard
 */

import { openModal, closeModal } from '../handlers/modals.js'
import { closeDetailPanel } from '../handlers/navigation.js'
import { blockchain } from '../services/blockchain.js'
import { showToast } from '../services/toast.js'
import { NO_IMAGE } from '../core/constants.js'

const MODAL_ID = 'offerModal'
let currentListing = null
let initialized = false
let confirmMode = false

/**
 * Generate modal HTML template
 * @returns {string} HTML string
 */
export function generateHTML() {
  return `
  <div class="mp-modal-overlay" id="${MODAL_ID}" role="dialog" aria-modal="true">
    <div class="mp-modal">
      <div class="mp-modal-header">
        <h2 class="mp-modal-title">Make an Offer</h2>
        <div class="mp-modal-header-right">
          <span class="mp-header-wallet">0x1234...5678 | <strong>156.8 OVG</strong></span>
          <button class="mp-modal-close" onclick="window.offerWizard?.close?.()">&times;</button>
        </div>
      </div>
      <div class="mp-modal-body">
        <div class="mp-asset-preview">
          <div class="mp-asset-preview-image"><img loading="lazy" decoding="async" src="${NO_IMAGE}" alt="Asset" id="offerItemImage"></div>
          <div class="mp-asset-preview-info">
            <div class="mp-asset-preview-collection" id="offerItemCollection">Genesis Plaza</div>
            <div class="mp-asset-preview-name" id="offerItemName">Cyber Dragon Wings #142</div>
            <div class="mp-asset-preview-price" id="offerListedPrice">3.5 OVG</div>
          </div>
        </div>

        <div class="mp-form-group">
          <label class="mp-form-label">Your offer amount</label>
          <div class="mp-input-group">
            <input type="number" class="mp-input" id="offerAmount" placeholder="0.00" value="3.0">
            <span class="mp-input-addon">OVG</span>
          </div>
          <div class="mp-form-hint">Offers below listed price may be ignored by the seller</div>
        </div>

        <div class="mp-form-group">
          <div class="mp-duration-pills mp-duration-pills-5" id="offerExpiryPills">
            <button type="button" class="mp-duration-pill" data-days="1">
              <span class="mp-pill-days">1 day</span>
            </button>
            <button type="button" class="mp-duration-pill active" data-days="3">
              <span class="mp-pill-badge popular">Popular</span>
              <span class="mp-pill-days">3 days</span>
            </button>
            <button type="button" class="mp-duration-pill" data-days="7">
              <span class="mp-pill-days">7 days</span>
            </button>
            <button type="button" class="mp-duration-pill" data-days="14">
              <span class="mp-pill-days">14 days</span>
            </button>
            <button type="button" class="mp-duration-pill" data-days="30">
              <span class="mp-pill-days">30 days</span>
            </button>
          </div>
        </div>

        <div class="mp-summary" id="offerSummary">
          <div class="mp-summary-row"><span class="mp-summary-label">Offer Amount</span><span class="mp-summary-value" id="offerSummaryAmount">3.0 OVG</span></div>
          <div class="mp-summary-row"><span class="mp-summary-label">Escrow Lock</span><span class="mp-summary-value">Until accepted or withdrawn</span></div>
          <div class="mp-summary-row"><span class="mp-summary-label">Savings vs Listed</span><span class="mp-summary-value" id="offerSavings">0.5 OVG (14%)</span></div>
        </div>
      </div>
      <div class="mp-modal-footer mp-modal-footer-duo">
        <button class="mp-btn mp-btn-ghost" onclick="window.offerWizard?.close?.()">Cancel</button>
        <button class="mp-btn mp-btn-purple" id="offerSubmitBtn">Submit Offer</button>
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
  document.getElementById('offerAmount')?.addEventListener('input', () => {
    resetConfirmState()
    updateSummary()
  })
  document.getElementById('offerSubmitBtn')?.addEventListener('click', submit)

  // Expiry pills click handlers
  document.getElementById('offerExpiryPills')?.addEventListener('click', (e) => {
    const pill = e.target.closest('.mp-duration-pill')
    if (!pill) return

    // Update active state
    document.querySelectorAll('#offerExpiryPills .mp-duration-pill').forEach(p => p.classList.remove('active'))
    pill.classList.add('active')

    // Reset confirm state when changing selection
    resetConfirmState()
  })
}

/**
 * Update offer summary
 */
export function updateSummary() {
  const amountInput = document.getElementById('offerAmount')
  const summaryEl = document.getElementById('offerSummaryAmount')
  const savingsEl = document.getElementById('offerSavings')

  if (!currentListing || !amountInput) return

  const offer = parseFloat(amountInput.value) || 0
  const listed = parseFloat(currentListing.price) || 0
  const savings = listed - offer
  const savingsPct = listed > 0 ? (savings / listed * 100).toFixed(0) : 0

  if (summaryEl) summaryEl.textContent = `${offer.toFixed(2)} OVG`
  if (savingsEl) {
    savingsEl.textContent = savings > 0
      ? `${savings.toFixed(2)} OVG (${savingsPct}%)`
      : '0 OVG'
  }
}

/**
 * Check if user already has a pending offer on this asset
 * @param {object} listing - Listing data
 * @returns {boolean} Whether user has a pending offer
 */
function hasPendingOffer(listing) {
  return listing.tokenId ? (window.pendingOfferAssets?.has(listing.tokenId) ?? false) : false
}

/**
 * Open offer wizard for a listing
 * @param {object} listing - Listing to make offer on
 */
export function open(listing) {
  if (!listing) {
    showToast('error', 'Error', 'No listing data available')
    return
  }

  ensureModal()
  currentListing = listing
  closeDetailPanel()

  const imageEl = document.getElementById('offerItemImage')
  const collectionEl = document.getElementById('offerItemCollection')
  const nameEl = document.getElementById('offerItemName')
  const listedPriceEl = document.getElementById('offerListedPrice')
  const amountInput = document.getElementById('offerAmount')
  const submitBtn = document.getElementById('offerSubmitBtn')

  if (imageEl) imageEl.src = listing.image || NO_IMAGE
  if (collectionEl) collectionEl.textContent = listing.collection || 'Unknown'
  if (nameEl) nameEl.textContent = listing.title || listing.name || 'Unnamed Asset'
  if (listedPriceEl) listedPriceEl.textContent = `${listing.price} OVG`

  // Check for existing pending offer
  const pending = hasPendingOffer(listing)

  if (pending) {
    if (amountInput) {
      amountInput.disabled = true
    }
    if (submitBtn) {
      submitBtn.textContent = 'Offer Pending'
      submitBtn.disabled = true
      submitBtn.classList.remove('mp-btn-purple', 'mp-btn-warning')
      submitBtn.classList.add('mp-btn-ghost')
    }
  } else {
    if (amountInput) {
      amountInput.value = (parseFloat(listing.price) * 0.9).toFixed(2)
      amountInput.disabled = false
    }
    resetConfirmState()
  }

  updateSummary()
  openModal(MODAL_ID)
  if (!pending) amountInput?.focus()
}

/**
 * Close offer wizard and restore default state
 */
export function close() {
  currentListing = null
  resetConfirmState()

  // Restore input/button state (may have been disabled by pending offer)
  const amountInput = document.getElementById('offerAmount')
  const submitBtn = document.getElementById('offerSubmitBtn')
  if (amountInput) amountInput.disabled = false
  if (submitBtn) submitBtn.disabled = false

  closeModal(MODAL_ID)
}

/**
 * Reset confirm button state
 */
function resetConfirmState() {
  confirmMode = false
  const btn = document.getElementById('offerSubmitBtn')
  if (btn) {
    btn.textContent = 'Submit Offer'
    btn.classList.remove('mp-btn-warning')
    btn.classList.add('mp-btn-purple')
  }
}

/**
 * Submit offer (two-step confirmation)
 */
export async function submit() {
  if (!currentListing) {
    showToast('error', 'Error', 'No listing selected')
    return
  }

  const amountInput = document.getElementById('offerAmount')
  const amount = parseFloat(amountInput?.value)

  if (!amount || amount <= 0) {
    showToast('warning', 'Invalid Amount', 'Please enter a valid offer amount')
    return
  }

  const btn = document.getElementById('offerSubmitBtn')

  // First click: switch to confirm mode
  if (!confirmMode) {
    confirmMode = true
    if (btn) {
      btn.textContent = 'Confirm'
      btn.classList.remove('mp-btn-purple')
      btn.classList.add('mp-btn-warning')
    }
    return
  }

  // Second click: execute offer
  resetConfirmState()
  closeModal(MODAL_ID)

  try {
    await blockchain.placeOffer(currentListing.tokenId, amount)
  } catch (error) {
    // Error toast shown by blockchain.js
  }
}

export function init() {
  window.offerWizard = { open, close, submit, updateSummary, generateHTML }
}

init()

export default { open, close, submit, updateSummary, generateHTML, init }
