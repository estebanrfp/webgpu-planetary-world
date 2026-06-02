/**
 * Edit Bundle Wizard
 * Edit name/price of an existing bundle listing
 * @module marketplace/wizards/editBundleWizard
 */

import { openModal, closeModal } from '../handlers/modals.js'
import { closeDetailPanel } from '../handlers/navigation.js'
import { blockchain } from '../services/blockchain.js'
import { showToast } from '../services/toast.js'

const MODAL_ID = 'editBundleModal'
const OVG_USD_RATE = 355
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
        <h2 class="mp-modal-title">Edit Bundle Listing</h2>
        <button class="mp-modal-close" onclick="window.editBundleWizard?.close?.()">&times;</button>
      </div>
      <div class="mp-modal-body">
        <div class="mp-alert-info mp-mb-16">
          <span>📦</span> Bundle is listed for sale
        </div>

        <div class="mp-form-group">
          <label class="mp-form-label">Bundle Name</label>
          <input type="text" class="mp-input" id="editBundleNameInput" placeholder="e.g. Starter Pack" maxlength="64">
          <div class="mp-char-counter" id="editBundleNameCounter">0 / 64</div>
        </div>

        <div class="mp-form-group">
          <label class="mp-form-label">Description</label>
          <textarea class="mp-input mp-textarea" id="editBundleDescriptionInput" placeholder="Describe your bundle... URLs will be auto-linked" maxlength="160" rows="2"></textarea>
          <div class="mp-char-counter" id="editBundleDescriptionCounter">0 / 160</div>
        </div>

        <div class="mp-form-group">
          <label class="mp-form-label">Price</label>
          <div class="mp-input-group">
            <input type="number" class="mp-input" id="editBundlePriceInput" placeholder="0.00" step="0.01" min="0">
            <span class="mp-input-addon">OVG</span>
          </div>
          <div class="mp-form-hint" id="editBundlePriceHint">~$0 USD</div>
        </div>

        <div class="mp-form-group">
          <label class="mp-form-label">Contents <span class="mp-text-muted" id="editBundleItemCount">(0 items)</span></label>
          <div class="mp-bundle-items-grid" id="editBundleItemsGrid">
            <!-- Bundle items preview (read-only) -->
          </div>
        </div>

        <div class="mp-summary">
          <div class="mp-summary-row"><span class="mp-summary-label">Bundle Price</span><span class="mp-summary-value" id="editBundleCurrentPrice">0 OVG</span></div>
          <div class="mp-summary-row"><span class="mp-summary-label">Service Fee (2.5%)</span><span class="mp-summary-value" id="editBundleFee">0 OVG</span></div>
          <div class="mp-summary-row"><span class="mp-summary-label">You receive</span><span class="mp-summary-value mp-summary-total" id="editBundleReceive">0 OVG</span></div>
        </div>
      </div>
      <div class="mp-modal-footer">
        <button class="mp-btn mp-btn-ghost mp-btn-flex" onclick="window.editBundleWizard?.close?.()">Cancel</button>
        <button class="mp-btn mp-btn-danger mp-btn-flex" id="editBundleCancelBtn">Cancel Listing</button>
        <button class="mp-btn mp-btn-primary mp-btn-flex" id="editBundleSubmitBtn">Update Listing</button>
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
  document.getElementById('editBundleSubmitBtn')?.addEventListener('click', submit)
  document.getElementById('editBundleCancelBtn')?.addEventListener('click', cancelBundle)
  document.getElementById('editBundlePriceInput')?.addEventListener('input', () => {
    resetConfirmState()
    updateSummary()
  })
  document.getElementById('editBundleNameInput')?.addEventListener('input', () => {
    resetConfirmState()
    updateNameCounter()
  })
  document.getElementById('editBundleDescriptionInput')?.addEventListener('input', () => {
    resetConfirmState()
    updateDescriptionCounter()
  })
}

/**
 * Update name character counter
 */
function updateNameCounter() {
  const input = document.getElementById('editBundleNameInput')
  const counter = document.getElementById('editBundleNameCounter')
  if (input && counter) counter.textContent = `${input.value.length} / 64`
}

/**
 * Update description character counter
 */
function updateDescriptionCounter() {
  const input = document.getElementById('editBundleDescriptionInput')
  const counter = document.getElementById('editBundleDescriptionCounter')
  if (input && counter) counter.textContent = `${input.value.length} / 160`
}

/**
 * Update price summary
 */
function updateSummary() {
  const price = parseFloat(document.getElementById('editBundlePriceInput')?.value) || 0
  const fee = price * 0.025
  const receive = price - fee
  const usdValue = Math.round(price * OVG_USD_RATE)

  document.getElementById('editBundlePriceHint').textContent = `~$${usdValue.toLocaleString()} USD`
  document.getElementById('editBundleCurrentPrice').textContent = `${price.toFixed(2)} OVG`
  document.getElementById('editBundleFee').textContent = `-${fee.toFixed(4)} OVG`
  document.getElementById('editBundleReceive').textContent = `${receive.toFixed(4)} OVG`
}

/**
 * Reset confirm button states
 */
function resetConfirmState() {
  confirmModeUpdate = false
  confirmModeCancel = false

  const updateBtn = document.getElementById('editBundleSubmitBtn')
  const cancelBtn = document.getElementById('editBundleCancelBtn')

  if (updateBtn) {
    updateBtn.textContent = 'Update Listing'
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
 * Open edit bundle wizard for a listing
 * @param {object} itemData - Listing data {id, title, price, priceNum, bundleItems}
 */
export function open(itemData) {
  ensureModal()
  currentItem = itemData
  closeDetailPanel()

  const { title, price, priceNum, bundleItems = [], description } = itemData

  // Parse price - handle both "4.5 OVG" string and numeric values
  const numericPrice = priceNum || (typeof price === 'string' ? parseFloat(price) : price) || 0

  document.getElementById('editBundleNameInput').value = title || 'Untitled Bundle'
  document.getElementById('editBundleDescriptionInput').value = description || ''
  document.getElementById('editBundlePriceInput').value = numericPrice
  document.getElementById('editBundleItemCount').textContent = `(${bundleItems.length} items)`

  // Render bundle items as read-only preview
  const itemsGrid = document.getElementById('editBundleItemsGrid')
  if (itemsGrid) {
    itemsGrid.innerHTML = bundleItems.map(item => `
      <div class="mp-bundle-item">
        <div class="mp-bundle-item-image">
          <img src="${item.image || ''}" alt="${item.title}" loading="lazy">
        </div>
        <div class="mp-bundle-item-info">
          <div class="mp-bundle-item-name">${item.title}</div>
        </div>
      </div>
    `).join('')
  }

  resetConfirmState()
  updateNameCounter()
  updateDescriptionCounter()
  updateSummary()
  openModal(MODAL_ID)
}

/**
 * Close edit bundle wizard
 */
export function close() {
  currentItem = null
  resetConfirmState()
  closeModal(MODAL_ID)
}

/**
 * Cancel bundle listing (two-step confirmation)
 */
async function cancelBundle() {
  if (!currentItem) return

  const btn = document.getElementById('editBundleCancelBtn')

  // First click: switch to confirm mode
  if (!confirmModeCancel) {
    confirmModeCancel = true
    confirmModeUpdate = false // Reset other button
    if (btn) {
      btn.textContent = 'Confirm Cancel'
      btn.classList.remove('mp-btn-danger')
      btn.classList.add('mp-btn-warning')
    }
    // Reset update button
    const updateBtn = document.getElementById('editBundleSubmitBtn')
    if (updateBtn) {
      updateBtn.textContent = 'Update Listing'
      updateBtn.classList.remove('mp-btn-warning')
      updateBtn.classList.add('mp-btn-primary')
    }
    return
  }

  // Second click: execute cancel
  resetConfirmState()
  closeModal(MODAL_ID)

  try {
    await blockchain.cancelBundle(currentItem.id)
  } catch (error) {
    // Error toast shown by blockchain.js
  }
}

/**
 * Submit bundle update (two-step confirmation)
 */
export async function submit() {
  if (!currentItem) {
    showToast('error', 'Error', 'No item selected')
    return
  }

  const newTitle = document.getElementById('editBundleNameInput')?.value?.trim()
  const newDescription = document.getElementById('editBundleDescriptionInput')?.value?.trim()
  const newPrice = parseFloat(document.getElementById('editBundlePriceInput')?.value)

  if (!newPrice || newPrice <= 0) {
    showToast('warning', 'Invalid Price', 'Please enter a valid price')
    return
  }

  const btn = document.getElementById('editBundleSubmitBtn')

  // First click: switch to confirm mode
  if (!confirmModeUpdate) {
    confirmModeUpdate = true
    confirmModeCancel = false // Reset other button
    if (btn) {
      btn.textContent = 'Confirm'
      btn.classList.remove('mp-btn-primary')
      btn.classList.add('mp-btn-warning')
    }
    // Reset cancel button
    const cancelBtn = document.getElementById('editBundleCancelBtn')
    if (cancelBtn) {
      cancelBtn.textContent = 'Cancel Listing'
      cancelBtn.classList.remove('mp-btn-warning')
      cancelBtn.classList.add('mp-btn-danger')
    }
    return
  }

  // Second click: execute update
  resetConfirmState()
  closeModal(MODAL_ID)

  try {
    const titleChanged = newTitle && newTitle !== currentItem.title
    const descriptionChanged = newDescription !== (currentItem.description || '')
    await blockchain.updateBundle(currentItem.id, {
      title: titleChanged ? newTitle : null,
      description: descriptionChanged ? newDescription : null,
      price: newPrice
    })
  } catch (error) {
    // Error toast shown by blockchain.js
  }
}

export function init() {
  window.editBundleWizard = { open, close, submit, generateHTML }
}

init()

export default { open, close, submit, generateHTML, init }
