/**
 * Edit Auction Wizard
 * Edit settings of an existing auction
 * @module marketplace/wizards/editAuctionWizard
 */

import { openModal, closeModal } from '../handlers/modals.js'
import { closeDetailPanel } from '../handlers/navigation.js'
import { blockchain } from '../services/blockchain.js'
import { showToast } from '../services/toast.js'

const MODAL_ID = 'editAuctionModal'
let currentItem = null
let initialized = false
let confirmUpdateMode = false
let confirmCancelMode = false

/**
 * Generate modal HTML template
 * @returns {string} HTML string
 */
export function generateHTML() {
  return `
  <div class="mp-modal-overlay" id="${MODAL_ID}" role="dialog" aria-modal="true">
    <div class="mp-modal">
      <div class="mp-modal-header">
        <h2 class="mp-modal-title">Edit Auction Listing</h2>
        <div class="mp-modal-header-right">
          <span class="mp-header-wallet">0x1234...5678 | <strong>156.8 OVG</strong></span>
          <button class="mp-modal-close" onclick="window.editAuctionWizard?.close?.()">&times;</button>
        </div>
      </div>
      <div class="mp-modal-body">
        <div class="mp-asset-preview">
          <div class="mp-asset-preview-image"><img id="editAuctionAssetImage" src="" alt="Asset"></div>
          <div class="mp-asset-preview-info">
            <div class="mp-asset-preview-collection" id="editAuctionAssetCollection">Collection Name</div>
            <div class="mp-asset-preview-name" id="editAuctionAssetName">Asset Name</div>
          </div>
        </div>

        <div class="mp-form-group">
          <label class="mp-form-label">Reserve Price</label>
          <div class="mp-input-group">
            <input type="number" class="mp-input" id="editAuctionReserveInput" placeholder="0.00" value="2.0" step="0.01">
            <span class="mp-input-addon">OVG</span>
          </div>
          <div class="mp-form-hint">Auction won't complete below this price</div>
        </div>

        <div class="mp-form-group">
          <label class="mp-form-label">Duration</label>
          <div class="mp-duration-pills" id="editAuctionDurationPills">
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

        <div class="mp-summary">
          <div class="mp-summary-row"><span class="mp-summary-label">Current Bid</span><span class="mp-summary-value" id="editAuctionCurrentBid">0.5 OVG</span></div>
          <div class="mp-summary-row"><span class="mp-summary-label">Service Fee (<span class="mp-text-success">2.5%</span>)</span><span class="mp-summary-value" id="editAuctionFee">-0.0125 OVG</span></div>
          <div class="mp-summary-row"><span class="mp-summary-label">Creator Royalty (<span id="editAuctionRoyaltyPct" class="mp-text-success">5%</span>)</span><span class="mp-summary-value" id="editAuctionRoyalty">-0.025 OVG</span></div>
          <div class="mp-summary-row"><span class="mp-summary-label">You receive</span><span class="mp-summary-value mp-summary-total" id="editAuctionReceive">0.4625 OVG</span></div>
          <div class="mp-summary-row"><span class="mp-summary-label">Total Bids</span><span class="mp-summary-value" id="editAuctionTotalBids">5 bids</span></div>
          <div class="mp-summary-row"><span class="mp-summary-label">Highest Bidder</span><span class="mp-summary-value" id="editAuctionHighestBidder">0x7a3d...8f2e</span></div>
        </div>
      </div>
      <div class="mp-modal-footer">
        <button class="mp-btn mp-btn-ghost mp-btn-flex" onclick="window.editAuctionWizard?.close?.()">Cancel</button>
        <button class="mp-btn mp-btn-danger mp-btn-flex" id="editAuctionCancelBtn">Cancel Auction</button>
        <button class="mp-btn mp-btn-primary mp-btn-flex" id="editAuctionSubmitBtn">Update</button>
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
  document.getElementById('editAuctionSubmitBtn')?.addEventListener('click', submit)
  document.getElementById('editAuctionCancelBtn')?.addEventListener('click', cancelAuction)
  document.getElementById('editAuctionReserveInput')?.addEventListener('input', resetConfirmState)

  // Duration pills click handlers
  document.getElementById('editAuctionDurationPills')?.addEventListener('click', (e) => {
    const pill = e.target.closest('.mp-duration-pill')
    if (!pill) return
    document.querySelectorAll('#editAuctionDurationPills .mp-duration-pill').forEach(p => p.classList.remove('active'))
    pill.classList.add('active')
    resetConfirmState()
  })
}

/**
 * Open edit auction wizard for a listing
 * @param {object} itemData - Listing data {id, title, collection, image, currentBid, timeLeft}
 */
export function open(itemData) {
  ensureModal()
  currentItem = itemData
  closeDetailPanel()

  const { id, title, name, collection, image, currentBid, price, startingBid, totalBids, highestBidder, royalty, reserve, duration } = itemData

  // Parse values - handle strings like "1.5 OVG"
  const numericStarting = typeof startingBid === 'string' ? parseFloat(startingBid) : (startingBid || 0.5)
  const numericReserve = typeof reserve === 'string' ? parseFloat(reserve) : (reserve || 0)
  const numericRoyalty = typeof royalty === 'string' ? parseFloat(royalty) : (royalty || 5)

  document.getElementById('editAuctionAssetImage').src = image || ''
  document.getElementById('editAuctionAssetCollection').textContent = collection || 'Unknown'
  document.getElementById('editAuctionAssetName').textContent = title || name || 'Untitled'
  document.getElementById('editAuctionReserveInput').value = numericReserve || ''

  // Calculate fees based on current bid (or starting bid if no bids)
  const numericCurrent = typeof currentBid === 'string' ? parseFloat(currentBid) : (currentBid || numericStarting)
  const fee = numericCurrent * 0.025
  const royaltyAmount = numericCurrent * (numericRoyalty / 100)
  const receive = numericCurrent - fee - royaltyAmount

  document.getElementById('editAuctionCurrentBid').textContent = `${numericCurrent.toFixed(4)} OVG`
  document.getElementById('editAuctionFee').textContent = `-${fee.toFixed(4)} OVG`
  document.getElementById('editAuctionRoyaltyPct').textContent = `${numericRoyalty}%`
  document.getElementById('editAuctionRoyalty').textContent = `-${royaltyAmount.toFixed(4)} OVG`
  document.getElementById('editAuctionReceive').textContent = `${receive.toFixed(4)} OVG`
  document.getElementById('editAuctionTotalBids').textContent = `${totalBids || 0} bids`
  document.getElementById('editAuctionHighestBidder').textContent = highestBidder || 'No bids yet'

  // Set duration pill (GenosDB stores seconds, pills use days)
  const currentDurationDays = Math.round((duration ?? 0) / 86400) || 3
  document.querySelectorAll('#editAuctionDurationPills .mp-duration-pill').forEach(p => {
    p.classList.toggle('active', parseInt(p.dataset.days) === currentDurationDays)
  })

  // Reset confirm state when opening
  resetConfirmState()
  openModal(MODAL_ID)
}

/**
 * Close edit auction wizard
 */
export function close() {
  currentItem = null
  resetConfirmState()
  closeModal(MODAL_ID)
}

/**
 * Reset confirm button states
 */
function resetConfirmState() {
  confirmUpdateMode = false
  confirmCancelMode = false
  const updateBtn = document.getElementById('editAuctionSubmitBtn')
  const cancelBtn = document.getElementById('editAuctionCancelBtn')
  if (updateBtn) {
    updateBtn.textContent = 'Update'
    updateBtn.classList.remove('mp-btn-warning')
    updateBtn.classList.add('mp-btn-primary')
  }
  if (cancelBtn) {
    cancelBtn.textContent = 'Cancel Auction'
    cancelBtn.classList.remove('mp-btn-warning')
    cancelBtn.classList.add('mp-btn-danger')
  }
}

/**
 * Cancel auction (two-step confirmation)
 */
async function cancelAuction() {
  if (!currentItem?.id) return

  const btn = document.getElementById('editAuctionCancelBtn')

  // First click: switch to confirm mode
  if (!confirmCancelMode) {
    confirmCancelMode = true
    confirmUpdateMode = false // Reset other button
    resetUpdateButton()
    if (btn) {
      btn.textContent = 'Confirm'
      btn.classList.remove('mp-btn-danger')
      btn.classList.add('mp-btn-warning')
    }
    return
  }

  // Second click: execute cancel
  resetConfirmState()
  closeModal(MODAL_ID)

  try {
    await blockchain.cancelAuction(currentItem.id)
  } catch (error) {
    // Error toast shown by blockchain.js
  }
}

/**
 * Reset only the update button
 */
function resetUpdateButton() {
  const btn = document.getElementById('editAuctionSubmitBtn')
  if (btn) {
    btn.textContent = 'Update'
    btn.classList.remove('mp-btn-warning')
    btn.classList.add('mp-btn-primary')
  }
}

/**
 * Reset only the cancel button
 */
function resetCancelButton() {
  const btn = document.getElementById('editAuctionCancelBtn')
  if (btn) {
    btn.textContent = 'Cancel Auction'
    btn.classList.remove('mp-btn-warning')
    btn.classList.add('mp-btn-danger')
  }
}

/**
 * Submit auction update (two-step confirmation)
 */
export async function submit() {
  if (!currentItem?.id) {
    showToast('error', 'Error', 'No item selected')
    return
  }

  const btn = document.getElementById('editAuctionSubmitBtn')

  // First click: switch to confirm mode
  if (!confirmUpdateMode) {
    confirmUpdateMode = true
    confirmCancelMode = false // Reset other button
    resetCancelButton()
    if (btn) {
      btn.textContent = 'Confirm'
      btn.classList.remove('mp-btn-primary')
      btn.classList.add('mp-btn-warning')
    }
    return
  }

  // Second click: execute update
  const reserve = parseFloat(document.getElementById('editAuctionReserveInput')?.value)
  const selectedPill = document.querySelector('#editAuctionDurationPills .mp-duration-pill.active')
  const duration = parseInt(selectedPill?.dataset.days) || 3

  resetConfirmState()
  closeModal(MODAL_ID)

  try {
    await blockchain.updateAuction(currentItem.id, { reserve, duration })
  } catch (error) {
    // Error toast shown by blockchain.js
  }
}

export function init() {
  window.editAuctionWizard = { open, close, submit, generateHTML }
}

init()

export default { open, close, submit, generateHTML, init }
