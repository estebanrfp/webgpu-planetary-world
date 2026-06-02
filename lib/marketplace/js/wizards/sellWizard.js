/**
 * Sell Wizard
 * List an asset for sale
 * @module marketplace/wizards/sellWizard
 */

import { openModal, closeModal } from '../handlers/modals.js'
import { closeDetailPanel } from '../handlers/navigation.js'
import { blockchain } from '../services/blockchain.js'
import { showToast } from '../services/toast.js'
import { NO_IMAGE } from '../core/constants.js'

const MODAL_ID = 'sellModal'
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
        <h2 class="mp-modal-title">List for Sale</h2>
        <div class="mp-modal-header-right">
          <span class="mp-header-wallet">0x1234...5678 | <strong>156.8 OVG</strong></span>
          <button class="mp-modal-close" onclick="window.sellWizard?.close?.()">&times;</button>
        </div>
      </div>
      <div class="mp-modal-body">
        <div class="mp-asset-preview">
          <div class="mp-asset-preview-image"><img loading="lazy" decoding="async" src="${NO_IMAGE}" alt="Asset" id="sellAssetImage"></div>
          <div class="mp-asset-preview-info">
            <div class="mp-asset-preview-collection" id="sellAssetCollection">Mythic Weapons</div>
            <div class="mp-asset-preview-name" id="sellAssetName">Asset Name</div>
          </div>
        </div>

        <div class="mp-form-group mp-hidden" id="sellAmountGroup">
          <label class="mp-form-label">Quantity to list</label>
          <div class="mp-input-group">
            <input type="number" class="mp-input" id="sellAmountInput" placeholder="1" min="1" value="1">
            <span class="mp-input-addon" id="sellAmountMax">/ 1</span>
          </div>
          <div class="mp-form-hint">You have <span id="sellAvailableSupply">1</span> copies available</div>
        </div>

        <div class="mp-form-group">
          <label class="mp-form-label">Price per unit</label>
          <div class="mp-input-group">
            <input type="number" class="mp-input" id="sellPriceInput" placeholder="0.00" value="1.5">
            <span class="mp-input-addon">OVG</span>
          </div>
          <div class="mp-form-hint">Service fee: 2.5%</div>
        </div>

        <div class="mp-form-group">
          <label class="mp-form-label">Duration</label>
          <div class="mp-duration-pills" id="sellDurationPills">
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

        <div class="mp-summary" id="sellSummary">
          <div class="mp-summary-row"><span class="mp-summary-label">Listing Price</span><span class="mp-summary-value" id="sellSummaryPrice">1.5 OVG</span></div>
          <div class="mp-summary-row"><span class="mp-summary-label">Service Fee (<span class="mp-text-success">2.5%</span>)</span><span class="mp-summary-value" id="sellSummaryFee">-0.0375 OVG</span></div>
          <div class="mp-summary-row"><span class="mp-summary-label">Creator Royalty (<span id="sellSummaryRoyaltyPct" class="mp-text-success">5%</span>)</span><span class="mp-summary-value" id="sellSummaryRoyalty">-0.075 OVG</span></div>
          <div class="mp-summary-row"><span class="mp-summary-label">You receive</span><span class="mp-summary-value mp-summary-total" id="sellSummaryTotal">1.3875 OVG</span></div>
        </div>
      </div>
      <div class="mp-modal-footer mp-modal-footer-duo">
        <button class="mp-btn mp-btn-ghost" onclick="window.sellWizard?.close?.()">Cancel</button>
        <button class="mp-btn mp-btn-cta-sell" id="sellSubmitBtn">List Item</button>
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
  document.getElementById('sellSubmitBtn')?.addEventListener('click', submit)
  document.getElementById('sellPriceInput')?.addEventListener('input', () => {
    resetConfirmState()
    updateSummary()
  })
  document.getElementById('sellAmountInput')?.addEventListener('input', () => {
    resetConfirmState()
    updateSummary()
  })

  // Duration pills click handlers
  document.getElementById('sellDurationPills')?.addEventListener('click', (e) => {
    const pill = e.target.closest('.mp-duration-pill')
    if (!pill) return
    document.querySelectorAll('#sellDurationPills .mp-duration-pill').forEach(p => p.classList.remove('active'))
    pill.classList.add('active')
    resetConfirmState()
  })
}

/**
 * Update price summary (considers quantity for ERC-1155)
 */
export function updateSummary() {
  const pricePerUnit = parseFloat(document.getElementById('sellPriceInput')?.value) || 0
  const amount = parseInt(document.getElementById('sellAmountInput')?.value) || 1
  const royaltyPct = currentAsset?.royaltyPct ?? currentAsset?.royalty ?? 5

  const totalPrice = pricePerUnit * amount
  const fee = totalPrice * 0.025
  const royalty = totalPrice * (royaltyPct / 100)
  const total = totalPrice - fee - royalty

  const priceEl = document.getElementById('sellSummaryPrice')
  const feeEl = document.getElementById('sellSummaryFee')
  const royaltyPctEl = document.getElementById('sellSummaryRoyaltyPct')
  const royaltyEl = document.getElementById('sellSummaryRoyalty')
  const totalEl = document.getElementById('sellSummaryTotal')

  const priceLabel = amount > 1 ? `${pricePerUnit.toFixed(4)} x ${amount} = ${totalPrice.toFixed(4)} OVG` : `${totalPrice.toFixed(4)} OVG`
  if (priceEl) priceEl.textContent = priceLabel
  if (feeEl) feeEl.textContent = `-${fee.toFixed(4)} OVG`
  if (royaltyPctEl) royaltyPctEl.textContent = royaltyPct
  if (royaltyEl) royaltyEl.textContent = `-${royalty.toFixed(4)} OVG`
  if (totalEl) totalEl.textContent = `${total.toFixed(4)} OVG`
}

/**
 * Reset confirm button state
 */
function resetConfirmState() {
  confirmMode = false
  const btn = document.getElementById('sellSubmitBtn')
  if (btn) {
    btn.textContent = 'List Item'
    btn.classList.remove('mp-btn-warning')
    btn.classList.add('mp-btn-cta-sell')
  }
}

/**
 * Open sell wizard for an asset
 * @param {object} asset - Asset to sell
 */
export async function open(asset) {
  ensureModal()
  currentAsset = asset
  closeDetailPanel()

  const imageEl = document.getElementById('sellAssetImage')
  const collectionEl = document.getElementById('sellAssetCollection')
  const nameEl = document.getElementById('sellAssetName')
  const priceInput = document.getElementById('sellPriceInput')

  if (imageEl) imageEl.src = asset.image || NO_IMAGE
  if (collectionEl) collectionEl.textContent = asset.collection || 'Unknown'
  if (nameEl) nameEl.textContent = asset.title || asset.name || 'Unnamed Asset'
  if (priceInput) priceInput.value = '1.5'

  // Show/hide quantity selector based on supply (ERC-1155)
  const supply = asset.supply || 1
  const amountGroup = document.getElementById('sellAmountGroup')
  const amountInput = document.getElementById('sellAmountInput')
  const amountMax = document.getElementById('sellAmountMax')
  const availableSupply = document.getElementById('sellAvailableSupply')

  if (supply > 1) {
    amountGroup?.classList.remove('mp-hidden')
    if (amountInput) {
      amountInput.value = supply
      amountInput.max = supply
    }
    if (amountMax) amountMax.textContent = `/ ${supply}`
    if (availableSupply) availableSupply.textContent = supply
  } else {
    amountGroup?.classList.add('mp-hidden')
    if (amountInput) amountInput.value = 1
  }

  resetConfirmState()
  updateSummary()
  openModal(MODAL_ID)
  priceInput?.focus()
}

/**
 * Close sell wizard
 */
export function close() {
  currentAsset = null
  resetConfirmState()
  closeModal(MODAL_ID)
}

/**
 * Submit listing (two-step confirmation)
 */
export async function submit() {
  if (!currentAsset) {
    showToast('error', 'Error', 'No asset selected')
    return
  }

  const price = parseFloat(document.getElementById('sellPriceInput')?.value)

  if (!price || price <= 0) {
    showToast('warning', 'Invalid Price', 'Please enter a valid price')
    return
  }

  const btn = document.getElementById('sellSubmitBtn')

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

  // Second click: execute listing
  const amount = parseInt(document.getElementById('sellAmountInput')?.value) || 1
  const activePill = document.querySelector('#sellDurationPills .mp-duration-pill.active')
  const duration = parseInt(activePill?.dataset.days) || 0

  resetConfirmState()
  closeModal(MODAL_ID)

  try {
    await blockchain.list(currentAsset.id, price, 'sale', { amount, duration })
  } catch (error) {
    // Error toast shown by blockchain.js
  }
}

export function init() {
  window.sellWizard = { open, close, submit, updateSummary, generateHTML }
}

init()

export default { open, close, submit, updateSummary, generateHTML, init }
