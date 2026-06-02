/**
 * Batch Buy Wizard
 * Purchase multiple listed assets at once
 * @module marketplace/wizards/batchBuyWizard
 */

import { openModal, closeModal } from '../handlers/modals.js'
import { blockchain } from '../services/blockchain.js'
import { showToast } from '../services/toast.js'

const MODAL_ID = 'batchBuyModal'
let selectedItems = new Map()
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
        <h2 class="mp-modal-title">Batch Buy Items</h2>
        <div class="mp-modal-header-right">
          <span class="mp-header-wallet">0x1234...5678 | <strong>156.8 OVG</strong></span>
          <button class="mp-modal-close" onclick="window.batchBuyWizard?.close?.()">&times;</button>
        </div>
      </div>
      <div class="mp-modal-body">
        <div class="mp-batch-info">
          <span class="mp-batch-info-count"><span id="batchBuyModalCount">0</span> items selected</span>
          <span class="mp-batch-info-hint">Review items before purchase</span>
        </div>

        <div class="mp-batch-items" id="batchBuyItemsList">
          <!-- Items will be populated dynamically -->
        </div>

        <div class="mp-batch-summary">
          <div class="mp-summary-row">
            <span class="mp-summary-label">Items to Buy</span>
            <span class="mp-summary-value" id="batchBuySummaryItems">0</span>
          </div>
          <div class="mp-summary-row mp-hidden mp-text-success" id="batchBuyDiscountRow">
            <span class="mp-summary-label">Volume Discount</span>
            <span class="mp-summary-value" id="batchBuyDiscount">-0.00 OVG</span>
          </div>
          <div class="mp-summary-row">
            <span class="mp-summary-label">Total Cost</span>
            <span class="mp-summary-value mp-summary-total" id="batchBuySummaryTotal">0.00 OVG</span>
          </div>
        </div>
        <div class="mp-info-box mp-info-success mp-mt-12 mp-text-sm">
          Buy more than 5 OVG worth to get 2% off, or 20 OVG for 5% off!
        </div>
      </div>
      <div class="mp-modal-footer mp-modal-footer-duo">
        <button class="mp-btn mp-btn-ghost" onclick="window.batchBuyWizard?.close?.()">Cancel</button>
        <button class="mp-btn mp-btn-cta-buy" id="batchBuySubmitBtn">Buy All</button>
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
  document.getElementById('batchBuySubmitBtn')?.addEventListener('click', submit)
}

/**
 * Open batch buy wizard with selected items
 * @param {Array} items - Array of selected explore items
 */
export function open(items) {
  ensureModal()

  const itemsArray = Array.isArray(items) ? items : Array.from(items?.values?.() ?? [])
  if (itemsArray.length === 0) {
    showToast('warning', 'No Items Selected', 'Select items to buy')
    return
  }

  selectedItems = new Map(itemsArray.map(item => [item.id, item]))

  const itemsList = document.getElementById('batchBuyItemsList')
  const modalCount = document.getElementById('batchBuyModalCount')
  const summaryItems = document.getElementById('batchBuySummaryItems')

  if (modalCount) modalCount.textContent = selectedItems.size
  if (summaryItems) summaryItems.textContent = selectedItems.size

  if (itemsList) {
    itemsList.innerHTML = Array.from(selectedItems.values()).map(item => `
      <div class="mp-batch-item" data-batch-buy-id="${item.id}">
        <div class="mp-batch-item-image">
          <img src="${item.image}" alt="${item.title}">
        </div>
        <div class="mp-batch-item-info">
          <div class="mp-batch-item-name">${item.title}</div>
          <div class="mp-batch-item-collection">${item.collection}</div>
        </div>
        <div class="mp-batch-item-price-display">
          <span class="mp-batch-item-price-value">${item.price}</span>
        </div>
        <button class="mp-batch-item-remove" onclick="window.batchBuyWizard?.removeItem?.('${item.id}')">&times;</button>
      </div>
    `).join('')
  }

  resetConfirmState()
  updateTotal()
  openModal(MODAL_ID)
}

/**
 * Close batch buy wizard
 */
export function close() {
  selectedItems.clear()
  resetConfirmState()
  closeModal(MODAL_ID)
}

/**
 * Reset confirm button state
 */
function resetConfirmState() {
  confirmMode = false
  const btn = document.getElementById('batchBuySubmitBtn')
  if (btn) {
    btn.textContent = 'Buy All'
    btn.classList.remove('mp-btn-warning')
    btn.classList.add('mp-btn-cta-buy')
  }
}

/**
 * Remove item from batch
 * @param {string} itemId - Item ID to remove
 */
export function removeItem(itemId) {
  selectedItems.delete(itemId)
  document.querySelector(`.mp-batch-item[data-batch-buy-id="${itemId}"]`)?.remove()

  const count = selectedItems.size
  const modalCount = document.getElementById('batchBuyModalCount')
  const summaryItems = document.getElementById('batchBuySummaryItems')
  if (modalCount) modalCount.textContent = count
  if (summaryItems) summaryItems.textContent = count

  resetConfirmState()
  updateTotal()

  if (count === 0) close()
}

/**
 * Calculate and update batch total with volume discount
 */
export function updateTotal() {
  let subtotal = 0
  selectedItems.forEach(item => {
    subtotal += item.priceNum || 0
  })

  // Volume discount: 2% off if total > 5 OVG, 5% if > 20 OVG
  let discountPercent = 0
  if (subtotal > 20) {
    discountPercent = 5
  } else if (subtotal > 5) {
    discountPercent = 2
  }

  const discount = subtotal * (discountPercent / 100)
  const total = subtotal - discount

  const totalEl = document.getElementById('batchBuySummaryTotal')
  const discountEl = document.getElementById('batchBuyDiscount')
  const discountRow = document.getElementById('batchBuyDiscountRow')

  if (totalEl) totalEl.textContent = `${total.toFixed(2)} OVG`

  if (discountEl && discountRow) {
    if (discountPercent > 0) {
      discountEl.textContent = `-${discount.toFixed(2)} OVG (${discountPercent}%)`
      discountRow.classList.remove('mp-hidden')
    } else {
      discountRow.classList.add('mp-hidden')
    }
  }
}

/**
 * Submit batch purchase (two-step confirmation)
 */
export async function submit() {
  if (selectedItems.size === 0) {
    showToast('warning', 'No Items', 'No items selected for purchase')
    return
  }

  const btn = document.getElementById('batchBuySubmitBtn')

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

  // Second click: execute batch purchase
  resetConfirmState()
  closeModal(MODAL_ID)

  try {
    await blockchain.batchBuy(Array.from(selectedItems.keys()))
  } catch (error) {
    // Error toast shown by blockchain.js
  }
}

export function init() {
  window.batchBuyWizard = { open, close, submit, removeItem, updateTotal, generateHTML }
  window.confirmBatchBuy = submit
}

init()

export default { open, close, submit, removeItem, updateTotal, generateHTML, init }
