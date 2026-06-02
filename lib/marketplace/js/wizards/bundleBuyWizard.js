/**
 * Bundle Buy Wizard
 * Purchase a bundle from Explore view
 * @module marketplace/wizards/bundleBuyWizard
 */

import { openModal, closeModal } from '../handlers/modals.js'
import { blockchain } from '../services/blockchain.js'
import { showToast } from '../services/toast.js'
import { NO_IMAGE } from '../core/constants.js'

const MODAL_ID = 'bundleBuyModal'
let currentBundle = null
let initialized = false
let confirmMode = false

/**
 * Generate modal HTML template
 * @returns {string} HTML string
 */
export function generateHTML() {
  return `
  <div class="mp-modal-overlay" id="${MODAL_ID}" role="dialog" aria-modal="true">
    <div class="mp-modal mp-modal-lg">
      <div class="mp-modal-header">
        <h2 class="mp-modal-title">Complete Purchase</h2>
        <button class="mp-modal-close" onclick="closeModal('${MODAL_ID}')">&times;</button>
      </div>
      <div class="mp-modal-body">
        <div class="mp-batch-info">
          <span class="mp-batch-info-count"><span id="bundleBuyModalCount">0</span> items in bundle</span>
          <span class="mp-batch-info-hint" id="bundleBuyModalName">Bundle contents</span>
        </div>

        <div class="mp-batch-items" id="bundleBuyItemsList">
          <!-- Bundle items will be populated dynamically -->
        </div>

        <div class="mp-batch-summary">
          <div class="mp-summary-row">
            <span class="mp-summary-label">Items in Bundle</span>
            <span class="mp-summary-value" id="bundleBuySummaryItems">0</span>
          </div>
          <div class="mp-summary-row">
            <span class="mp-summary-label">Bundle Price</span>
            <span class="mp-summary-value mp-summary-total" id="bundleBuySummaryTotal">0.00 OVG</span>
          </div>
        </div>
      </div>
      <div class="mp-modal-footer">
        <button class="mp-btn mp-btn-ghost mp-btn-flex" onclick="closeModal('${MODAL_ID}')">Cancel</button>
        <button class="mp-btn mp-btn-cta-offer mp-btn-flex" id="bundleBuyOfferBtn">Make Offer</button>
        <button class="mp-btn mp-btn-cta-buy mp-btn-flex" id="bundleBuySubmitBtn">Buy Bundle</button>
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
  document.getElementById('bundleBuySubmitBtn')?.addEventListener('click', submit)
  document.getElementById('bundleBuyOfferBtn')?.addEventListener('click', makeOffer)
}

/**
 * Open bundle buy wizard
 * @param {object} bundle - Bundle data {id, title, price, items}
 */
export function open(bundle) {
  ensureModal()

  if (!bundle) {
    showToast('warning', 'No Bundle', 'No bundle selected')
    return
  }

  currentBundle = bundle
  const { id, title, price } = bundle
  const items = bundle.bundleItems || bundle.items || []

  const modalCount = document.getElementById('bundleBuyModalCount')
  const modalName = document.getElementById('bundleBuyModalName')
  const summaryItems = document.getElementById('bundleBuySummaryItems')
  const summaryTotal = document.getElementById('bundleBuySummaryTotal')
  const itemsList = document.getElementById('bundleBuyItemsList')

  if (modalCount) modalCount.textContent = items.length
  if (modalName) modalName.textContent = title || bundle.name || 'Bundle'
  if (summaryItems) summaryItems.textContent = items.length
  // Handle price that may already include "OVG"
  const priceStr = String(price || 0)
  if (summaryTotal) summaryTotal.textContent = priceStr.includes('OVG') ? priceStr : `${priceStr} OVG`

  if (itemsList) {
    itemsList.innerHTML = items.map(item => {
      const itemName = item.title || item.name || 'Untitled'
      const itemPrice = String(item.price || '—')
      return `
      <div class="mp-batch-item">
        <div class="mp-batch-item-image">
          <img src="${item.image || NO_IMAGE}" alt="${itemName}">
        </div>
        <div class="mp-batch-item-info">
          <div class="mp-batch-item-name">${itemName}</div>
          <div class="mp-batch-item-collection">${item.collection || ''}</div>
        </div>
        <div class="mp-batch-item-price-display">
          <span class="mp-batch-item-price-value">${itemPrice}</span>
        </div>
      </div>
    `}).join('')
  }

  // Reset confirm state when opening
  resetConfirmState()

  openModal(MODAL_ID)
}

/**
 * Close bundle buy wizard
 */
export function close() {
  currentBundle = null
  resetConfirmState()
  closeModal(MODAL_ID)
}

/**
 * Reset confirm button state
 */
function resetConfirmState() {
  confirmMode = false
  const btn = document.getElementById('bundleBuySubmitBtn')
  if (btn) {
    btn.textContent = 'Buy Bundle'
    btn.classList.remove('mp-btn-warning')
    btn.classList.add('mp-btn-cta-buy')
  }
}

/**
 * Make offer on bundle
 */
async function makeOffer() {
  if (!currentBundle) return
  closeModal(MODAL_ID)
  // Load and open offer wizard
  const offerWizard = await import('./offerWizard.js')
  offerWizard.open(currentBundle)
}

/**
 * Submit bundle purchase (two-step confirmation)
 */
export async function submit() {
  if (!currentBundle) {
    showToast('warning', 'No Bundle', 'No bundle selected')
    return
  }

  const btn = document.getElementById('bundleBuySubmitBtn')

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
  resetConfirmState()
  closeModal(MODAL_ID)

  try {
    await blockchain.buyBundle(currentBundle.id)
  } catch (error) {
    // Error toast shown by blockchain.js
  }
}

export function init() {
  window.bundleBuyWizard = { open, close, submit, generateHTML }
}

init()

export default { open, close, submit, generateHTML, init }
