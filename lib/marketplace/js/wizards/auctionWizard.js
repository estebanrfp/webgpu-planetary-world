/**
 * Auction Wizard
 * Create a new auction for an asset
 * @module marketplace/wizards/auctionWizard
 */

import { openModal, closeModal } from '../handlers/modals.js'
import { closeDetailPanel } from '../handlers/navigation.js'
import { blockchain } from '../services/blockchain.js'
import { showToast } from '../services/toast.js'
import { NO_IMAGE } from '../core/constants.js'

const MODAL_ID = 'auctionModal'
let currentAsset = null
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
        <h2 class="mp-modal-title">Create Auction</h2>
        <div class="mp-modal-header-right">
          <span class="mp-header-wallet">0x1234...5678 | <strong>156.8 OVG</strong></span>
          <button class="mp-modal-close" onclick="window.auctionWizard?.close?.()">&times;</button>
        </div>
      </div>
      <div class="mp-modal-body">
        <div class="mp-asset-preview">
          <div class="mp-asset-preview-image"><img loading="lazy" decoding="async" src="${NO_IMAGE}" alt="Asset" id="auctionAssetImage"></div>
          <div class="mp-asset-preview-info">
            <div class="mp-asset-preview-collection" id="auctionAssetCollection">Genesis Plaza</div>
            <div class="mp-asset-preview-name" id="auctionAssetName">Asset Name</div>
          </div>
        </div>

        <div class="mp-form-group">
          <label class="mp-form-label">Starting Bid</label>
          <div class="mp-input-group">
            <input type="number" class="mp-input" id="auctionStartingBid" placeholder="0.00" value="0.5">
            <span class="mp-input-addon">OVG</span>
          </div>
        </div>

        <div class="mp-form-group">
          <label class="mp-form-label">Reserve Price (Optional)</label>
          <div class="mp-input-group">
            <input type="number" class="mp-input" id="auctionReservePrice" placeholder="0.00">
            <span class="mp-input-addon">OVG</span>
          </div>
          <div class="mp-form-hint">Minimum price to sell. Auction won't complete below this.</div>
        </div>

        <div class="mp-form-group">
          <label class="mp-form-label">Duration</label>
          <div class="mp-duration-pills" id="auctionDurationPills">
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
          </div>
        </div>

        <div class="mp-summary" id="auctionSummary">
          <div class="mp-summary-row"><span class="mp-summary-label">Starting Bid</span><span class="mp-summary-value" id="auctionSummaryStart">0.5 OVG</span></div>
          <div class="mp-summary-row"><span class="mp-summary-label">Service Fee (<span class="mp-text-success">2.5%</span>)</span><span class="mp-summary-value" id="auctionSummaryFee">-0.0125 OVG</span></div>
          <div class="mp-summary-row"><span class="mp-summary-label">Creator Royalty (<span id="auctionRoyaltyPct" class="mp-text-success">5%</span>)</span><span class="mp-summary-value" id="auctionSummaryRoyalty">-0.025 OVG</span></div>
          <div class="mp-summary-row"><span class="mp-summary-label">You receive</span><span class="mp-summary-value mp-summary-total" id="auctionSummaryReceive">0.4625 OVG</span></div>
          <div class="mp-summary-row"><span class="mp-summary-label">Duration</span><span class="mp-summary-value" id="auctionSummaryDuration">3 Days</span></div>
          <div class="mp-summary-row"><span class="mp-summary-label">Ends</span><span class="mp-summary-value" id="auctionSummaryEnds">--</span></div>
        </div>
      </div>
      <div class="mp-modal-footer mp-modal-footer-duo">
        <button class="mp-btn mp-btn-ghost" onclick="window.auctionWizard?.close?.()">Cancel</button>
        <button class="mp-btn mp-btn-cta-auction" id="auctionSubmitBtn">Create Auction</button>
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
  document.getElementById('auctionSubmitBtn')?.addEventListener('click', submit)
  document.getElementById('auctionStartingBid')?.addEventListener('input', () => {
    resetConfirmState()
    updateSummary()
  })
  document.getElementById('auctionReservePrice')?.addEventListener('input', resetConfirmState)

  // Duration pills click handlers
  document.getElementById('auctionDurationPills')?.addEventListener('click', (e) => {
    const pill = e.target.closest('.mp-duration-pill')
    if (!pill) return
    document.querySelectorAll('#auctionDurationPills .mp-duration-pill').forEach(p => p.classList.remove('active'))
    pill.classList.add('active')
    resetConfirmState()
    updateSummary()
  })
}

/**
 * Update auction summary with fees calculation
 */
function updateSummary() {
  const startBid = parseFloat(document.getElementById('auctionStartingBid')?.value) || 0
  const selectedPill = document.querySelector('#auctionDurationPills .mp-duration-pill.active')
  const days = parseInt(selectedPill?.dataset.days) || 3

  // Calculate fees
  const rawRoyalty = currentAsset?.royalty
  const royaltyPct = typeof rawRoyalty === 'string' ? parseFloat(rawRoyalty) : (rawRoyalty ?? 5)
  const fee = startBid * 0.025
  const royalty = startBid * (royaltyPct / 100)
  const receive = startBid - fee - royalty

  // Update summary values
  document.getElementById('auctionSummaryStart').textContent = `${startBid.toFixed(4)} OVG`
  document.getElementById('auctionSummaryFee').textContent = `-${fee.toFixed(4)} OVG`
  document.getElementById('auctionRoyaltyPct').textContent = `${royaltyPct}%`
  document.getElementById('auctionSummaryRoyalty').textContent = `-${royalty.toFixed(4)} OVG`
  document.getElementById('auctionSummaryReceive').textContent = `${receive.toFixed(4)} OVG`
  document.getElementById('auctionSummaryDuration').textContent = `${days} Day${days > 1 ? 's' : ''}`

  const endDate = new Date()
  endDate.setDate(endDate.getDate() + days)
  document.getElementById('auctionSummaryEnds').textContent = endDate.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
  })
}

/**
 * Reset confirm button state
 */
function resetConfirmState() {
  confirmMode = false
  const btn = document.getElementById('auctionSubmitBtn')
  if (btn) {
    btn.textContent = 'Create Auction'
    btn.classList.remove('mp-btn-warning')
    btn.classList.add('mp-btn-cta-auction')
  }
}

/**
 * Open auction wizard for an asset
 * @param {object} asset - Asset to auction
 */
export function open(asset) {
  ensureModal()
  currentAsset = asset
  closeDetailPanel()

  const imageEl = document.getElementById('auctionAssetImage')
  const collectionEl = document.getElementById('auctionAssetCollection')
  const nameEl = document.getElementById('auctionAssetName')

  if (imageEl) imageEl.src = asset.image || NO_IMAGE
  if (collectionEl) collectionEl.textContent = asset.collection || 'Unknown'
  if (nameEl) nameEl.textContent = asset.title || asset.name || 'Unnamed Asset'

  resetConfirmState()
  updateSummary()
  openModal(MODAL_ID)
}

/**
 * Close auction wizard
 */
export function close() {
  currentAsset = null
  resetConfirmState()
  closeModal(MODAL_ID)
}

/**
 * Submit auction creation (two-step confirmation)
 */
export async function submit() {
  if (!currentAsset) {
    showToast('error', 'Error', 'No asset selected')
    return
  }

  const startBid = parseFloat(document.getElementById('auctionStartingBid')?.value)
  const reservePrice = parseFloat(document.getElementById('auctionReservePrice')?.value) || 0

  if (!startBid || startBid <= 0) {
    showToast('warning', 'Invalid Starting Bid', 'Please enter a valid starting bid')
    return
  }

  const btn = document.getElementById('auctionSubmitBtn')

  // First click: switch to confirm mode
  if (!confirmMode) {
    confirmMode = true
    if (btn) {
      btn.textContent = 'Confirm'
      btn.classList.remove('mp-btn-cta-auction')
      btn.classList.add('mp-btn-warning')
    }
    return
  }

  // Second click: execute auction creation
  resetConfirmState()
  closeModal(MODAL_ID)

  // Get selected duration in days, convert to hours for blockchain
  const selectedPill = document.querySelector('#auctionDurationPills .mp-duration-pill.active')
  const days = parseInt(selectedPill?.dataset.days) || 3
  const durationHours = days * 24

  try {
    await blockchain.createAuction(currentAsset.id, startBid, reservePrice, durationHours)
  } catch (error) {
    // Error toast shown by blockchain.js
  }
}

export function init() {
  window.auctionWizard = { open, close, submit, generateHTML }
}

init()

export default { open, close, submit, generateHTML, init }
