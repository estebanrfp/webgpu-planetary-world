/**
 * Batch Sell Wizard
 * List multiple assets for sale at once
 * @module marketplace/wizards/batchSellWizard
 */

import { openModal, closeModal } from '../handlers/modals.js'
import { blockchain } from '../services/blockchain.js'
import { showToast } from '../services/toast.js'

const MODAL_ID = 'batchSellModal'
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
        <h2 class="mp-modal-title">Batch List Items</h2>
        <div class="mp-modal-header-right">
          <span class="mp-header-wallet">0x1234...5678 | <strong>156.8 OVG</strong></span>
          <button class="mp-modal-close" onclick="window.batchSellWizard?.close?.()">&times;</button>
        </div>
      </div>
      <div class="mp-modal-body">
        <div class="mp-batch-info">
          <span class="mp-batch-info-count"><span id="batchModalCount">0</span> items selected</span>
          <span class="mp-batch-info-hint">Set individual prices for each item</span>
        </div>

        <div class="mp-batch-items" id="batchItemsList">
          <!-- Items will be populated dynamically -->
        </div>

        <div class="mp-batch-summary">
          <div class="mp-summary-row">
            <span class="mp-summary-label">Items to List</span>
            <span class="mp-summary-value" id="batchSummaryItems">0</span>
          </div>
          <div class="mp-summary-row">
            <span class="mp-summary-label">Total Value</span>
            <span class="mp-summary-value mp-summary-total" id="batchSummaryTotal">0.00 OVG</span>
          </div>
        </div>
      </div>
      <div class="mp-modal-footer mp-modal-footer-duo">
        <button class="mp-btn mp-btn-ghost" onclick="window.batchSellWizard?.close?.()">Cancel</button>
        <button class="mp-btn mp-btn-cta-sell" id="batchSellSubmitBtn">List All Items</button>
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
  document.getElementById('batchSellSubmitBtn')?.addEventListener('click', submit)

  // Delegated event listener for dynamic price inputs
  document.getElementById('batchItemsList')?.addEventListener('input', (e) => {
    if (e.target.matches('.mp-batch-item-price input')) {
      resetConfirmState()
      updateTotal()
    }
  })
}

/**
 * Open batch sell wizard with selected items
 * @param {Array} items - Array of selected inventory items
 */
export function open(items) {
  ensureModal()

  const itemsArray = Array.isArray(items) ? items : Array.from(items?.values?.() ?? [])
  if (itemsArray.length < 2) {
    showToast('warning', 'Select More Items', 'Select at least 2 items for batch sell')
    return
  }

  // Keep each selected item with its realAssetId
  selectedItems = new Map()
  for (const item of itemsArray) {
    selectedItems.set(item.id, {
      ...item,
      realAssetId: item.realAssetId || item.id
    })
  }

  const itemsList = document.getElementById('batchItemsList')
  const modalCount = document.getElementById('batchModalCount')
  const summaryItems = document.getElementById('batchSummaryItems')

  if (modalCount) modalCount.textContent = selectedItems.size
  if (summaryItems) summaryItems.textContent = selectedItems.size

  if (itemsList) {
    itemsList.innerHTML = Array.from(selectedItems.values()).map(item => {
      const unitLabel = item.unitIndex ? ` <span class="mp-text-muted">#${item.unitIndex}</span>` : ''
      return `
        <div class="mp-batch-item" data-batch-id="${item.id}" data-real-asset-id="${item.realAssetId}">
          <div class="mp-batch-item-image">
            <img src="${item.image}" alt="${item.title}">
          </div>
          <div class="mp-batch-item-info">
            <div class="mp-batch-item-name">${item.title}${unitLabel}</div>
            <div class="mp-batch-item-collection">${item.collection}</div>
          </div>
          <div class="mp-batch-item-price">
            <input type="number" placeholder="Price" step="0.01">
          </div>
          <button class="mp-batch-item-remove" onclick="window.batchSellWizard?.removeItem?.('${item.id}')">&times;</button>
        </div>
      `
    }).join('')
  }

  resetConfirmState()
  updateTotal()
  openModal(MODAL_ID)
}

/**
 * Close batch sell wizard
 */
export function close() {
  selectedItems.clear()
  resetConfirmState()
  closeModal(MODAL_ID)
}

/**
 * Remove item from batch
 * @param {string} itemId - Item ID to remove
 */
export function removeItem(itemId) {
  selectedItems.delete(itemId)
  document.querySelector(`.mp-batch-item[data-batch-id="${itemId}"]`)?.remove()

  const count = selectedItems.size
  const modalCount = document.getElementById('batchModalCount')
  const summaryItems = document.getElementById('batchSummaryItems')
  if (modalCount) modalCount.textContent = count
  if (summaryItems) summaryItems.textContent = count

  resetConfirmState()
  updateTotal()

  if (count < 2) close()
}

/**
 * Calculate and update batch total
 */
export function updateTotal() {
  const inputs = document.querySelectorAll('.mp-batch-item-price input')
  let total = 0
  inputs.forEach(input => { total += parseFloat(input.value) || 0 })
  const totalEl = document.getElementById('batchSummaryTotal')
  if (totalEl) totalEl.textContent = `${total.toFixed(2)} OVG`
}

/**
 * Reset confirm button state
 */
function resetConfirmState() {
  confirmMode = false
  const btn = document.getElementById('batchSellSubmitBtn')
  if (btn) {
    btn.textContent = 'List All Items'
    btn.classList.remove('mp-btn-warning')
    btn.classList.add('mp-btn-cta-sell')
  }
}

/**
 * Submit batch listings (two-step confirmation)
 */
export async function submit() {
  if (selectedItems.size < 2) {
    showToast('warning', 'Not Enough Items', 'Select at least 2 items')
    return
  }

  const btn = document.getElementById('batchSellSubmitBtn')

  // First click: switch to confirm mode
  if (!confirmMode) {
    confirmMode = true
    if (btn) {
      btn.textContent = 'Confirm'
      btn.classList.remove('mp-btn-cta-sell')
      btn.classList.add('mp-btn-warning')
    }
    return
  }

  // Second click: validate and execute batch listing
  const inputs = document.querySelectorAll('.mp-batch-item-price input')
  let allValid = true
  inputs.forEach(input => {
    if (!parseFloat(input.value) || parseFloat(input.value) <= 0) allValid = false
  })

  if (!allValid) {
    showToast('warning', 'Invalid Prices', 'Please set a valid price for each item')
    resetConfirmState()
    return
  }

  // Collect items with their prices using realAssetId
  const itemsWithPrices = []
  document.querySelectorAll('.mp-batch-item').forEach(el => {
    const realAssetId = el.dataset.realAssetId
    const price = parseFloat(el.querySelector('.mp-batch-item-price input')?.value) || 0
    if (realAssetId && price > 0) {
      itemsWithPrices.push({ id: realAssetId, price })
    }
  })

  resetConfirmState()
  closeModal(MODAL_ID)

  try {
    await blockchain.batchList(itemsWithPrices)
    // Exit select mode after successful batch listing
    window.disableInventorySelectMode?.()
  } catch (error) {
    // Error toast shown by blockchain.js
  }
}

export function init() {
  window.batchSellWizard = { open, close, submit, removeItem, updateTotal, generateHTML }
  window.confirmBatchSell = submit
}

init()

export default { open, close, submit, removeItem, updateTotal, generateHTML, init }
