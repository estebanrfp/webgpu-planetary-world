/**
 * Buy Wizard
 * Purchase an asset directly
 * @module marketplace/wizards/buyWizard
 */

import { openModal, closeModal } from '../handlers/modals.js'
import { closeDetailPanel } from '../handlers/navigation.js'
import { blockchain } from '../services/blockchain.js'
import { showToast } from '../services/toast.js'
import { NO_IMAGE } from '../core/constants.js'

const MODAL_ID = 'buyModal'
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
        <h2 class="mp-modal-title">Complete Purchase</h2>
        <div class="mp-modal-header-right">
          <span class="mp-header-wallet">0x1234...5678 | <strong>156.8 OVG</strong></span>
          <button class="mp-modal-close" onclick="window.buyWizard?.close?.()">&times;</button>
        </div>
      </div>
      <div class="mp-modal-body">
        <div class="mp-asset-preview">
          <div class="mp-asset-preview-image"><img loading="lazy" decoding="async" src="${NO_IMAGE}" alt="Asset" id="buyAssetImage"></div>
          <div class="mp-asset-preview-info">
            <div class="mp-asset-preview-collection" id="buyAssetCollection">Genesis Plaza</div>
            <div class="mp-asset-preview-name" id="buyAssetName">Cyber Dragon Wings #142</div>
          </div>
        </div>

        <div class="mp-form-group mp-hidden" id="buyAmountGroup">
          <label class="mp-form-label">Quantity to buy</label>
          <div class="mp-input-group">
            <input type="number" class="mp-input" id="buyAmountInput" placeholder="1" min="1" value="1">
            <span class="mp-input-addon" id="buyAmountMax">/ 1</span>
          </div>
          <div class="mp-form-hint"><span id="buyAvailableAmount">1</span> available for purchase</div>
        </div>

        <div class="mp-summary" id="buySummary">
          <div class="mp-summary-row"><span class="mp-summary-label">Item Price</span><span class="mp-summary-value" id="buySummaryPrice">0.5 OVG</span></div>
          <div class="mp-summary-row"><span class="mp-summary-label">Service Fee (2.5%)</span><span class="mp-summary-value" id="buySummaryFee">0.0125 OVG</span></div>
          <div class="mp-summary-row"><span class="mp-summary-label">Creator Royalty (5%)</span><span class="mp-summary-value" id="buySummaryRoyalty">0.025 OVG</span></div>
          <div class="mp-summary-row"><span class="mp-summary-label">Listing Duration</span><span class="mp-summary-value" id="buySummaryDuration">30 days</span></div>
          <div class="mp-summary-row"><span class="mp-summary-label">Total</span><span class="mp-summary-value mp-summary-total" id="buySummaryTotal">0.5375 OVG</span></div>
        </div>
      </div>
      <div class="mp-modal-footer">
        <button class="mp-btn mp-btn-ghost mp-btn-flex" onclick="window.buyWizard?.close?.()">Cancel</button>
        <button class="mp-btn mp-btn-cta-offer mp-btn-flex" id="buyOfferBtn">Make Offer</button>
        <button class="mp-btn mp-btn-cta-buy mp-btn-flex" id="buySubmitBtn">Buy Now</button>
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
  document.getElementById('buySubmitBtn')?.addEventListener('click', submit)
  document.getElementById('buyAmountInput')?.addEventListener('input', () => {
    resetConfirmState()
    updateSummary()
  })
}

/**
 * Update price summary based on quantity
 */
export function updateSummary() {
  if (!currentListing) return

  const pricePerUnit = parseFloat(currentListing.price) || 0.5
  const amount = parseInt(document.getElementById('buyAmountInput')?.value) || 1
  const royaltyPct = currentListing.royaltyPct ?? currentListing.royalty ?? 5

  const subtotal = pricePerUnit * amount
  const fee = subtotal * 0.025
  const royalty = subtotal * (royaltyPct / 100)
  const total = subtotal + fee + royalty

  const priceLabel = amount > 1 ? `${pricePerUnit.toFixed(4)} x ${amount} = ${subtotal.toFixed(4)} OVG` : `${subtotal.toFixed(4)} OVG`

  const priceEl = document.getElementById('buySummaryPrice')
  const feeEl = document.getElementById('buySummaryFee')
  const royaltyEl = document.getElementById('buySummaryRoyalty')
  const durationEl = document.getElementById('buySummaryDuration')
  const totalEl = document.getElementById('buySummaryTotal')

  if (priceEl) priceEl.textContent = priceLabel
  if (feeEl) feeEl.textContent = `${fee.toFixed(4)} OVG`
  if (royaltyEl) royaltyEl.textContent = `${royalty.toFixed(4)} OVG`
  if (durationEl) {
    const days = Math.round((currentListing.duration ?? 0) / 86400)
    durationEl.textContent = days ? `${days} days` : 'No limit'
  }
  if (totalEl) totalEl.textContent = `${total.toFixed(4)} OVG`
}

/**
 * Open buy wizard for a listing
 * @param {object} listing - Listing to purchase
 */
export function open(listing) {
  if (!listing) {
    showToast('error', 'Error', 'No listing data available')
    return
  }

  ensureModal()
  currentListing = listing
  window.currentBuyListing = listing
  closeDetailPanel()

  const imageEl = document.getElementById('buyAssetImage')
  const collectionEl = document.getElementById('buyAssetCollection')
  const nameEl = document.getElementById('buyAssetName')

  if (imageEl) imageEl.src = listing.image || NO_IMAGE
  if (collectionEl) collectionEl.textContent = listing.collection || 'Unknown'
  if (nameEl) nameEl.textContent = listing.title || listing.name || 'Unnamed Asset'

  // Show/hide quantity selector based on supply (ERC-1155)
  // In the new model, listing.supply = quantity available for sale
  const availableQty = listing.supply || 1
  const amountGroup = document.getElementById('buyAmountGroup')
  const amountInput = document.getElementById('buyAmountInput')
  const amountMax = document.getElementById('buyAmountMax')
  const availableAmount = document.getElementById('buyAvailableAmount')

  if (availableQty > 1) {
    amountGroup?.classList.remove('mp-hidden')
    if (amountInput) {
      amountInput.value = 1
      amountInput.max = availableQty
    }
    if (amountMax) amountMax.textContent = `/ ${availableQty}`
    if (availableAmount) availableAmount.textContent = availableQty
  } else {
    amountGroup?.classList.add('mp-hidden')
    if (amountInput) amountInput.value = 1
  }

  // Reset confirm state when opening
  resetConfirmState()
  updateSummary()

  // Check if user already has a pending offer on this asset
  const offerBtn = document.getElementById('buyOfferBtn')
  if (offerBtn) {
    const hasPendingOffer = window.pendingOfferAssets?.has(listing.tokenId) ?? false

    offerBtn.disabled = hasPendingOffer
    offerBtn.textContent = hasPendingOffer ? 'Offer Pending' : 'Make Offer'
    offerBtn.classList.toggle('mp-btn-disabled', hasPendingOffer)
    offerBtn.onclick = hasPendingOffer
      ? null
      : () => { closeModal(MODAL_ID); window.wizards?.offer?.(window.currentBuyListing) }
  }

  openModal(MODAL_ID)
}

/**
 * Close buy wizard
 */
export function close() {
  currentListing = null
  window.currentBuyListing = null
  resetConfirmState()
  closeModal(MODAL_ID)
}

/**
 * Reset confirm button state
 */
function resetConfirmState() {
  confirmMode = false
  const btn = document.getElementById('buySubmitBtn')
  if (btn) {
    btn.textContent = 'Buy Now'
    btn.classList.remove('mp-btn-warning')
    btn.classList.add('mp-btn-cta-buy')
  }
}

/**
 * Submit purchase (two-step confirmation)
 */
export async function submit() {
  if (!currentListing) {
    showToast('error', 'Error', 'No listing selected')
    return
  }

  const btn = document.getElementById('buySubmitBtn')

  // First click: switch to confirm mode
  if (!confirmMode) {
    confirmMode = true
    if (btn) {
      btn.textContent = 'Confirm'
      btn.classList.remove('mp-btn-cta-buy')
      btn.classList.add('mp-btn-warning')
    }
    return
  }

  // Second click: execute purchase
  const amount = parseInt(document.getElementById('buyAmountInput')?.value) || 1

  resetConfirmState()
  closeModal(MODAL_ID)

  try {
    await blockchain.buy(currentListing.id, currentListing.price, amount)
  } catch (error) {
    // Error toast shown by blockchain.js
  }
}

export function init() {
  window.buyWizard = { open, close, submit, generateHTML }
}

init()

export default { open, close, submit, generateHTML, init }
