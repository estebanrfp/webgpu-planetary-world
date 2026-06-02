/**
 * Rent Wizard
 * Rent an asset from a listing
 * @module marketplace/wizards/rentWizard
 */

import { openModal, closeModal } from '../handlers/modals.js'
import { closeDetailPanel } from '../handlers/navigation.js'
import { blockchain } from '../services/blockchain.js'
import { showToast } from '../services/toast.js'
import { NO_IMAGE } from '../core/constants.js'

const MODAL_ID = 'rentModal'
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
        <h2 class="mp-modal-title">Rent Asset</h2>
        <div class="mp-modal-header-right">
          <span class="mp-header-wallet">0x1234...5678 | <strong>156.8 OVG</strong></span>
          <button class="mp-modal-close" onclick="window.rentWizard?.close?.()">&times;</button>
        </div>
      </div>
      <div class="mp-modal-body">
        <div class="mp-asset-preview">
          <div class="mp-asset-preview-image"><img loading="lazy" decoding="async" src="${NO_IMAGE}" alt="Asset" id="rentAssetImage"></div>
          <div class="mp-asset-preview-info">
            <div class="mp-asset-preview-collection" id="rentAssetCollection">Virtual Offices</div>
            <div class="mp-asset-preview-name" id="rentAssetName">Downtown Suite #12</div>
          </div>
        </div>

        <div class="mp-form-group">
          <div class="mp-duration-pills" id="rentDurationPills">
            <button type="button" class="mp-duration-pill" data-days="1" data-price="0.1">
              <span class="mp-pill-days">1 day</span>
              <span class="mp-pill-price">0.1 OVG</span>
            </button>
            <button type="button" class="mp-duration-pill active" data-days="7" data-price="0.7">
              <span class="mp-pill-badge popular">Popular</span>
              <span class="mp-pill-days">7 days</span>
              <span class="mp-pill-price">0.7 OVG</span>
            </button>
            <button type="button" class="mp-duration-pill" data-days="30" data-price="2.5">
              <span class="mp-pill-badge discount">-17%</span>
              <span class="mp-pill-days">30 days</span>
              <span class="mp-pill-price">2.5 OVG</span>
            </button>
            <button type="button" class="mp-duration-pill" data-days="90" data-price="6.0">
              <span class="mp-pill-badge discount">-33%</span>
              <span class="mp-pill-days">90 days</span>
              <span class="mp-pill-price">6.0 OVG</span>
            </button>
          </div>
        </div>

        <div class="mp-summary" id="rentSummary">
          <div class="mp-summary-row"><span class="mp-summary-label">Subtotal</span><span class="mp-summary-value" id="rentSummarySubtotal">0.7 OVG</span></div>
          <div class="mp-summary-row"><span class="mp-summary-label">Service Fee (2.5%)</span><span class="mp-summary-value" id="rentSummaryFee">0.0175 OVG</span></div>
          <div class="mp-summary-row"><span class="mp-summary-label">Total</span><span class="mp-summary-value mp-summary-total" id="rentSummaryTotal">0.7175 OVG</span></div>
        </div>

      </div>
      <div class="mp-modal-footer mp-modal-footer-duo">
        <button class="mp-btn mp-btn-ghost" onclick="window.rentWizard?.close?.()">Cancel</button>
        <button class="mp-btn mp-btn-cta-rent" id="rentSubmitBtn">Rent Now</button>
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
  document.getElementById('rentSubmitBtn')?.addEventListener('click', submit)

  // Duration pills click handlers
  document.getElementById('rentDurationPills')?.addEventListener('click', (e) => {
    const pill = e.target.closest('.mp-duration-pill')
    if (!pill) return

    // Update active state
    document.querySelectorAll('#rentDurationPills .mp-duration-pill').forEach(p => p.classList.remove('active'))
    pill.classList.add('active')

    // Reset confirm state when changing selection
    resetConfirmState()
    updateSummary()
  })
}

/**
 * Update summary based on selected duration
 */
export function updateSummary() {
  const activePill = document.querySelector('#rentDurationPills .mp-duration-pill.active')
  const price = parseFloat(activePill?.dataset.price) || 0.7
  const fee = price * 0.025
  const total = price + fee

  document.getElementById('rentSummarySubtotal').textContent = `${price.toFixed(2)} OVG`
  document.getElementById('rentSummaryFee').textContent = `${fee.toFixed(4)} OVG`
  document.getElementById('rentSummaryTotal').textContent = `${total.toFixed(4)} OVG`
}

/**
 * Open rent wizard for a listing
 * @param {object} listing - Rental listing
 */
export function open(listing) {
  if (!listing) {
    showToast('error', 'Error', 'No listing data available')
    return
  }

  ensureModal()
  currentListing = listing
  closeDetailPanel()

  const imageEl = document.getElementById('rentAssetImage')
  const collectionEl = document.getElementById('rentAssetCollection')
  const nameEl = document.getElementById('rentAssetName')
  const rateEl = document.getElementById('rentDailyRate')

  if (imageEl) imageEl.src = listing.image || NO_IMAGE
  if (collectionEl) collectionEl.textContent = listing.collection || 'Unknown'
  if (nameEl) nameEl.textContent = listing.title || listing.name || 'Unnamed Asset'
  if (rateEl) rateEl.textContent = `${listing.dailyRate || 0.1} OVG`

  resetConfirmState()
  updateSummary()
  openModal(MODAL_ID)
}

/**
 * Close rent wizard
 */
export function close() {
  currentListing = null
  resetConfirmState()
  closeModal(MODAL_ID)
}

/**
 * Reset confirm button state
 */
function resetConfirmState() {
  confirmMode = false
  const btn = document.getElementById('rentSubmitBtn')
  if (btn) {
    btn.textContent = 'Rent Now'
    btn.classList.remove('mp-btn-warning')
    btn.classList.add('mp-btn-cta-rent')
  }
}

/**
 * Submit rental (two-step confirmation)
 */
export async function submit() {
  if (!currentListing) {
    showToast('error', 'Error', 'No listing selected')
    return
  }

  const btn = document.getElementById('rentSubmitBtn')

  // First click: switch to confirm mode
  if (!confirmMode) {
    confirmMode = true
    if (btn) {
      btn.textContent = 'Confirm'
      btn.classList.remove('mp-btn-cta-rent')
      btn.classList.add('mp-btn-warning')
    }
    return
  }

  // Second click: execute rental
  const activePill = document.querySelector('#rentDurationPills .mp-duration-pill.active')
  const days = parseInt(activePill?.dataset.days) || 7

  resetConfirmState()
  closeModal(MODAL_ID)

  try {
    await blockchain.rent(currentListing.id, currentListing.price, days)
  } catch (error) {
    // Error toast shown by blockchain.js
  }
}

export function init() {
  window.rentWizard = { open, close, submit, updateSummary, generateHTML }
}

init()

export default { open, close, submit, updateSummary, generateHTML, init }
