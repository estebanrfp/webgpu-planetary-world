/**
 * Extend Wizard
 * Extend rental period for a rented asset
 * @module marketplace/wizards/extendWizard
 */

import { openModal, closeModal } from '../handlers/modals.js'
import { closeDetailPanel } from '../handlers/navigation.js'
import { blockchain } from '../services/blockchain.js'
import { showToast } from '../services/toast.js'
import { NO_IMAGE } from '../core/constants.js'

const MODAL_ID = 'extendModal'
let currentRental = null
let initialized = false

/**
 * Generate modal HTML template
 * @returns {string} HTML string
 */
export function generateHTML() {
  return `
  <div class="mp-modal-overlay" id="${MODAL_ID}" role="dialog" aria-modal="true">
    <div class="mp-modal">
      <div class="mp-modal-header">
        <h2 class="mp-modal-title">&#128197; Extend Rental</h2>
        <button class="mp-modal-close" onclick="closeModal('${MODAL_ID}')">&times;</button>
      </div>
      <div class="mp-modal-body">
        <div class="mp-asset-preview">
          <div class="mp-asset-preview-image"><img loading="lazy" decoding="async" src="${NO_IMAGE}" alt="Asset" id="extendAssetImage"></div>
          <div class="mp-asset-preview-info">
            <div class="mp-asset-preview-collection" id="extendAssetCollection">Virtual Offices</div>
            <div class="mp-asset-preview-name" id="extendAssetName">Downtown Suite #12</div>
          </div>
        </div>

        <div class="mp-status-row">
          <div class="mp-status-box mp-status-renting">
            <span class="mp-status-box-label">Current Expiry</span>
            <span class="mp-status-box-value" id="extendCurrentExpiry">Feb 1, 2026</span>
          </div>
          <div class="mp-status-box mp-status-rent">
            <span class="mp-status-box-label">Daily Rate</span>
            <span class="mp-status-box-value" id="extendDailyRate">0.1 OVG</span>
          </div>
        </div>

        <div class="mp-form-group">
          <label class="mp-form-label">Extend by</label>
          <div class="mp-duration-options" id="extendDurationOptions">
            <div class="mp-duration-option selected" data-days="7">
              <div class="mp-duration-value">7</div>
              <div class="mp-duration-label">Days</div>
            </div>
            <div class="mp-duration-option" data-days="30">
              <div class="mp-duration-value">30</div>
              <div class="mp-duration-label">Days</div>
            </div>
            <div class="mp-duration-option" data-days="90">
              <div class="mp-duration-value">90</div>
              <div class="mp-duration-label">Days</div>
            </div>
            <div class="mp-duration-option" data-days="365">
              <div class="mp-duration-value">365</div>
              <div class="mp-duration-label">Days</div>
            </div>
          </div>
        </div>

        <div class="mp-summary" id="extendSummary">
          <div class="mp-summary-row"><span class="mp-summary-label">Extension Period</span><span class="mp-summary-value" id="extendSummaryPeriod">7 days</span></div>
          <div class="mp-summary-row"><span class="mp-summary-label">New Expiry</span><span class="mp-summary-value" id="extendSummaryNewExpiry">Feb 8, 2026</span></div>
          <div class="mp-summary-row"><span class="mp-summary-label">Cost</span><span class="mp-summary-value mp-summary-total" id="extendSummaryCost">0.7 OVG</span></div>
        </div>
      </div>
      <div class="mp-modal-footer">
        <button class="mp-btn mp-btn-ghost mp-btn-flex" onclick="closeModal('${MODAL_ID}')">Cancel</button>
        <button class="mp-btn mp-btn-rent mp-btn-flex" id="extendSubmitBtn">Extend Rental</button>
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
  document.getElementById('extendSubmitBtn')?.addEventListener('click', submit)
  document.querySelectorAll('#extendDurationOptions .mp-duration-option').forEach(option => {
    option.addEventListener('click', () => selectDuration(option))
  })
}

/**
 * Select duration option
 * @param {HTMLElement} option - Duration option element
 */
function selectDuration(option) {
  document.querySelectorAll('#extendDurationOptions .mp-duration-option').forEach(o => o.classList.remove('selected'))
  option.classList.add('selected')
  updateSummary()
}

/**
 * Update extension summary
 */
export function updateSummary() {
  if (!currentRental) return

  const selectedOption = document.querySelector('#extendDurationOptions .mp-duration-option.selected')
  const days = parseInt(selectedOption?.dataset.days) || 7
  const rate = parseFloat(currentRental.dailyRate) || 0.1
  const cost = days * rate

  document.getElementById('extendSummaryPeriod').textContent = `${days} days`
  document.getElementById('extendSummaryCost').textContent = `${cost.toFixed(2)} OVG`

  const newExpiry = new Date()
  newExpiry.setDate(newExpiry.getDate() + (currentRental.daysRemaining || 0) + days)
  document.getElementById('extendSummaryNewExpiry').textContent = newExpiry.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
  })
}

/**
 * Open extend wizard for a rental
 * @param {object} rental - Rental data {id, name, daysRemaining, dailyRate}
 */
export function open(rental) {
  ensureModal()
  currentRental = rental
  closeDetailPanel()

  const imageEl = document.getElementById('extendAssetImage')
  const collectionEl = document.getElementById('extendAssetCollection')
  const nameEl = document.getElementById('extendAssetName')
  const rateEl = document.getElementById('extendDailyRate')

  if (imageEl) imageEl.src = rental.image || NO_IMAGE
  if (collectionEl) collectionEl.textContent = rental.collection || 'Unknown'
  if (nameEl) nameEl.textContent = rental.title || rental.name || 'Unnamed Asset'
  if (rateEl) rateEl.textContent = `${rental.dailyRate || 0.1} OVG`

  updateSummary()
  openModal(MODAL_ID)
}

/**
 * Close extend wizard
 */
export function close() {
  currentRental = null
  closeModal(MODAL_ID)
}

/**
 * Submit extension
 */
export async function submit() {
  if (!currentRental) {
    showToast('error', 'Error', 'No rental selected')
    return
  }

  const selectedOption = document.querySelector('#extendDurationOptions .mp-duration-option.selected')
  const days = parseInt(selectedOption?.dataset.days) || 7
  const cost = days * (parseFloat(currentRental.dailyRate) || 0.1)

  closeModal(MODAL_ID)

  try {
    await blockchain.extendRental(currentRental.id, days)
  } catch (error) {
    // Error toast shown by blockchain.js
  }
}

export function init() {
  window.extendWizard = { open, close, submit, updateSummary, generateHTML }
}

init()

export default { open, close, submit, updateSummary, generateHTML, init }
