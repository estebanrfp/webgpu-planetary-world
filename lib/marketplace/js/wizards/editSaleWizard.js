/**
 * Edit Sale Wizard
 * Edit price of an existing sale listing
 * @module marketplace/wizards/editSaleWizard
 */

import { openModal, closeModal } from '../handlers/modals.js'
import { closeDetailPanel } from '../handlers/navigation.js'
import { blockchain } from '../services/blockchain.js'
import { showToast } from '../services/toast.js'

const MODAL_ID = 'editSaleModal'
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
        <h2 class="mp-modal-title">Edit Sale Listing</h2>
        <div class="mp-modal-header-right">
          <span class="mp-header-wallet">0x1234...5678 | <strong>156.8 OVG</strong></span>
          <button class="mp-modal-close" onclick="window.editSaleWizard?.close?.()">&times;</button>
        </div>
      </div>
      <div class="mp-modal-body">
        <div class="mp-asset-preview">
          <div class="mp-asset-preview-image"><img id="editSaleAssetImage" src="" alt="Asset"></div>
          <div class="mp-asset-preview-info">
            <div class="mp-asset-preview-collection" id="editSaleAssetCollection">Collection Name</div>
            <div class="mp-asset-preview-name" id="editSaleAssetName">Asset Name</div>
          </div>
        </div>

        <div class="mp-form-group">
          <label class="mp-form-label">Price</label>
          <div class="mp-input-group">
            <input type="number" class="mp-input" id="editSalePriceInput" placeholder="0.00" value="1.5">
            <span class="mp-input-addon">OVG</span>
          </div>
        </div>

        <div class="mp-form-group">
          <label class="mp-form-label">Duration</label>
          <div class="mp-duration-pills" id="editSaleDurationPills">
            <button type="button" class="mp-duration-pill" data-days="7">
              <span class="mp-pill-days">7 days</span>
            </button>
            <button type="button" class="mp-duration-pill active" data-days="30">
              <span class="mp-pill-badge popular">Popular</span>
              <span class="mp-pill-days">30 days</span>
            </button>
            <button type="button" class="mp-duration-pill" data-days="90">
              <span class="mp-pill-days">90 days</span>
            </button>
            <button type="button" class="mp-duration-pill" data-days="0">
              <span class="mp-pill-days">No limit</span>
            </button>
          </div>
        </div>

        <div class="mp-summary">
          <div class="mp-summary-row"><span class="mp-summary-label">Listed Price</span><span class="mp-summary-value" id="editSaleCurrentPrice">1.5 OVG</span></div>
          <div class="mp-summary-row"><span class="mp-summary-label">Service Fee (<span class="mp-text-success">2.5%</span>)</span><span class="mp-summary-value" id="editSaleFee">-0.0375 OVG</span></div>
          <div class="mp-summary-row"><span class="mp-summary-label">Creator Royalty (<span id="editSaleRoyaltyPct" class="mp-text-success">5%</span>)</span><span class="mp-summary-value" id="editSaleRoyalty">-0.075 OVG</span></div>
          <div class="mp-summary-row"><span class="mp-summary-label">You receive</span><span class="mp-summary-value mp-summary-total" id="editSaleReceive">1.3875 OVG</span></div>
        </div>
      </div>
      <div class="mp-modal-footer">
        <button class="mp-btn mp-btn-ghost mp-btn-flex" onclick="window.editSaleWizard?.close?.()">Cancel</button>
        <button class="mp-btn mp-btn-danger mp-btn-flex" id="editSaleCancelBtn">Cancel Listing</button>
        <button class="mp-btn mp-btn-primary mp-btn-flex" id="editSaleSubmitBtn">Update</button>
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
  document.getElementById('editSaleSubmitBtn')?.addEventListener('click', submit)
  document.getElementById('editSaleCancelBtn')?.addEventListener('click', cancelListing)
  document.getElementById('editSalePriceInput')?.addEventListener('input', () => {
    resetConfirmState()
    updateSummary()
  })

  // Duration pills click handlers
  document.getElementById('editSaleDurationPills')?.addEventListener('click', (e) => {
    const pill = e.target.closest('.mp-duration-pill')
    if (!pill) return
    document.querySelectorAll('#editSaleDurationPills .mp-duration-pill').forEach(p => p.classList.remove('active'))
    pill.classList.add('active')
    resetConfirmState()
  })
}

/**
 * Update price summary
 */
function updateSummary() {
  const price = parseFloat(document.getElementById('editSalePriceInput')?.value) || 0
  // Parse royalty - handle strings like "5%" or numbers
  const rawRoyalty = currentItem?.royalty
  const royaltyPct = typeof rawRoyalty === 'string' ? parseFloat(rawRoyalty) : (rawRoyalty ?? 5)
  const fee = price * 0.025
  const royalty = price * (royaltyPct / 100)
  const receive = price - fee - royalty

  document.getElementById('editSaleCurrentPrice').textContent = `${price.toFixed(4)} OVG`
  document.getElementById('editSaleFee').textContent = `-${fee.toFixed(4)} OVG`
  document.getElementById('editSaleRoyaltyPct').textContent = `${royaltyPct}%`
  document.getElementById('editSaleRoyalty').textContent = `-${royalty.toFixed(4)} OVG`
  document.getElementById('editSaleReceive').textContent = `${receive.toFixed(4)} OVG`
}

/**
 * Reset confirm button states
 */
function resetConfirmState() {
  confirmUpdateMode = false
  confirmCancelMode = false
  const updateBtn = document.getElementById('editSaleSubmitBtn')
  const cancelBtn = document.getElementById('editSaleCancelBtn')
  if (updateBtn) {
    updateBtn.textContent = 'Update'
    updateBtn.classList.remove('mp-btn-warning')
    updateBtn.classList.add('mp-btn-primary')
  }
  if (cancelBtn) {
    cancelBtn.textContent = 'Cancel Listing'
    cancelBtn.classList.remove('mp-btn-warning')
    cancelBtn.classList.add('mp-btn-danger')
  }
}

/**
 * Reset only the update button
 */
function resetUpdateButton() {
  const btn = document.getElementById('editSaleSubmitBtn')
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
  const btn = document.getElementById('editSaleCancelBtn')
  if (btn) {
    btn.textContent = 'Cancel Listing'
    btn.classList.remove('mp-btn-warning')
    btn.classList.add('mp-btn-danger')
  }
}

/**
 * Open edit sale wizard for a listing
 * @param {object} itemData - Listing data {id, title, collection, image, price}
 */
export function open(itemData) {
  ensureModal()
  currentItem = itemData
  closeDetailPanel()

  const { id, title, name, collection, image, price, royalty } = itemData

  // Parse price - handle strings like "1.5 OVG" or numbers
  const numericPrice = typeof price === 'string' ? parseFloat(price) : (price || 0)
  // Parse royalty - handle strings like "5%" or numbers
  const numericRoyalty = typeof royalty === 'string' ? parseFloat(royalty) : (royalty || 5)

  document.getElementById('editSaleAssetImage').src = image || ''
  document.getElementById('editSaleAssetCollection').textContent = collection || 'Unknown'
  document.getElementById('editSaleAssetName').textContent = title || name || 'Untitled'
  document.getElementById('editSalePriceInput').value = numericPrice || ''

  // Restore active duration pill from listing data (GenosDB stores seconds)
  const currentDurationDays = Math.round((itemData.duration ?? 0) / 86400)
  const pills = document.querySelectorAll('#editSaleDurationPills .mp-duration-pill')
  pills.forEach(p => {
    const days = parseInt(p.dataset.days)
    p.classList.toggle('active', days === currentDurationDays)
  })

  // Reset confirm state when opening
  resetConfirmState()
  updateSummary()
  openModal(MODAL_ID)
}

/**
 * Close edit sale wizard
 */
export function close() {
  currentItem = null
  resetConfirmState()
  closeModal(MODAL_ID)
}

/**
 * Cancel listing - id is the hash from db.map() (two-step confirmation)
 */
async function cancelListing() {
  if (!currentItem?.id) return

  const btn = document.getElementById('editSaleCancelBtn')

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
    await blockchain.cancelListing(currentItem.id)
  } catch (error) {
    // Error toast shown by blockchain.js
  }
}

/**
 * Submit price update (two-step confirmation)
 */
export async function submit() {
  if (!currentItem?.id) {
    showToast('error', 'Error', 'No item selected')
    return
  }

  const btn = document.getElementById('editSaleSubmitBtn')

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
  const newPrice = parseFloat(document.getElementById('editSalePriceInput')?.value)
  const selectedDuration = document.querySelector('#editSaleDurationPills .mp-duration-pill.active')?.dataset.days

  if (!newPrice || newPrice <= 0) {
    showToast('warning', 'Invalid Price', 'Please enter a valid price')
    return
  }

  resetConfirmState()
  closeModal(MODAL_ID)

  try {
    await blockchain.updateListing(currentItem.id, {
      price: newPrice,
      duration: selectedDuration ? parseInt(selectedDuration) : null
    })
  } catch (error) {
    // Error toast shown by blockchain.js
  }
}

export function init() {
  window.editSaleWizard = { open, close, submit, generateHTML }
}

init()

export default { open, close, submit, generateHTML, init }
