/**
 * Bid Wizard
 * Place a bid on an auction
 * @module marketplace/wizards/bidWizard
 */

import { openModal, closeModal } from '../handlers/modals.js'
import { closeDetailPanel } from '../handlers/navigation.js'
import { blockchain } from '../services/blockchain.js'
import { showToast } from '../services/toast.js'
import { NO_IMAGE } from '../core/constants.js'

const MODAL_ID = 'bidModal'
let currentAuction = null
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
        <h2 class="mp-modal-title" id="bidModalTitle">Place a Bid</h2>
        <div class="mp-modal-header-right">
          <span class="mp-header-wallet">0x1234...5678 | <strong>156.8 OVG</strong></span>
          <button class="mp-modal-close" onclick="window.bidWizard?.close?.()">&times;</button>
        </div>
      </div>
      <div class="mp-modal-body">
        <div class="mp-asset-preview">
          <div class="mp-asset-preview-image"><img id="bidAssetImage" src="${NO_IMAGE}" alt="Asset"></div>
          <div class="mp-asset-preview-info">
            <div class="mp-asset-preview-collection" id="bidAssetCollection">Metaverse Estates</div>
            <div class="mp-asset-preview-name" id="bidAssetName">Prime Location #089</div>
            <div class="mp-asset-preview-bid">
              <span class="mp-asset-preview-price" id="bidCurrentBid">2.3 OVG</span>
              <span class="mp-asset-preview-time" id="bidTimeLeft">2h 34m left</span>
            </div>
          </div>
        </div>

        <div class="mp-auction-progress">
          <div class="mp-auction-progress-bar">
            <div class="mp-auction-progress-fill" id="bidAuctionProgress" style="width: 65%"></div>
          </div>
          <div class="mp-auction-progress-labels">
            <span>Start: <strong id="bidStartPrice">1.0 OVG</strong></span>
            <span>Reserve: <strong id="bidReservePrice">5.0 OVG</strong></span>
          </div>
        </div>

        <div class="mp-form-group">
          <label class="mp-form-label">Your bid amount</label>
          <div class="mp-input-group">
            <input type="number" class="mp-input" id="bidAuctionAmount" placeholder="0.00" value="2.5">
            <span class="mp-input-addon">OVG</span>
          </div>
          <div class="mp-form-hint">Minimum bid: <span id="bidMinimumAmount">2.35</span> OVG (+2% increment)</div>
          <div class="mp-bid-presets">
            <button type="button" class="mp-bid-preset" data-increment="0.1">+0.1</button>
            <button type="button" class="mp-bid-preset" data-increment="0.5">+0.5</button>
            <button type="button" class="mp-bid-preset" data-increment="1.0">+1.0</button>
            <button type="button" class="mp-bid-preset" data-increment="5.0">+5.0</button>
          </div>
        </div>
      </div>
      <div class="mp-modal-footer mp-modal-footer-duo">
        <button class="mp-btn mp-btn-ghost" onclick="window.bidWizard?.close?.()">Cancel</button>
        <button class="mp-btn mp-btn-cta-bid" id="bidSubmitBtn">Place Bid</button>
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
  document.getElementById('bidSubmitBtn')?.addEventListener('click', submit)
  document.getElementById('bidAuctionAmount')?.addEventListener('input', resetConfirmState)
  document.querySelectorAll(`#${MODAL_ID} .mp-bid-preset`).forEach(btn => {
    btn.addEventListener('click', () => {
      const increment = parseFloat(btn.dataset.increment)
      if (increment) {
        resetConfirmState()
        setIncrement(increment)
      }
    })
  })
}

/**
 * Open bid wizard for an auction
 * @param {object} auction - Auction to bid on
 */
export function open(auction) {
  if (!auction) {
    showToast('error', 'Error', 'No auction data available')
    return
  }

  ensureModal()
  currentAuction = auction
  closeDetailPanel()

  const imageEl = document.getElementById('bidAssetImage')
  const collectionEl = document.getElementById('bidAssetCollection')
  const nameEl = document.getElementById('bidAssetName')
  const currentBidEl = document.getElementById('bidCurrentBid')
  const minBidEl = document.getElementById('bidMinimumAmount')
  const amountInput = document.getElementById('bidAuctionAmount')

  const currentBid = auction.currentBid || auction.minBid || 0
  const minBid = currentBid * 1.02

  const timeLeftEl = document.getElementById('bidTimeLeft')

  if (imageEl) imageEl.src = auction.image || NO_IMAGE
  if (collectionEl) collectionEl.textContent = auction.collection || 'Unknown'
  if (nameEl) nameEl.textContent = auction.title || auction.name || 'Unnamed Asset'
  if (currentBidEl) currentBidEl.textContent = `${currentBid} OVG`
  if (timeLeftEl) {
    // Fallback chain: endsAt > listedAt+3days > timestamp+3days > now+3days
    const endsAt = auction.endsAt || (auction.listedAt ? auction.listedAt + 3 * 24 * 60 * 60 * 1000 : (auction.timestamp ? auction.timestamp + 3 * 24 * 60 * 60 * 1000 : Date.now() + 3 * 24 * 60 * 60 * 1000))
    timeLeftEl.textContent = window.formatTimeRemaining?.(endsAt) || '--'
    timeLeftEl.dataset.endsAt = endsAt
    timeLeftEl.classList.add('mp-timer-value')
  }
  if (minBidEl) minBidEl.textContent = minBid.toFixed(2)
  if (amountInput) amountInput.value = minBid.toFixed(2)

  // Reset confirm state when opening
  resetConfirmState()
  openModal(MODAL_ID)
  amountInput?.focus()
}

/**
 * Close bid wizard
 */
export function close() {
  currentAuction = null
  resetConfirmState()
  closeModal(MODAL_ID)
}

/**
 * Reset confirm button state
 */
function resetConfirmState() {
  confirmMode = false
  const btn = document.getElementById('bidSubmitBtn')
  if (btn) {
    btn.textContent = 'Place Bid'
    btn.classList.remove('mp-btn-warning')
    btn.classList.add('mp-btn-cta-bid')
  }
}

/**
 * Set bid increment
 * @param {number} increment - Amount to add to current bid
 */
export function setIncrement(increment) {
  const amountInput = document.getElementById('bidAuctionAmount')
  if (!amountInput) return
  const current = parseFloat(amountInput.value) || 0
  amountInput.value = (current + increment).toFixed(2)
}

/**
 * Submit bid (two-step confirmation)
 */
export async function submit() {
  if (!currentAuction) {
    showToast('error', 'Error', 'No auction selected')
    return
  }

  const amountInput = document.getElementById('bidAuctionAmount')
  const amount = parseFloat(amountInput?.value)
  const minBid = (currentAuction.currentBid || currentAuction.minBid || 0) * 1.02

  if (!amount || amount < minBid) {
    showToast('warning', 'Bid Too Low', `Minimum bid is ${minBid.toFixed(2)} OVG`)
    return
  }

  const btn = document.getElementById('bidSubmitBtn')

  // First click: switch to confirm mode
  if (!confirmMode) {
    confirmMode = true
    if (btn) {
      btn.textContent = 'Confirm'
      btn.classList.remove('mp-btn-cta-bid')
      btn.classList.add('mp-btn-warning')
    }
    return
  }

  // Second click: execute bid
  resetConfirmState()
  closeModal(MODAL_ID)

  try {
    await blockchain.placeBid(currentAuction.id, amount)
  } catch (error) {
    // Error toast shown by blockchain.js
  }
}

export function init() {
  window.bidWizard = { open, close, submit, setIncrement, generateHTML }
  window.setBidIncrement = setIncrement
}

init()

export default { open, close, submit, setIncrement, generateHTML, init }
