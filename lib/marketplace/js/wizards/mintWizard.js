/**
 * Mint Wizard
 * Create a new NFT asset with image/asset upload to Pinata IPFS
 * @module marketplace/wizards/mintWizard
 */

import { openModal, closeModal } from '../handlers/modals.js'
import { blockchain } from '../services/blockchain.js'
import { showToast } from '../services/toast.js'

const MODAL_ID = 'mintModal'
let initialized = false
let confirmMode = false
let selectedImageFile = null
let selectedAssetFile = null

/**
 * Generate modal HTML template
 * @returns {string} HTML string
 */
export function generateHTML() {
  return `
  <div class="mp-modal-overlay" id="${MODAL_ID}" role="dialog" aria-modal="true">
    <div class="mp-modal">
      <div class="mp-modal-header">
        <h2 class="mp-modal-title">Mint New Asset</h2>
        <div class="mp-modal-header-right">
          <button class="mp-modal-close" onclick="window.mintWizard?.close?.()">&times;</button>
        </div>
      </div>
      <div class="mp-modal-body">
        <!-- Image Upload/URL Section -->
        <div class="mp-form-group">
          <label class="mp-form-label">Image</label>
          <div class="mp-upload-tabs">
            <button type="button" class="mp-upload-tab active" data-tab="imageUpload" onclick="window.mintWizard?.switchImageTab?.('upload')">Upload File</button>
            <button type="button" class="mp-upload-tab" data-tab="imageUrl" onclick="window.mintWizard?.switchImageTab?.('url')">Use URL</button>
          </div>
          <div class="mp-upload-panel" id="mintImageUploadPanel">
            <div class="mp-file-drop" id="mintImageDropZone">
              <input type="file" id="mintImageFileInput" accept="image/*" hidden>
              <div class="mp-file-drop-content">
                <span class="mp-file-drop-icon">🖼️</span>
                <span class="mp-file-drop-text">Drop image or click to browse</span>
                <span class="mp-file-drop-hint">PNG, JPG, GIF, WEBP (max 10MB)</span>
              </div>
            </div>
          </div>
          <div class="mp-upload-panel" id="mintImageUrlPanel" style="display: none;">
            <input type="url" class="mp-input" id="mintImageUrlInput" placeholder="https://example.com/image.png">
            <div class="mp-form-hint">External image URL (IPFS, CDN, etc.)</div>
          </div>
          <div class="mp-image-preview-container" id="mintImagePreviewContainer" style="display: none;">
            <img id="mintPreviewImage" class="mp-image-preview" alt="Preview">
            <button type="button" class="mp-preview-remove" onclick="window.mintWizard?.clearImage?.()">&times;</button>
          </div>
        </div>

        <!-- Asset Upload/URL Section (Optional) -->
        <div class="mp-form-group">
          <label class="mp-form-label">3D Asset / Animation <span class="mp-text-muted">(optional)</span></label>
          <div class="mp-upload-tabs">
            <button type="button" class="mp-upload-tab active" data-tab="assetUpload" onclick="window.mintWizard?.switchAssetTab?.('upload')">Upload File</button>
            <button type="button" class="mp-upload-tab" data-tab="assetUrl" onclick="window.mintWizard?.switchAssetTab?.('url')">Use URL</button>
          </div>
          <div class="mp-upload-panel" id="mintAssetUploadPanel">
            <div class="mp-file-drop mp-file-drop-small" id="mintAssetDropZone">
              <input type="file" id="mintAssetFileInput" accept=".glb,.gltf,.fbx,.obj,.mp4,.webm" hidden>
              <div class="mp-file-drop-content">
                <span class="mp-file-drop-icon">📦</span>
                <span class="mp-file-drop-text">Drop asset or click to browse</span>
                <span class="mp-file-drop-hint">GLB, GLTF, FBX, OBJ, MP4, WEBM</span>
              </div>
            </div>
            <div class="mp-selected-file" id="mintAssetSelected" style="display: none;">
              <span id="mintAssetFileName"></span>
              <button type="button" class="mp-file-remove" onclick="window.mintWizard?.clearAsset?.()">&times;</button>
            </div>
          </div>
          <div class="mp-upload-panel" id="mintAssetUrlPanel" style="display: none;">
            <input type="url" class="mp-input" id="mintAssetUrlInput" placeholder="https://example.com/model.glb">
            <div class="mp-form-hint">3D model or animation URL</div>
          </div>
        </div>

        <div class="mp-form-group">
          <label class="mp-form-label">Collection</label>
          <input type="text" class="mp-input" id="mintCollectionInput" placeholder="Collection name" maxlength="32">
        </div>

        <div class="mp-form-group">
          <label class="mp-form-label">Category</label>
          <div class="mp-category-pills" id="mintCategoryPills">
            <button type="button" class="mp-category-pill" data-category="Land">Land</button>
            <button type="button" class="mp-category-pill" data-category="Wearables">Wearables</button>
            <button type="button" class="mp-category-pill active" data-category="Objects">Objects</button>
            <button type="button" class="mp-category-pill" data-category="Collections">Collections</button>
          </div>
        </div>

        <div class="mp-form-group">
          <label class="mp-form-label">Rarity</label>
          <div class="mp-rarity-pills" id="mintRarityPills">
            <button type="button" class="mp-rarity-pill" data-rarity="Common">Common</button>
            <button type="button" class="mp-rarity-pill active" data-rarity="Uncommon">Uncommon</button>
            <button type="button" class="mp-rarity-pill" data-rarity="Rare">Rare</button>
            <button type="button" class="mp-rarity-pill" data-rarity="Epic">Epic</button>
            <button type="button" class="mp-rarity-pill" data-rarity="Legendary">Legendary</button>
            <button type="button" class="mp-rarity-pill" data-rarity="Mythic">Mythic</button>
          </div>
        </div>

        <div class="mp-form-group">
          <label class="mp-form-label">Name</label>
          <input type="text" class="mp-input" id="mintNameInput" placeholder="Asset name" maxlength="64">
          <div class="mp-char-counter" id="mintNameCounter">0 / 64</div>
        </div>

        <div class="mp-form-group">
          <label class="mp-form-label">Description</label>
          <textarea class="mp-input mp-textarea" id="mintDescriptionInput" placeholder="Describe your asset..." maxlength="160" rows="2"></textarea>
          <div class="mp-char-counter" id="mintDescriptionCounter">0 / 160</div>
        </div>

        <div class="mp-form-row">
          <div class="mp-form-group mp-form-half">
            <label class="mp-form-label">Creator Royalty</label>
            <div class="mp-input-group">
              <input type="number" class="mp-input" id="mintRoyaltyInput" placeholder="0" min="0" max="25" value="5">
              <span class="mp-input-addon">%</span>
            </div>
            <div class="mp-form-hint">0-25% on secondary sales</div>
          </div>
          <div class="mp-form-group mp-form-half">
            <label class="mp-form-label">Supply</label>
            <div class="mp-input-group">
              <input type="number" class="mp-input" id="mintSupplyInput" placeholder="1" min="1" max="10000" value="1">
              <span class="mp-input-addon">units</span>
            </div>
            <div class="mp-form-hint">1 for unique NFT</div>
          </div>
        </div>
      </div>
      <div class="mp-modal-footer mp-modal-footer-duo">
        <button class="mp-btn mp-btn-ghost" onclick="window.mintWizard?.close?.()">Cancel</button>
        <button class="mp-btn mp-btn-primary" id="mintSubmitBtn">Mint Asset</button>
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
  document.getElementById('mintSubmitBtn')?.addEventListener('click', submit)
  document.getElementById('mintNameInput')?.addEventListener('input', () => {
    resetConfirmState()
    updateNameCounter()
  })
  document.getElementById('mintDescriptionInput')?.addEventListener('input', () => {
    resetConfirmState()
    updateDescriptionCounter()
  })
  document.getElementById('mintRoyaltyInput')?.addEventListener('input', resetConfirmState)
  document.getElementById('mintSupplyInput')?.addEventListener('input', resetConfirmState)
  document.getElementById('mintCollectionInput')?.addEventListener('input', resetConfirmState)

  // Category pills
  document.querySelectorAll('#mintCategoryPills .mp-category-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('#mintCategoryPills .mp-category-pill').forEach(p => p.classList.remove('active'))
      pill.classList.add('active')
      resetConfirmState()
    })
  })

  // Rarity pills
  document.querySelectorAll('#mintRarityPills .mp-rarity-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('#mintRarityPills .mp-rarity-pill').forEach(p => p.classList.remove('active'))
      pill.classList.add('active')
      resetConfirmState()
    })
  })

  // Image file upload
  const imageDropZone = document.getElementById('mintImageDropZone')
  const imageFileInput = document.getElementById('mintImageFileInput')

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

  // Asset file upload
  const assetDropZone = document.getElementById('mintAssetDropZone')
  const assetFileInput = document.getElementById('mintAssetFileInput')

  assetDropZone?.addEventListener('click', () => assetFileInput?.click())
  assetDropZone?.addEventListener('dragover', (e) => {
    e.preventDefault()
    assetDropZone.classList.add('mp-file-drop-active')
  })
  assetDropZone?.addEventListener('dragleave', () => {
    assetDropZone.classList.remove('mp-file-drop-active')
  })
  assetDropZone?.addEventListener('drop', (e) => {
    e.preventDefault()
    assetDropZone.classList.remove('mp-file-drop-active')
    const file = e.dataTransfer?.files?.[0]
    if (file) handleAssetFile(file)
  })
  assetFileInput?.addEventListener('change', (e) => {
    const file = e.target.files?.[0]
    if (file) handleAssetFile(file)
  })

  // Image URL preview
  document.getElementById('mintImageUrlInput')?.addEventListener('input', (e) => {
    resetConfirmState()
    updateImagePreviewFromUrl(e.target.value)
  })
  document.getElementById('mintAssetUrlInput')?.addEventListener('input', resetConfirmState)
}

/**
 * Handle image file selection
 */
function handleImageFile(file) {
  if (file.size > 10 * 1024 * 1024) {
    showToast('warning', 'File Too Large', 'Image must be under 10MB')
    return
  }

  selectedImageFile = file
  resetConfirmState()

  const reader = new FileReader()
  reader.onload = (e) => {
    const preview = document.getElementById('mintPreviewImage')
    const container = document.getElementById('mintImagePreviewContainer')
    if (preview && container) {
      preview.src = e.target.result
      container.style.display = 'block'
    }
  }
  reader.readAsDataURL(file)
}

/**
 * Handle asset file selection
 */
function handleAssetFile(file) {
  selectedAssetFile = file
  resetConfirmState()

  const dropZone = document.getElementById('mintAssetDropZone')
  const selected = document.getElementById('mintAssetSelected')
  const fileName = document.getElementById('mintAssetFileName')

  if (dropZone) dropZone.style.display = 'none'
  if (selected) selected.style.display = 'flex'
  if (fileName) fileName.textContent = file.name
}

/**
 * Clear selected image
 */
export function clearImage() {
  selectedImageFile = null
  const preview = document.getElementById('mintPreviewImage')
  const container = document.getElementById('mintImagePreviewContainer')
  const fileInput = document.getElementById('mintImageFileInput')

  if (preview) preview.src = ''
  if (container) container.style.display = 'none'
  if (fileInput) fileInput.value = ''
  resetConfirmState()
}

/**
 * Clear selected asset
 */
export function clearAsset() {
  selectedAssetFile = null
  const dropZone = document.getElementById('mintAssetDropZone')
  const selected = document.getElementById('mintAssetSelected')
  const fileInput = document.getElementById('mintAssetFileInput')

  if (dropZone) dropZone.style.display = 'block'
  if (selected) selected.style.display = 'none'
  if (fileInput) fileInput.value = ''
  resetConfirmState()
}

/**
 * Switch image input tab
 */
export function switchImageTab(tab) {
  const uploadPanel = document.getElementById('mintImageUploadPanel')
  const urlPanel = document.getElementById('mintImageUrlPanel')
  const tabs = document.querySelectorAll('[data-tab="imageUpload"], [data-tab="imageUrl"]')

  tabs.forEach(t => t.classList.remove('active'))

  if (tab === 'upload') {
    if (uploadPanel) uploadPanel.style.display = 'block'
    if (urlPanel) urlPanel.style.display = 'none'
    document.querySelector('[data-tab="imageUpload"]')?.classList.add('active')
  } else {
    if (uploadPanel) uploadPanel.style.display = 'none'
    if (urlPanel) urlPanel.style.display = 'block'
    document.querySelector('[data-tab="imageUrl"]')?.classList.add('active')
  }
}

/**
 * Switch asset input tab
 */
export function switchAssetTab(tab) {
  const uploadPanel = document.getElementById('mintAssetUploadPanel')
  const urlPanel = document.getElementById('mintAssetUrlPanel')
  const tabs = document.querySelectorAll('[data-tab="assetUpload"], [data-tab="assetUrl"]')

  tabs.forEach(t => t.classList.remove('active'))

  if (tab === 'upload') {
    if (uploadPanel) uploadPanel.style.display = 'block'
    if (urlPanel) urlPanel.style.display = 'none'
    document.querySelector('[data-tab="assetUpload"]')?.classList.add('active')
  } else {
    if (uploadPanel) uploadPanel.style.display = 'none'
    if (urlPanel) urlPanel.style.display = 'block'
    document.querySelector('[data-tab="assetUrl"]')?.classList.add('active')
  }
}

/**
 * Update image preview from URL
 */
function updateImagePreviewFromUrl(url) {
  const container = document.getElementById('mintImagePreviewContainer')
  const preview = document.getElementById('mintPreviewImage')
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
 * Update name character counter
 */
function updateNameCounter() {
  const input = document.getElementById('mintNameInput')
  const counter = document.getElementById('mintNameCounter')
  if (input && counter) counter.textContent = `${input.value.length} / 64`
}

/**
 * Update description character counter
 */
function updateDescriptionCounter() {
  const input = document.getElementById('mintDescriptionInput')
  const counter = document.getElementById('mintDescriptionCounter')
  if (input && counter) counter.textContent = `${input.value.length} / 160`
}

/**
 * Reset confirm button state
 */
function resetConfirmState() {
  confirmMode = false
  const btn = document.getElementById('mintSubmitBtn')
  if (btn) {
    btn.textContent = 'Mint Asset'
    btn.classList.remove('mp-btn-warning')
    btn.classList.add('mp-btn-primary')
  }
}

/**
 * Open mint wizard
 */
export function open() {
  ensureModal()

  // Reset form
  selectedImageFile = null
  selectedAssetFile = null

  clearImage()
  clearAsset()
  switchImageTab('upload')
  switchAssetTab('upload')

  document.getElementById('mintCollectionInput').value = ''
  // Reset category pills to Objects (default)
  document.querySelectorAll('#mintCategoryPills .mp-category-pill').forEach(p => p.classList.remove('active'))
  document.querySelector('#mintCategoryPills .mp-category-pill[data-category="Objects"]')?.classList.add('active')
  document.getElementById('mintNameInput').value = ''
  document.getElementById('mintDescriptionInput').value = ''
  document.getElementById('mintImageUrlInput').value = ''
  document.getElementById('mintAssetUrlInput').value = ''
  document.getElementById('mintRoyaltyInput').value = '5'
  document.getElementById('mintSupplyInput').value = '1'

  // Reset rarity pills to Uncommon (default)
  document.querySelectorAll('#mintRarityPills .mp-rarity-pill').forEach(p => p.classList.remove('active'))
  document.querySelector('#mintRarityPills .mp-rarity-pill[data-rarity="Uncommon"]')?.classList.add('active')

  resetConfirmState()
  updateNameCounter()
  updateDescriptionCounter()
  openModal(MODAL_ID)
}

/**
 * Close mint wizard
 */
export function close() {
  resetConfirmState()
  closeModal(MODAL_ID)
}

/**
 * Submit mint (two-step confirmation)
 */
export async function submit() {
  const name = document.getElementById('mintNameInput')?.value?.trim()
  const description = document.getElementById('mintDescriptionInput')?.value?.trim()
  const collection = document.getElementById('mintCollectionInput')?.value?.trim() || 'WebGPU Planetary World'
  const category = document.querySelector('#mintCategoryPills .mp-category-pill.active')?.dataset?.category || 'Objects'
  const rarity = document.querySelector('#mintRarityPills .mp-rarity-pill.active')?.dataset?.rarity || 'Common'
  const imageUrl = document.getElementById('mintImageUrlInput')?.value?.trim()
  const assetUrl = document.getElementById('mintAssetUrlInput')?.value?.trim() || ''
  const royalty = parseFloat(document.getElementById('mintRoyaltyInput')?.value)
  const supply = parseInt(document.getElementById('mintSupplyInput')?.value) || 1

  // Validate image (file or URL)
  if (!selectedImageFile && !imageUrl) {
    showToast('warning', 'Missing Image', 'Please upload an image or enter an image URL')
    return
  }

  if (!selectedImageFile && imageUrl && !imageUrl.startsWith('http://') && !imageUrl.startsWith('https://') && !imageUrl.startsWith('ipfs://')) {
    showToast('warning', 'Invalid URL', 'Image URL must start with http://, https://, or ipfs://')
    return
  }

  if (!name) {
    showToast('warning', 'Missing Name', 'Please enter a name for your asset')
    return
  }

  if (isNaN(royalty) || royalty < 0 || royalty > 25) {
    showToast('warning', 'Invalid Royalty', 'Royalty must be between 0% and 25%')
    return
  }

  if (supply < 1 || supply > 10000) {
    showToast('warning', 'Invalid Supply', 'Supply must be between 1 and 10,000')
    return
  }

  const btn = document.getElementById('mintSubmitBtn')

  // First click: switch to confirm mode
  if (!confirmMode) {
    confirmMode = true
    if (btn) {
      btn.textContent = 'Confirm Mint'
      btn.classList.remove('mp-btn-primary')
      btn.classList.add('mp-btn-warning')
    }
    return
  }

  // Second click: execute mint
  resetConfirmState()
  closeModal(MODAL_ID)

  try {
    const result = await blockchain.mint({
      name,
      description,
      collection,
      category,
      rarity,
      royalty,
      supply,
      imageUrl: selectedImageFile ? null : imageUrl,
      assetUrl: selectedAssetFile ? null : assetUrl,
      imageFile: selectedImageFile,
      assetFile: selectedAssetFile
    })

    // Success toast and view refresh handled by blockchain.js
  } catch (error) {
    // Error toast shown by blockchain.js
  }
}

export function init() {
  window.mintWizard = {
    open,
    close,
    submit,
    generateHTML,
    clearImage,
    clearAsset,
    switchImageTab,
    switchAssetTab
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
  clearAsset,
  switchImageTab,
  switchAssetTab
}
