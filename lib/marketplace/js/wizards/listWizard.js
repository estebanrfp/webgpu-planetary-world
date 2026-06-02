/**
 * List Wizard
 * Action selector for inventory items (Sell, Auction, Rent Out, Gift)
 * @module marketplace/wizards/listWizard
 */

import { openModal, closeModal } from '../handlers/modals.js'
import { showToast } from '../services/toast.js'
import { NO_IMAGE } from '../core/constants.js'

const MODAL_ID = 'listModal'
let currentAsset = null
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
        <h2 class="mp-modal-title" id="listModalTitle">Choose Action</h2>
        <button class="mp-modal-close" onclick="closeModal('${MODAL_ID}')">&times;</button>
      </div>
      <div class="mp-modal-body">
        <div class="mp-asset-preview">
          <div class="mp-asset-preview-image"><img id="listAssetImage" src="${NO_IMAGE}" alt="Asset"></div>
          <div class="mp-asset-preview-info">
            <div class="mp-asset-preview-collection" id="listAssetCollection">Collection</div>
            <div class="mp-asset-preview-name" id="listAssetName">Asset Name</div>
          </div>
        </div>

        <div class="mp-action-grid">
          <button class="mp-action-btn mp-action-sell" id="listActionSell">Sell</button>
          <button class="mp-action-btn mp-action-auction" id="listActionAuction">Auction</button>
          <button class="mp-action-btn mp-action-rent-out" id="listActionRentOut">Rent Out</button>
          <button class="mp-action-btn mp-action-gift" id="listActionGift">Gift</button>
        </div>
      </div>
      <div class="mp-modal-footer mp-modal-footer-center">
        <button class="mp-btn mp-btn-ghost" onclick="closeModal('${MODAL_ID}')">Cancel</button>
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
  document.getElementById('listActionSell')?.addEventListener('click', () => openAction('sell'))
  document.getElementById('listActionAuction')?.addEventListener('click', () => openAction('auction'))
  document.getElementById('listActionRentOut')?.addEventListener('click', () => openAction('rentOut'))
  document.getElementById('listActionGift')?.addEventListener('click', () => openAction('gift'))
}

/**
 * Open a specific action wizard
 * @param {string} action - Action name
 */
async function openAction(action) {
  if (!currentAsset) return
  closeModal(MODAL_ID)

  const wizardMap = {
    sell: 'sellWizard',
    auction: 'auctionWizard',
    rentOut: 'rentOutWizard',
    gift: 'giftWizard'
  }

  const wizardName = wizardMap[action]
  if (wizardName) {
    const wizard = await import(`./${wizardName}.js`)
    wizard.open(currentAsset)
  }
}

/**
 * Open list wizard for an asset
 * @param {object} asset - Asset data {id, title, collection, image}
 */
export function open(asset) {
  ensureModal()

  if (!asset) {
    showToast('warning', 'No Asset', 'No asset selected')
    return
  }

  currentAsset = asset
  const { id, title, collection, image } = asset

  const imageEl = document.getElementById('listAssetImage')
  const collectionEl = document.getElementById('listAssetCollection')
  const nameEl = document.getElementById('listAssetName')

  if (imageEl) imageEl.src = image || NO_IMAGE
  if (collectionEl) collectionEl.textContent = collection || 'Unknown'
  if (nameEl) nameEl.textContent = title || `Asset #${id}`

  openModal(MODAL_ID)
}

/**
 * Close list wizard
 */
export function close() {
  currentAsset = null
  closeModal(MODAL_ID)
}

export function init() {
  window.listWizard = { open, close, generateHTML }
  window.openListModal = open
}

init()

export default { open, close, generateHTML, init }
