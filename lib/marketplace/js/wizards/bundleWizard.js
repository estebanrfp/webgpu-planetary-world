/**
 * Bundle Wizard
 * Create a new bundle from selected inventory items
 * @module marketplace/wizards/bundleWizard
 */

import { openModal, closeModal } from '../handlers/modals.js'
import { blockchain } from '../services/blockchain.js'
import { showToast } from '../services/toast.js'

const MODAL_ID = 'bundleModal'
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
        <h2 class="mp-modal-title">Create Bundle</h2>
        <div class="mp-modal-header-right">
          <span class="mp-header-wallet">0x1234...5678 | <strong>156.8 OVG</strong></span>
          <button class="mp-modal-close" onclick="window.bundleWizard?.close?.()">&times;</button>
        </div>
      </div>
      <div class="mp-modal-body">
        <div class="mp-batch-info">
          <span class="mp-batch-info-count"><span id="bundleModalCount">0</span> items selected</span>
          <span class="mp-batch-info-hint">Review items for your bundle</span>
        </div>

        <!-- Selected items preview -->
        <div class="mp-batch-items" id="bundleItemsList">
          <!-- Items populated dynamically -->
        </div>

        <div class="mp-form-group">
          <label class="mp-form-label">Bundle Name <span class="mp-text-dim">(optional)</span></label>
          <input type="text" class="mp-input" id="bundleNameInput" placeholder="e.g. Starter Pack, Premium Collection..." maxlength="64">
          <div class="mp-char-counter" id="bundleNameCounter">0 / 64</div>
        </div>

        <div class="mp-form-group">
          <label class="mp-form-label">Description</label>
          <textarea class="mp-input mp-textarea" id="bundleDescriptionInput" placeholder="Describe your bundle... URLs will be auto-linked" maxlength="160" rows="2"></textarea>
          <div class="mp-char-counter" id="bundleDescriptionCounter">0 / 160</div>
        </div>

        <div class="mp-form-group">
          <label class="mp-form-label">Bundle Price</label>
          <div class="mp-input-group">
            <input type="number" class="mp-input" id="bundlePriceInput" placeholder="0.00" step="0.01">
            <span class="mp-input-addon">OVG</span>
          </div>
        </div>

        <div class="mp-batch-summary">
          <div class="mp-summary-row">
            <span class="mp-summary-label">Items in Bundle</span>
            <span class="mp-summary-value" id="bundleSummaryItems">0</span>
          </div>
          <div class="mp-summary-row">
            <span class="mp-summary-label">Bundle Price</span>
            <span class="mp-summary-value mp-summary-total" id="bundleSummaryPrice">0.00 OVG</span>
          </div>
        </div>
      </div>
      <div class="mp-modal-footer mp-modal-footer-duo">
        <button class="mp-btn mp-btn-ghost" onclick="window.bundleWizard?.close?.()">Cancel</button>
        <button class="mp-btn mp-btn-cta-bundle" id="bundleSubmitBtn">Create Bundle</button>
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
  document.getElementById('bundlePriceInput')?.addEventListener('input', () => {
    resetConfirmState()
    updateSummary()
  })
  document.getElementById('bundleNameInput')?.addEventListener('input', () => {
    resetConfirmState()
    updateNameCounter()
  })
  document.getElementById('bundleDescriptionInput')?.addEventListener('input', () => {
    resetConfirmState()
    updateDescriptionCounter()
  })
  document.getElementById('bundleSubmitBtn')?.addEventListener('click', submit)
}

/**
 * Open bundle wizard with selected items
 * @param {Array} items - Array of selected inventory items
 */
export function open(items) {
  ensureModal()

  const itemsArray = Array.isArray(items) ? items : Array.from(items?.values?.() ?? [])
  if (itemsArray.length < 2) {
    showToast('warning', 'Select More Items', 'Select at least 2 items to create a bundle')
    return
  }

  // Keep each selected item as separate entry (no grouping)
  selectedItems = new Map()
  for (const item of itemsArray) {
    selectedItems.set(item.id, {
      ...item,
      realAssetId: item.realAssetId || item.id
    })
  }

  const itemCount = selectedItems.size

  const itemsList = document.getElementById('bundleItemsList')
  const modalCount = document.getElementById('bundleModalCount')
  const summaryItems = document.getElementById('bundleSummaryItems')
  const nameInput = document.getElementById('bundleNameInput')
  const descriptionInput = document.getElementById('bundleDescriptionInput')
  const priceInput = document.getElementById('bundlePriceInput')
  const charCounter = document.getElementById('bundleNameCounter')

  if (modalCount) modalCount.textContent = itemCount
  if (summaryItems) summaryItems.textContent = itemCount
  if (nameInput) nameInput.value = ''
  if (descriptionInput) descriptionInput.value = ''
  if (priceInput) priceInput.value = ''
  if (charCounter) charCounter.textContent = '0 / 64'

  const descCounter = document.getElementById('bundleDescriptionCounter')
  if (descCounter) descCounter.textContent = '0 / 160'

  if (itemsList) {
    itemsList.innerHTML = Array.from(selectedItems.values()).map(item => {
      const unitLabel = item.unitIndex ? ` <span class="mp-text-muted">#${item.unitIndex}</span>` : ''
      return `
        <div class="mp-bundle-preview-item">
          <img src="${item.image}" alt="${item.title}">
          <div class="mp-bundle-preview-info">
            <div class="mp-bundle-preview-name">${item.title}${unitLabel}</div>
            <div class="mp-bundle-preview-collection">${item.collection}</div>
          </div>
        </div>
      `
    }).join('')
  }

  resetConfirmState()
  updateSummary()
  openModal(MODAL_ID)
  nameInput?.focus()
}

/**
 * Close bundle wizard
 */
export function close() {
  selectedItems.clear()
  resetConfirmState()
  closeModal(MODAL_ID)
}

/**
 * Update bundle summary based on price input
 */
export function updateSummary() {
  const priceInput = document.getElementById('bundlePriceInput')
  const summaryPrice = document.getElementById('bundleSummaryPrice')
  const price = parseFloat(priceInput?.value) || 0
  if (summaryPrice) summaryPrice.textContent = `${price.toFixed(2)} OVG`
}

/**
 * Update name character counter
 */
export function updateNameCounter() {
  const nameInput = document.getElementById('bundleNameInput')
  const charCounter = document.getElementById('bundleNameCounter')
  const length = nameInput?.value?.length || 0
  if (charCounter) charCounter.textContent = `${length} / 64`
}

/**
 * Update description character counter
 */
function updateDescriptionCounter() {
  const input = document.getElementById('bundleDescriptionInput')
  const counter = document.getElementById('bundleDescriptionCounter')
  if (input && counter) counter.textContent = `${input.value.length} / 160`
}

/**
 * Reset confirm button state
 */
function resetConfirmState() {
  confirmMode = false
  const btn = document.getElementById('bundleSubmitBtn')
  if (btn) {
    btn.textContent = 'Create Bundle'
    btn.classList.remove('mp-btn-warning')
    btn.classList.add('mp-btn-cta-bundle')
  }
}

/**
 * Submit bundle creation (two-step confirmation)
 */
export async function submit() {
  if (selectedItems.size < 2) {
    showToast('warning', 'Not Enough Items', 'Select at least 2 items')
    return
  }

  const btn = document.getElementById('bundleSubmitBtn')

  // First click: switch to confirm mode
  if (!confirmMode) {
    confirmMode = true
    if (btn) {
      btn.textContent = 'Confirm'
      btn.classList.remove('mp-btn-cta-bundle')
      btn.classList.add('mp-btn-warning')
    }
    return
  }

  // Second click: validate and execute bundle creation
  const nameInput = document.getElementById('bundleNameInput')
  const descriptionInput = document.getElementById('bundleDescriptionInput')
  const priceInput = document.getElementById('bundlePriceInput')
  const price = parseFloat(priceInput?.value) || 0

  if (price <= 0) {
    showToast('warning', 'Invalid Price', 'Please enter a valid price for the bundle')
    resetConfirmState()
    return
  }

  const bundleName = nameInput?.value?.trim() || `Bundle (${selectedItems.size} items)`
  const description = descriptionInput?.value?.trim() || ''

  resetConfirmState()
  closeModal(MODAL_ID)

  try {
    // Extract real asset IDs (not virtual IDs like asset_123:unit:1)
    const realAssetIds = Array.from(selectedItems.values()).map(item => item.realAssetId)
    await blockchain.createBundle(realAssetIds, bundleName, price, description)
    // Exit select mode after successful bundle creation
    window.disableInventorySelectMode?.()
  } catch (error) {
    // Error toast shown by blockchain.js
  }
}

export function init() {
  window.bundleWizard = { open, close, submit, updateSummary, updateNameCounter, generateHTML }
  window.confirmCreateBundle = submit
}

init()

export default { open, close, submit, updateSummary, updateNameCounter, generateHTML, init }
