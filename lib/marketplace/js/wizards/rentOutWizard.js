/**
 * Rent Out Wizard
 * List an asset for rental
 * @module marketplace/wizards/rentOutWizard
 */

import { openModal, closeModal } from '../handlers/modals.js'
import { closeDetailPanel } from '../handlers/navigation.js'
import { blockchain } from '../services/blockchain.js'
import { showToast } from '../services/toast.js'
import { NO_IMAGE } from '../core/constants.js'

const MODAL_ID = 'rentOutModal'
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
        <h2 class="mp-modal-title">List for Rent</h2>
        <div class="mp-modal-header-right">
          <span class="mp-header-wallet">0x1234...5678 | <strong>156.8 OVG</strong></span>
          <button class="mp-modal-close" onclick="window.rentOutWizard?.close?.()">&times;</button>
        </div>
      </div>
      <div class="mp-modal-body">
        <div class="mp-asset-preview">
          <div class="mp-asset-preview-image"><img id="rentOutAssetImage" src="${NO_IMAGE}" alt="Asset"></div>
          <div class="mp-asset-preview-info">
            <div class="mp-asset-preview-collection" id="rentOutAssetCollection">Virtual Offices</div>
            <div class="mp-asset-preview-name" id="rentOutAssetName">Asset Name</div>
          </div>
        </div>

        <div class="mp-form-group">
          <label class="mp-form-label">Daily Rate</label>
          <div class="mp-input-group">
            <input type="number" class="mp-input" id="rentOutDailyRate" placeholder="0.00" value="0.1" step="0.01">
            <span class="mp-input-addon">OVG</span>
          </div>
        </div>

        <div class="mp-form-group">
          <label class="mp-form-label">Rental Period</label>
          <div class="mp-duration-pills mp-duration-pills-5" id="rentOutDurationPills">
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

        <div class="mp-summary" id="rentOutSummary">
          <div class="mp-summary-row"><span class="mp-summary-label">Daily Rate</span><span class="mp-summary-value" id="rentOutSummaryRate">0.1 OVG</span></div>
          <div class="mp-summary-row"><span class="mp-summary-label">Rental Period</span><span class="mp-summary-value" id="rentOutSummaryDuration">30 days</span></div>
          <div class="mp-summary-row"><span class="mp-summary-label">Total Earnings</span><span class="mp-summary-value mp-summary-total" id="rentOutSummaryEarnings">3.0 OVG</span></div>
        </div>
      </div>
      <div class="mp-modal-footer mp-modal-footer-duo">
        <button class="mp-btn mp-btn-ghost" onclick="window.rentOutWizard?.close?.()">Cancel</button>
        <button class="mp-btn mp-btn-cta-rent-out" id="rentOutSubmitBtn">List for Rent</button>
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
  document.getElementById('rentOutSubmitBtn')?.addEventListener('click', submit)
  document.getElementById('rentOutDailyRate')?.addEventListener('input', () => {
    resetConfirmState()
    updateSummary()
  })

  // Duration pills
  document.getElementById('rentOutDurationPills')?.addEventListener('click', (e) => {
    const pill = e.target.closest('.mp-duration-pill')
    if (!pill) return
    document.querySelectorAll('#rentOutDurationPills .mp-duration-pill').forEach(p => p.classList.remove('active'))
    pill.classList.add('active')
    resetConfirmState()
    updateSummary()
  })
}

/**
 * Update rental summary
 */
export function updateSummary() {
  const rate = parseFloat(document.getElementById('rentOutDailyRate')?.value) || 0
  const durationPill = document.querySelector('#rentOutDurationPills .mp-duration-pill.active')
  const days = parseInt(durationPill?.dataset.days) || 30

  document.getElementById('rentOutSummaryRate').textContent = `${rate.toFixed(2)} OVG`
  document.getElementById('rentOutSummaryDuration').textContent = `${days} days`
  document.getElementById('rentOutSummaryEarnings').textContent = `${(rate * days).toFixed(2)} OVG`
}

/**
 * Reset confirm button state
 */
function resetConfirmState() {
  confirmMode = false
  const btn = document.getElementById('rentOutSubmitBtn')
  if (btn) {
    btn.textContent = 'List for Rent'
    btn.classList.remove('mp-btn-warning')
    btn.classList.add('mp-btn-cta-rent-out')
  }
}

/**
 * Open rent out wizard for an asset
 * @param {object} asset - Asset to list for rent
 */
export function open(asset) {
  ensureModal()
  currentAsset = asset
  closeDetailPanel()

  const imageEl = document.getElementById('rentOutAssetImage')
  const collectionEl = document.getElementById('rentOutAssetCollection')
  const nameEl = document.getElementById('rentOutAssetName')

  if (imageEl) imageEl.src = asset.image || NO_IMAGE
  if (collectionEl) collectionEl.textContent = asset.collection || 'Unknown'
  if (nameEl) nameEl.textContent = asset.title || asset.name || 'Unnamed Asset'

  resetConfirmState()
  updateSummary()
  openModal(MODAL_ID)
}

/**
 * Close rent out wizard
 */
export function close() {
  currentAsset = null
  resetConfirmState()
  closeModal(MODAL_ID)
}

/**
 * Submit rental listing (two-step confirmation)
 */
export async function submit() {
  if (!currentAsset) {
    showToast('error', 'Error', 'No asset selected')
    return
  }

  const rate = parseFloat(document.getElementById('rentOutDailyRate')?.value)

  if (!rate || rate <= 0) {
    showToast('warning', 'Invalid Rate', 'Please enter a valid daily rate')
    return
  }

  const btn = document.getElementById('rentOutSubmitBtn')

  // First click: switch to confirm mode
  if (!confirmMode) {
    confirmMode = true
    if (btn) {
      btn.textContent = 'Confirm'
      btn.classList.remove('mp-btn-cta-rent-out')
      btn.classList.add('mp-btn-warning')
    }
    return
  }

  // Second click: execute listing
  const durationPill = document.querySelector('#rentOutDurationPills .mp-duration-pill.active')
  const duration = parseInt(durationPill?.dataset.days) || 30

  resetConfirmState()
  closeModal(MODAL_ID)

  try {
    await blockchain.listForRent(currentAsset.id, rate, duration)
  } catch (error) {
    // Error toast shown by blockchain.js
  }
}

export function init() {
  window.rentOutWizard = { open, close, submit, updateSummary, generateHTML }
}

init()

export default { open, close, submit, updateSummary, generateHTML, init }
