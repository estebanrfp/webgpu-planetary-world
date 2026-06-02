/**
 * Edit Rental Wizard
 * Edit rate of an existing rental listing
 * @module marketplace/wizards/editRentalWizard
 */

import { openModal, closeModal } from '../handlers/modals.js'
import { closeDetailPanel } from '../handlers/navigation.js'
import { blockchain } from '../services/blockchain.js'
import { showToast } from '../services/toast.js'

const MODAL_ID = 'editRentalModal'
let currentItem = null
let initialized = false
let confirmModeUpdate = false
let confirmModeCancel = false

/**
 * Generate modal HTML template
 * @returns {string} HTML string
 */
export function generateHTML() {
  return `
  <div class="mp-modal-overlay" id="${MODAL_ID}" role="dialog" aria-modal="true">
    <div class="mp-modal">
      <div class="mp-modal-header">
        <h2 class="mp-modal-title">Edit Rent Listing</h2>
        <div class="mp-modal-header-right">
          <span class="mp-header-wallet">0x1234...5678 | <strong>156.8 OVG</strong></span>
          <button class="mp-modal-close" onclick="window.editRentalWizard?.close?.()">&times;</button>
        </div>
      </div>
      <div class="mp-modal-body">
        <div class="mp-asset-preview">
          <div class="mp-asset-preview-image"><img id="editRentalAssetImage" src="" alt="Asset"></div>
          <div class="mp-asset-preview-info">
            <div class="mp-asset-preview-collection" id="editRentalAssetCollection">Collection Name</div>
            <div class="mp-asset-preview-name" id="editRentalAssetName">Asset Name</div>
          </div>
        </div>

        <div class="mp-form-group">
          <label class="mp-form-label">Daily Rate</label>
          <div class="mp-input-group">
            <input type="number" class="mp-input" id="editRentalRateInput" placeholder="0.00" value="0.1" step="0.01">
            <span class="mp-input-addon">OVG</span>
          </div>
        </div>

        <div class="mp-form-group">
          <label class="mp-form-label">Rental Period</label>
          <div class="mp-duration-pills mp-duration-pills-5" id="editRentalDurationPills">
            <button type="button" class="mp-duration-pill" data-days="1">
              <span class="mp-pill-days">1 day</span>
            </button>
            <button type="button" class="mp-duration-pill" data-days="7">
              <span class="mp-pill-badge popular">Popular</span>
              <span class="mp-pill-days">7 days</span>
            </button>
            <button type="button" class="mp-duration-pill active" data-days="30">
              <span class="mp-pill-days">30 days</span>
            </button>
            <button type="button" class="mp-duration-pill" data-days="90">
              <span class="mp-pill-days">90 days</span>
            </button>
            <button type="button" class="mp-duration-pill" data-days="365">
              <span class="mp-pill-days">365 days</span>
            </button>
          </div>
        </div>

        <div class="mp-summary">
          <div class="mp-summary-row"><span class="mp-summary-label">Daily Rate</span><span class="mp-summary-value" id="editRentalCurrentRate">0.1 OVG</span></div>
          <div class="mp-summary-row"><span class="mp-summary-label">Rental Period</span><span class="mp-summary-value" id="editRentalDuration">30 days</span></div>
          <div class="mp-summary-row"><span class="mp-summary-label">Total Earnings</span><span class="mp-summary-value mp-summary-total" id="editRentalEarnings">3.0 OVG</span></div>
        </div>
      </div>
      <div class="mp-modal-footer">
        <button class="mp-btn mp-btn-ghost mp-btn-flex" onclick="window.editRentalWizard?.close?.()">Cancel</button>
        <button class="mp-btn mp-btn-danger mp-btn-flex" id="editRentalCancelBtn">Cancel Rental</button>
        <button class="mp-btn mp-btn-primary mp-btn-flex" id="editRentalSubmitBtn">Update Rental</button>
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
  document.getElementById('editRentalSubmitBtn')?.addEventListener('click', submit)
  document.getElementById('editRentalCancelBtn')?.addEventListener('click', cancelRental)
  document.getElementById('editRentalRateInput')?.addEventListener('input', () => { resetConfirmStates(); updateSummary() })

  // Duration pills
  document.getElementById('editRentalDurationPills')?.addEventListener('click', (e) => {
    const pill = e.target.closest('.mp-duration-pill')
    if (!pill) return
    document.querySelectorAll('#editRentalDurationPills .mp-duration-pill').forEach(p => p.classList.remove('active'))
    pill.classList.add('active')
    resetConfirmStates()
    updateSummary()
  })
}

/**
 * Reset update button confirm state
 */
function resetUpdateState() {
  confirmModeUpdate = false
  const btn = document.getElementById('editRentalSubmitBtn')
  if (btn) {
    btn.textContent = 'Update Rental'
    btn.classList.remove('mp-btn-warning')
    btn.classList.add('mp-btn-primary')
  }
}

/**
 * Reset cancel button confirm state
 */
function resetCancelState() {
  confirmModeCancel = false
  const btn = document.getElementById('editRentalCancelBtn')
  if (btn) {
    btn.textContent = 'Cancel Rental'
    btn.classList.remove('mp-btn-warning')
    btn.classList.add('mp-btn-danger')
  }
}

/**
 * Reset all confirm states
 */
function resetConfirmStates() {
  resetUpdateState()
  resetCancelState()
}

/**
 * Update rental summary
 */
function updateSummary() {
  const rate = parseFloat(document.getElementById('editRentalRateInput')?.value) || 0
  const durationPill = document.querySelector('#editRentalDurationPills .mp-duration-pill.active')
  const days = parseInt(durationPill?.dataset.days) || 30

  document.getElementById('editRentalCurrentRate').textContent = `${rate.toFixed(2)} OVG`
  document.getElementById('editRentalDuration').textContent = `${days} days`
  document.getElementById('editRentalEarnings').textContent = `${(rate * days).toFixed(2)} OVG`
}

/**
 * Open edit rental wizard for a listing
 * @param {object} itemData - Listing data {id, title, collection, image, price, duration}
 */
export function open(itemData) {
  ensureModal()
  currentItem = itemData
  closeDetailPanel()

  const { id, title, name, collection, image, price, priceNum, duration } = itemData

  // Parse price - handle strings like "0.1 OVG/day" or numbers
  const MIN_RATE = 0.01
  let numericPrice = priceNum ?? (typeof price === 'string' ? parseFloat(price) : price)
  if (!numericPrice || isNaN(numericPrice) || numericPrice < MIN_RATE) numericPrice = MIN_RATE

  document.getElementById('editRentalAssetImage').src = image || ''
  document.getElementById('editRentalAssetCollection').textContent = collection || 'Unknown'
  document.getElementById('editRentalAssetName').textContent = title || name || 'Untitled'
  document.getElementById('editRentalRateInput').value = numericPrice

  // Set duration pill (GenosDB stores seconds, pills use days)
  const currentDurationDays = Math.round((duration ?? 0) / 86400) || 30
  document.querySelectorAll('#editRentalDurationPills .mp-duration-pill').forEach(p => {
    p.classList.toggle('active', parseInt(p.dataset.days) === currentDurationDays)
  })

  resetConfirmStates()
  updateSummary()
  openModal(MODAL_ID)
}

/**
 * Close edit rental wizard
 */
export function close() {
  currentItem = null
  resetConfirmStates()
  closeModal(MODAL_ID)
}

/**
 * Cancel rental - id is the hash from db.map() (two-step confirmation)
 */
async function cancelRental() {
  if (!currentItem?.id) return

  const btn = document.getElementById('editRentalCancelBtn')

  // First click: switch to confirm mode
  if (!confirmModeCancel) {
    confirmModeCancel = true
    resetUpdateState() // Reset the other button
    if (btn) {
      btn.textContent = 'Confirm'
      btn.classList.remove('mp-btn-danger')
      btn.classList.add('mp-btn-warning')
    }
    return
  }

  // Second click: execute cancel
  closeModal(MODAL_ID)
  resetConfirmStates()

  try {
    await blockchain.cancelListing(currentItem.id)
  } catch (error) {
    // Error toast shown by blockchain.js
  }
}

/**
 * Submit rate update (two-step confirmation)
 */
export async function submit() {
  if (!currentItem?.id) {
    showToast('error', 'Error', 'No item selected')
    return
  }

  const MIN_RATE = 0.01
  const rateInput = document.getElementById('editRentalRateInput')
  let newRate = parseFloat(rateInput?.value)

  if (!newRate || isNaN(newRate) || newRate < MIN_RATE) {
    newRate = MIN_RATE
    rateInput.value = MIN_RATE
    showToast('info', 'Minimum Rate', `Rate set to minimum: ${MIN_RATE} OVG`)
  }

  const btn = document.getElementById('editRentalSubmitBtn')

  // First click: switch to confirm mode
  if (!confirmModeUpdate) {
    confirmModeUpdate = true
    resetCancelState() // Reset the other button
    if (btn) {
      btn.textContent = 'Confirm'
      btn.classList.remove('mp-btn-primary')
      btn.classList.add('mp-btn-warning')
    }
    return
  }

  // Second click: execute update
  closeModal(MODAL_ID)
  resetConfirmStates()

  try {
    const durationPill = document.querySelector('#editRentalDurationPills .mp-duration-pill.active')
    const duration = parseInt(durationPill?.dataset.days) || 30

    await blockchain.updateRental(currentItem.id, { dailyRate: newRate, duration })
  } catch (error) {
    // Error toast shown by blockchain.js
  }
}

export function init() {
  window.editRentalWizard = { open, close, submit, generateHTML }
}

init()

export default { open, close, submit, generateHTML, init }
