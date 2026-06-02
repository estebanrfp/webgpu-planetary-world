/**
 * Gift Wizard
 * Transfer/gift an asset to another address
 * @module marketplace/wizards/giftWizard
 */

import { openModal, closeModal } from '../handlers/modals.js'
import { closeDetailPanel } from '../handlers/navigation.js'
import { blockchain } from '../services/blockchain.js'
import { showToast } from '../services/toast.js'
import { NO_IMAGE } from '../core/constants.js'

const MODAL_ID = 'giftModal'
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
        <h2 class="mp-modal-title">Transfer Asset</h2>
        <div class="mp-modal-header-right">
          <span class="mp-header-wallet">0x1234...5678 | <strong>156.8 OVG</strong></span>
          <button class="mp-modal-close" onclick="window.giftWizard?.close?.()">&times;</button>
        </div>
      </div>
      <div class="mp-modal-body">
        <div class="mp-asset-preview">
          <div class="mp-asset-preview-image"><img loading="lazy" decoding="async" src="${NO_IMAGE}" alt="Asset" id="giftAssetImage"></div>
          <div class="mp-asset-preview-info">
            <div class="mp-asset-preview-collection" id="giftAssetCollection">Street Wear</div>
            <div class="mp-asset-preview-name" id="giftAssetName">Urban Hoodie</div>
          </div>
        </div>

        <div class="mp-form-group">
          <label class="mp-form-label">Recipient address</label>
          <input type="text" class="mp-input" id="giftRecipient" placeholder="0x...">
          <div class="mp-form-hint">Enter the wallet address of the recipient</div>
        </div>

        <div class="mp-form-group mp-hidden" id="giftAmountGroup">
          <label class="mp-form-label">Amount to transfer</label>
          <div class="mp-input-group">
            <input type="number" class="mp-input" id="giftAmount" min="1" value="1">
            <span class="mp-input-addon" id="giftSupplyDisplay">/ 1</span>
          </div>
          <div class="mp-form-hint">You own multiple copies of this asset</div>
        </div>
      </div>
      <div class="mp-modal-footer mp-modal-footer-duo">
        <button class="mp-btn mp-btn-ghost" onclick="window.giftWizard?.close?.()">Cancel</button>
        <button class="mp-btn mp-btn-cta-gift" id="giftSubmitBtn">Send Gift</button>
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
  document.getElementById('giftSubmitBtn')?.addEventListener('click', submit)
  document.getElementById('giftRecipient')?.addEventListener('input', resetConfirmState)
  document.getElementById('giftAmount')?.addEventListener('input', resetConfirmState)
}

/**
 * Validate Ethereum address
 * @param {string} address - Address to validate
 * @returns {boolean} Is valid
 */
function isValidAddress(address) {
  return /^0x[a-fA-F0-9]{40}$/.test(address)
}

/**
 * Reset confirm button state
 */
function resetConfirmState() {
  confirmMode = false
  const btn = document.getElementById('giftSubmitBtn')
  if (btn) {
    btn.textContent = 'Send Gift'
    btn.classList.remove('mp-btn-warning')
    btn.classList.add('mp-btn-cta-gift')
  }
}

/**
 * Open gift wizard for an asset
 * @param {object} asset - Asset to gift
 */
export function open(asset) {
  ensureModal()
  currentAsset = asset
  closeDetailPanel()

  const imageEl = document.getElementById('giftAssetImage')
  const collectionEl = document.getElementById('giftAssetCollection')
  const nameEl = document.getElementById('giftAssetName')
  const recipientInput = document.getElementById('giftRecipient')
  const amountGroup = document.getElementById('giftAmountGroup')
  const amountInput = document.getElementById('giftAmount')
  const supplyDisplay = document.getElementById('giftSupplyDisplay')

  if (imageEl) imageEl.src = asset.image || NO_IMAGE
  if (collectionEl) collectionEl.textContent = asset.collection || 'Unknown'
  if (nameEl) nameEl.textContent = asset.title || asset.name || 'Unnamed Asset'
  if (recipientInput) recipientInput.value = ''

  // Show amount field if asset has multiple copies (ERC-1155)
  const supply = asset.supply || 1
  if (supply > 1) {
    amountGroup?.classList.remove('mp-hidden')
    if (amountInput) {
      amountInput.value = '1'
      amountInput.max = supply
    }
    if (supplyDisplay) supplyDisplay.textContent = `/ ${supply}`
  } else {
    amountGroup?.classList.add('mp-hidden')
    if (amountInput) amountInput.value = '1'
  }

  resetConfirmState()
  openModal(MODAL_ID)
  recipientInput?.focus()
}

/**
 * Close gift wizard
 */
export function close() {
  currentAsset = null
  resetConfirmState()
  closeModal(MODAL_ID)
}

/**
 * Submit gift transfer (two-step confirmation)
 */
export async function submit() {
  if (!currentAsset) {
    showToast('error', 'Error', 'No asset selected')
    return
  }

  const recipientInput = document.getElementById('giftRecipient')
  const recipient = recipientInput?.value?.trim()

  if (!recipient) {
    showToast('warning', 'Missing Recipient', 'Please enter a recipient address')
    return
  }

  if (!isValidAddress(recipient)) {
    showToast('error', 'Invalid Address', 'Please enter a valid Ethereum address')
    return
  }

  // Validate amount for ERC-1155 multi-copy assets
  const supply = currentAsset.supply || 1
  const amountInput = document.getElementById('giftAmount')
  const amount = supply > 1 ? parseInt(amountInput?.value) || 1 : 1

  if (amount < 1 || amount > supply) {
    showToast('warning', 'Invalid Amount', `Amount must be between 1 and ${supply}`)
    return
  }

  const btn = document.getElementById('giftSubmitBtn')

  // First click: switch to confirm mode
  if (!confirmMode) {
    confirmMode = true
    if (btn) {
      btn.textContent = 'Confirm'
      btn.classList.remove('mp-btn-cta-gift')
      btn.classList.add('mp-btn-warning')
    }
    return
  }

  // Second click: execute transfer (blockchain is source of truth)
  resetConfirmState()
  closeModal(MODAL_ID)

  try {
    await blockchain.transfer(currentAsset.id, recipient, amount)
  } catch (error) {
    // Error toast shown by blockchain.js via executeTx()
  }
}

export function init() {
  window.giftWizard = { open, close, submit, generateHTML }
}

init()

export default { open, close, submit, generateHTML, init }
