/**
 * Collection Settings Wizard
 * Configure collection metadata (contractURI) for OpenSea
 * @module marketplace/wizards/collectionSettingsWizard
 */

import { openModal, closeModal } from '../handlers/modals.js'
import { blockchain } from '../services/blockchain.js'
import { showToast } from '../services/toast.js'

const MODAL_ID = 'collectionSettingsModal'
let initialized = false
let confirmMode = false
let selectedImageFile = null
let currentSettings = null // Store loaded settings for fallback

/**
 * Generate modal HTML template
 * @returns {string} HTML string
 */
export function generateHTML() {
  return `
  <div class="mp-modal-overlay" id="${MODAL_ID}" role="dialog" aria-modal="true">
    <div class="mp-modal">
      <div class="mp-modal-header">
        <h2 class="mp-modal-title">Collection Settings</h2>
        <div class="mp-modal-header-right">
          <button class="mp-modal-close" onclick="window.collectionSettingsWizard?.close?.()">&times;</button>
        </div>
      </div>
      <div class="mp-modal-body">
        <div class="mp-form-hint mp-mb-16">
          Configure how your collection appears on OpenSea and other marketplaces.
        </div>

        <!-- Collection Image -->
        <div class="mp-form-group">
          <label class="mp-form-label">Collection Image</label>
          <div class="mp-upload-tabs">
            <button type="button" class="mp-upload-tab active" data-tab="collImgUpload" onclick="window.collectionSettingsWizard?.switchImageTab?.('upload')">Upload File</button>
            <button type="button" class="mp-upload-tab" data-tab="collImgUrl" onclick="window.collectionSettingsWizard?.switchImageTab?.('url')">Use URL</button>
          </div>
          <div class="mp-upload-panel" id="collImageUploadPanel">
            <div class="mp-file-drop" id="collImageDropZone">
              <input type="file" id="collImageFileInput" accept="image/*" hidden>
              <div class="mp-file-drop-content">
                <span class="mp-file-drop-icon">🖼️</span>
                <span class="mp-file-drop-text">Drop image or click to browse</span>
                <span class="mp-file-drop-hint">Recommended: 350x350px, PNG or JPG</span>
              </div>
            </div>
          </div>
          <div class="mp-upload-panel" id="collImageUrlPanel" style="display: none;">
            <input type="url" class="mp-input" id="collImageUrlInput" placeholder="https://gateway.pinata.cloud/ipfs/...">
            <div class="mp-form-hint">IPFS or HTTP URL to collection image</div>
          </div>
          <div class="mp-image-preview-container" id="collImagePreviewContainer" style="display: none;">
            <img id="collPreviewImage" class="mp-image-preview mp-image-preview-square" alt="Preview">
            <button type="button" class="mp-preview-remove" onclick="window.collectionSettingsWizard?.clearImage?.()">&times;</button>
          </div>
        </div>

        <!-- Collection Name -->
        <div class="mp-form-group">
          <label class="mp-form-label">Collection Name</label>
          <input type="text" class="mp-input" id="collNameInput" placeholder="OVGrid Assets" maxlength="64">
          <div class="mp-char-counter" id="collNameCounter">0 / 64</div>
        </div>

        <!-- Collection Description -->
        <div class="mp-form-group">
          <label class="mp-form-label">Description</label>
          <textarea class="mp-input mp-textarea" id="collDescriptionInput" placeholder="Digital assets for OVGrid Metaverse..." maxlength="500" rows="3"></textarea>
          <div class="mp-char-counter" id="collDescriptionCounter">0 / 500</div>
        </div>

        <!-- External Link -->
        <div class="mp-form-group">
          <label class="mp-form-label">External Link</label>
          <input type="url" class="mp-input" id="collExternalLinkInput" placeholder="https://ovgrid.com">
          <div class="mp-form-hint">Your project website</div>
        </div>

        <!-- Royalty Settings -->
        <div class="mp-form-row">
          <div class="mp-form-group mp-form-half">
            <label class="mp-form-label">Seller Fee (Royalty)</label>
            <div class="mp-input-group">
              <input type="number" class="mp-input" id="collRoyaltyInput" placeholder="2.5" min="0" max="10" step="0.1" value="2.5">
              <span class="mp-input-addon">%</span>
            </div>
            <div class="mp-form-hint">0-10% on secondary sales</div>
          </div>
          <div class="mp-form-group mp-form-half">
            <label class="mp-form-label">Fee Recipient</label>
            <input type="text" class="mp-input mp-input-mono" id="collFeeRecipientInput" placeholder="0x..." maxlength="42">
            <div class="mp-form-hint">Wallet to receive royalties</div>
          </div>
        </div>

      </div>
      <div class="mp-modal-footer mp-modal-footer-duo">
        <button class="mp-btn mp-btn-ghost" onclick="window.collectionSettingsWizard?.close?.()">Cancel</button>
        <button class="mp-btn mp-btn-primary" id="collSettingsSubmitBtn">Save Settings</button>
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
  document.getElementById('collSettingsSubmitBtn')?.addEventListener('click', submit)

  // Character counters
  document.getElementById('collNameInput')?.addEventListener('input', () => {
    resetConfirmState()
    updateCounter('collNameInput', 'collNameCounter', 64)
  })
  document.getElementById('collDescriptionInput')?.addEventListener('input', () => {
    resetConfirmState()
    updateCounter('collDescriptionInput', 'collDescriptionCounter', 500)
  })

  // Other inputs
  document.getElementById('collImageUrlInput')?.addEventListener('input', (e) => {
    resetConfirmState()
    updateImagePreviewFromUrl(e.target.value)
  })
  document.getElementById('collExternalLinkInput')?.addEventListener('input', resetConfirmState)
  document.getElementById('collRoyaltyInput')?.addEventListener('input', resetConfirmState)
  document.getElementById('collFeeRecipientInput')?.addEventListener('input', resetConfirmState)

  // Image file upload
  const imageDropZone = document.getElementById('collImageDropZone')
  const imageFileInput = document.getElementById('collImageFileInput')

  imageDropZone?.addEventListener('click', () => imageFileInput?.click())
  imageDropZone?.addEventListener('dragover', (e) => {
    e.preventDefault()
    imageDropZone.classList.add('mp-file-drop-active')
  })
  imageDropZone?.addEventListener('dragleave', () => {
    imageDropZone.classList.remove('mp-file-drop-active')
  })
  imageDropZone?.addEventListener('drop', (e) => {
    e.preventDefault()
    imageDropZone.classList.remove('mp-file-drop-active')
    const file = e.dataTransfer?.files?.[0]
    if (file?.type?.startsWith('image/')) handleImageFile(file)
  })
  imageFileInput?.addEventListener('change', (e) => {
    const file = e.target.files?.[0]
    if (file) handleImageFile(file)
  })
}

/**
 * Update character counter
 */
function updateCounter(inputId, counterId, max) {
  const input = document.getElementById(inputId)
  const counter = document.getElementById(counterId)
  if (input && counter) counter.textContent = `${input.value.length} / ${max}`
}

/**
 * Handle image file selection
 */
function handleImageFile(file) {
  if (file.size > 5 * 1024 * 1024) {
    showToast('warning', 'File Too Large', 'Image must be under 5MB')
    return
  }

  selectedImageFile = file
  resetConfirmState()

  const reader = new FileReader()
  reader.onload = (e) => {
    const preview = document.getElementById('collPreviewImage')
    const container = document.getElementById('collImagePreviewContainer')
    if (preview && container) {
      preview.src = e.target.result
      container.style.display = 'block'
    }
  }
  reader.readAsDataURL(file)
}

/**
 * Clear selected image
 */
export function clearImage() {
  selectedImageFile = null
  const preview = document.getElementById('collPreviewImage')
  const container = document.getElementById('collImagePreviewContainer')
  const fileInput = document.getElementById('collImageFileInput')
  const urlInput = document.getElementById('collImageUrlInput')

  if (preview) preview.src = ''
  if (container) container.style.display = 'none'
  if (fileInput) fileInput.value = ''
  if (urlInput) urlInput.value = ''
  resetConfirmState()
}

/**
 * Switch image input tab
 */
export function switchImageTab(tab) {
  const uploadPanel = document.getElementById('collImageUploadPanel')
  const urlPanel = document.getElementById('collImageUrlPanel')
  const tabs = document.querySelectorAll('[data-tab="collImgUpload"], [data-tab="collImgUrl"]')

  tabs.forEach(t => t.classList.remove('active'))

  if (tab === 'upload') {
    if (uploadPanel) uploadPanel.style.display = 'block'
    if (urlPanel) urlPanel.style.display = 'none'
    document.querySelector('[data-tab="collImgUpload"]')?.classList.add('active')
  } else {
    if (uploadPanel) uploadPanel.style.display = 'none'
    if (urlPanel) urlPanel.style.display = 'block'
    document.querySelector('[data-tab="collImgUrl"]')?.classList.add('active')
  }
}

/**
 * Update image preview from URL
 */
function updateImagePreviewFromUrl(url) {
  const container = document.getElementById('collImagePreviewContainer')
  const preview = document.getElementById('collPreviewImage')
  if (!container || !preview) return

  if (url && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('ipfs://'))) {
    const displayUrl = url.startsWith('ipfs://')
      ? `https://gateway.pinata.cloud/ipfs/${url.replace('ipfs://', '')}`
      : url
    preview.src = displayUrl
    preview.onload = () => { container.style.display = 'block' }
    preview.onerror = () => { container.style.display = 'none' }
  } else {
    container.style.display = 'none'
    preview.src = ''
  }
}

/**
 * Reset confirm button state
 */
function resetConfirmState() {
  confirmMode = false
  const btn = document.getElementById('collSettingsSubmitBtn')
  if (btn) {
    btn.textContent = 'Save Settings'
    btn.classList.remove('mp-btn-warning')
    btn.classList.add('mp-btn-primary')
  }
}

/**
 * Load current collection settings
 */
async function loadCurrentSettings() {
  try {
    const settings = await blockchain.getContractURI()
    currentSettings = settings // Store for fallback in submit

    if (settings) {
      // Populate form with current values
      document.getElementById('collNameInput').value = settings.name || ''
      document.getElementById('collDescriptionInput').value = settings.description || ''
      document.getElementById('collExternalLinkInput').value = settings.external_link || ''

      if (settings.seller_fee_basis_points) {
        document.getElementById('collRoyaltyInput').value = (settings.seller_fee_basis_points / 100).toFixed(1)
      }
      if (settings.fee_recipient) {
        document.getElementById('collFeeRecipientInput').value = settings.fee_recipient
      }

      // Show image preview if exists
      if (settings.image) {
        document.getElementById('collImageUrlInput').value = settings.image
        updateImagePreviewFromUrl(settings.image)
        switchImageTab('url')
      }

      // Update counters
      updateCounter('collNameInput', 'collNameCounter', 64)
      updateCounter('collDescriptionInput', 'collDescriptionCounter', 500)
    } else {
      currentSettings = null
    }
  } catch (error) {
    currentSettings = null
  }
}

/**
 * Open collection settings wizard
 */
export function open() {
  ensureModal()

  // Reset form and state
  selectedImageFile = null
  currentSettings = null
  clearImage()
  switchImageTab('upload')

  document.getElementById('collNameInput').value = ''
  document.getElementById('collDescriptionInput').value = ''
  document.getElementById('collExternalLinkInput').value = ''
  document.getElementById('collRoyaltyInput').value = '2.5'
  document.getElementById('collFeeRecipientInput').value = ''

  resetConfirmState()
  updateCounter('collNameInput', 'collNameCounter', 64)
  updateCounter('collDescriptionInput', 'collDescriptionCounter', 500)

  openModal(MODAL_ID)

  // Load current settings (populates form and sets currentSettings for fallback)
  loadCurrentSettings()
}

/**
 * Close wizard
 */
export function close() {
  resetConfirmState()
  closeModal(MODAL_ID)
}

/**
 * Submit settings (two-step confirmation)
 */
export async function submit() {
  // Get form values, fallback to current settings if empty
  const nameInput = document.getElementById('collNameInput')?.value?.trim()
  const descriptionInput = document.getElementById('collDescriptionInput')?.value?.trim()
  const imageUrlInput = document.getElementById('collImageUrlInput')?.value?.trim()
  const externalLinkInput = document.getElementById('collExternalLinkInput')?.value?.trim()
  const royaltyInput = document.getElementById('collRoyaltyInput')?.value
  const feeRecipientInput = document.getElementById('collFeeRecipientInput')?.value?.trim()

  // Use current settings as fallback for unchanged fields
  const name = nameInput || currentSettings?.name
  const description = descriptionInput ?? currentSettings?.description ?? ''
  const imageUrl = imageUrlInput || currentSettings?.image
  const externalLink = externalLinkInput || currentSettings?.external_link || ''
  const royalty = royaltyInput ? parseFloat(royaltyInput) : (currentSettings?.seller_fee_basis_points ? currentSettings.seller_fee_basis_points / 100 : 2.5)
  const feeRecipient = feeRecipientInput || currentSettings?.fee_recipient || ''

  // Validation - only require name if no existing one
  if (!name) {
    showToast('warning', 'Missing Name', 'Please enter a collection name')
    return
  }

  // Image required only if no existing one
  if (!selectedImageFile && !imageUrl) {
    showToast('warning', 'Missing Image', 'Please upload an image or enter an image URL')
    return
  }

  if (royalty < 0 || royalty > 10) {
    showToast('warning', 'Invalid Royalty', 'Royalty must be between 0% and 10%')
    return
  }

  const btn = document.getElementById('collSettingsSubmitBtn')

  // First click: switch to confirm mode
  if (!confirmMode) {
    confirmMode = true
    if (btn) {
      btn.textContent = 'Confirm'
      btn.classList.remove('mp-btn-primary')
      btn.classList.add('mp-btn-warning')
    }
    return
  }

  // Second click: execute
  resetConfirmState()
  closeModal(MODAL_ID)

  try {
    await blockchain.updateContractURI({
      name,
      description,
      externalLink,
      royalty,
      feeRecipient,
      imageUrl: selectedImageFile ? null : imageUrl,
      imageFile: selectedImageFile
    })
  } catch (error) {
    // Error toast shown by blockchain.js
  }
}

export function init() {
  window.collectionSettingsWizard = {
    open,
    close,
    submit,
    generateHTML,
    clearImage,
    switchImageTab
  }
}

init()

export default {
  open,
  close,
  submit,
  generateHTML,
  init,
  clearImage,
  switchImageTab
}
