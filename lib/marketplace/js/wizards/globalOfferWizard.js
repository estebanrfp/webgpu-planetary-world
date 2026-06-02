/**
 * Global Offer Wizard
 * Make an offer on any asset by ID
 * @module marketplace/wizards/globalOfferWizard
 */

import { openModal, closeModal } from '../handlers/modals.js'
import { closeDetailPanel } from '../handlers/navigation.js'
import { blockchain } from '../services/blockchain.js'
import { showToast } from '../services/toast.js'
import { NO_IMAGE } from '../core/constants.js'

const MODAL_ID = 'globalOfferModal'
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
        <h2 class="mp-modal-title">&#129309; Make Global Offer</h2>
        <button class="mp-modal-close" onclick="closeModal('${MODAL_ID}')">&times;</button>
      </div>
      <div class="mp-modal-body">
        <div class="mp-form-group">
          <label class="mp-form-label">Search Asset by ID</label>
          <div class="mp-input-group">
            <input type="number" class="mp-input" id="globalOfferAssetId" placeholder="Enter Asset ID..." value="142">
            <button class="mp-btn mp-btn-primary mp-btn-attached-right" id="globalOfferSearchBtn">Search</button>
          </div>
        </div>

        <div class="mp-asset-preview" id="globalOfferAssetPreview">
          <div class="mp-asset-preview-image"><img loading="lazy" decoding="async" src="${NO_IMAGE}" alt="Asset" id="globalOfferAssetImage"></div>
          <div class="mp-asset-preview-info">
            <div class="mp-asset-preview-collection" id="globalOfferAssetCollection">Mythic Weapons</div>
            <div class="mp-asset-preview-name" id="globalOfferAssetName">Excalibur Blade</div>
            <div class="mp-text-sm mp-text-muted mp-mt-4" id="globalOfferOwner">Owner: 0x3f1a...7e9c</div>
          </div>
        </div>

        <div class="mp-alert-box-warning mp-mb-16">
          &#9888; This asset is not currently listed. Your offer will be sent directly to the owner.
        </div>

        <div class="mp-form-group">
          <label class="mp-form-label">Your Offer</label>
          <div class="mp-input-group">
            <input type="number" class="mp-input" id="globalOfferAmount" placeholder="0.00" value="4.5">
            <span class="mp-input-addon">OVG</span>
          </div>
        </div>

        <div class="mp-form-group">
          <label class="mp-form-label">Offer Duration</label>
          <select class="mp-select mp-w-full" id="globalOfferDuration">
            <option value="1">1 day</option>
            <option value="3" selected>3 days</option>
            <option value="7">7 days</option>
            <option value="30">30 days</option>
          </select>
          <div class="mp-form-hint">Your funds will be held in escrow until the offer expires or is accepted.</div>
        </div>
      </div>
      <div class="mp-modal-footer">
        <button class="mp-btn mp-btn-ghost mp-btn-flex" onclick="closeModal('${MODAL_ID}')">Cancel</button>
        <button class="mp-btn mp-btn-primary mp-btn-flex" id="globalOfferSubmitBtn">Send Offer</button>
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
  document.getElementById('globalOfferSubmitBtn')?.addEventListener('click', submit)
  document.getElementById('globalOfferSearchBtn')?.addEventListener('click', searchAsset)
}

/**
 * Search for asset by ID (mock)
 */
async function searchAsset() {
  const assetId = document.getElementById('globalOfferAssetId')?.value
  if (!assetId) {
    showToast('warning', 'Enter ID', 'Please enter an asset ID')
    return
  }

  // Mock search - in production would call API
  currentAsset = {
    id: assetId,
    name: `Asset #${assetId}`,
    collection: 'OVGrid Collection',
    image: NO_IMAGE,
    owner: '0x3f1a...7e9c'
  }

  document.getElementById('globalOfferAssetImage').src = currentAsset.image
  document.getElementById('globalOfferAssetName').textContent = currentAsset.name
  document.getElementById('globalOfferAssetCollection').textContent = currentAsset.collection
  document.getElementById('globalOfferOwner').textContent = `Owner: ${currentAsset.owner}`

  showToast('success', 'Asset Found', `Found ${currentAsset.name}`)
}

/**
 * Open global offer wizard
 * @param {object} asset - Optional asset data
 */
export function open(asset = null) {
  ensureModal()
  currentAsset = asset
  closeDetailPanel()

  if (asset) {
    document.getElementById('globalOfferAssetId').value = asset.id || ''
    document.getElementById('globalOfferAssetImage').src = asset.image || NO_IMAGE
    document.getElementById('globalOfferAssetName').textContent = asset.title || asset.name || 'Unnamed Asset'
    document.getElementById('globalOfferAssetCollection').textContent = asset.collection || 'Unknown'
  }

  openModal(MODAL_ID)
  document.getElementById('globalOfferAmount')?.focus()
}

/**
 * Close global offer wizard
 */
export function close() {
  currentAsset = null
  closeModal(MODAL_ID)
}

/**
 * Submit global offer
 */
export async function submit() {
  if (!currentAsset) {
    showToast('warning', 'Search First', 'Please search for an asset first')
    return
  }

  const amount = parseFloat(document.getElementById('globalOfferAmount')?.value)
  if (!amount || amount <= 0) {
    showToast('warning', 'Invalid Amount', 'Please enter a valid offer amount')
    return
  }

  closeModal(MODAL_ID)

  try {
    await blockchain.placeOffer(currentAsset.id, amount)
  } catch (error) {
    // Error toast shown by blockchain.js
  }
}

export function init() {
  window.globalOfferWizard = { open, close, submit, generateHTML }
}

init()

export default { open, close, submit, generateHTML, init }
