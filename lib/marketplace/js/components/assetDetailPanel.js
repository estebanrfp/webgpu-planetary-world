/**
 * Asset Detail Panel Component
 * Displays asset information for Inventory view (owner perspective)
 * @module marketplace/components/assetDetailPanel
 */

import { showToast } from '../services/toast.js'
import { autoLink } from '../services/textUtils.js'

const PANEL_ID = 'assetDetailPanel'
let currentAsset = null
let initialized = false

/**
 * Generate panel HTML template
 * @returns {string} HTML string
 */
export function generateHTML() {
  return `
  <div class="mp-detail-panel" id="${PANEL_ID}" onclick="if(event.target === this) window.assetDetailPanel?.close?.()">
    <div class="mp-detail-modal">
      <div class="mp-detail-header">
        <h2 class="mp-modal-title">Asset Details</h2>
        <button class="mp-modal-close" onclick="window.assetDetailPanel?.close?.()">&times;</button>
      </div>
      <div class="mp-detail-scroll">
        <div class="mp-detail-image">
          <img loading="lazy" decoding="async" id="assetImage" src="" alt="Asset">
          <span class="mp-rarity-badge" id="assetRarityBadge">Rare</span>
        </div>
        <div class="mp-detail-content">
          <a class="mp-blockchain-link mp-hidden" id="assetBlockchainLink" href="#" target="_blank" rel="noopener noreferrer">
            <span class="mp-blockchain-icon">&#9830;</span>
            <span>View on Polygonscan</span>
          </a>
          <a class="mp-blockchain-link mp-hidden" id="assetOpenSeaLink" href="#" target="_blank" rel="noopener noreferrer">
            <span class="mp-blockchain-icon">&#9778;</span>
            <span>View on OpenSea</span>
          </a>

          <div class="mp-status-row" id="assetStatusRow">
            <div class="mp-status-box" id="assetStatusListing">
              <span class="mp-status-box-label">Status</span>
              <span class="mp-status-box-value" id="assetListingStatus">Unlisted</span>
            </div>
            <div class="mp-status-box mp-status-price mp-hidden" id="assetStatusPrice">
              <span class="mp-status-box-label">Price</span>
              <span class="mp-status-box-value" id="assetPrice">0.5 OVG</span>
            </div>
            <div class="mp-status-box mp-status-royalty-info" id="assetRoyaltyBox">
              <span class="mp-status-box-label">Royalty</span>
              <span class="mp-status-box-value" id="assetRoyalty">5%</span>
            </div>
          </div>

          <!-- Editable Metadata Section -->
          <div class="mp-detail-section">
            <div class="mp-detail-section-title">Metadata</div>

            <div class="mp-form-group">
              <label class="mp-form-label">Title</label>
              <input type="text" class="mp-input" id="assetNameInput" placeholder="Asset name" maxlength="64">
              <div class="mp-char-counter" id="assetNameCounter">0 / 64</div>
            </div>

            <div class="mp-form-group">
              <label class="mp-form-label">Description</label>
              <textarea class="mp-input mp-textarea" id="assetDescriptionInput" placeholder="Describe your asset..." maxlength="500" rows="3"></textarea>
              <div class="mp-char-counter" id="assetDescriptionCounter">0 / 500</div>
            </div>
          </div>

          <!-- Editable Attributes Section -->
          <div class="mp-detail-section">
            <div class="mp-detail-section-title">Attributes</div>

            <div class="mp-form-group">
              <label class="mp-form-label">Collection</label>
              <input type="text" class="mp-input" id="assetCollectionInput" placeholder="Collection name" maxlength="32">
            </div>

            <div class="mp-form-group">
              <label class="mp-form-label">Category</label>
              <div class="mp-category-pills" id="assetCategoryPills">
                <button type="button" class="mp-category-pill" data-category="Land">Land</button>
                <button type="button" class="mp-category-pill" data-category="Wearables">Wearables</button>
                <button type="button" class="mp-category-pill active" data-category="Objects">Objects</button>
                <button type="button" class="mp-category-pill" data-category="Collections">Collections</button>
              </div>
            </div>

            <div class="mp-form-group">
              <label class="mp-form-label">Rarity</label>
              <div class="mp-rarity-pills" id="assetRarityPills">
                <button type="button" class="mp-rarity-pill" data-rarity="Common">Common</button>
                <button type="button" class="mp-rarity-pill" data-rarity="Uncommon">Uncommon</button>
                <button type="button" class="mp-rarity-pill" data-rarity="Rare">Rare</button>
                <button type="button" class="mp-rarity-pill" data-rarity="Epic">Epic</button>
                <button type="button" class="mp-rarity-pill" data-rarity="Legendary">Legendary</button>
                <button type="button" class="mp-rarity-pill" data-rarity="Mythic">Mythic</button>
              </div>
            </div>
          </div>

          <!-- Bundle Items Section (only for bundles) -->
          <div class="mp-detail-section mp-hidden" id="assetBundleItemsSection">
            <div class="mp-detail-section-title">Bundle Items (<span id="assetBundleItemsCount">0</span>)</div>
            <div class="mp-bundle-items-grid" id="assetBundleItems">
              <!-- Bundle items populated dynamically -->
            </div>
          </div>

          <!-- History Section -->
          <div class="mp-detail-section">
            <div class="mp-detail-section-title">History</div>
            <div class="mp-mb-16">
              <div class="mp-chart-label">Price History (30 days)</div>
              <div class="mp-sales-chart" id="assetPriceChart">
                <!-- Chart bars populated dynamically -->
              </div>
            </div>
            <div id="assetHistory">
              <!-- History items populated dynamically -->
            </div>
          </div>
        </div>
      </div>
      <!-- Footer with owner actions -->
      <div class="mp-modal-footer mp-asset-footer">
        <button class="mp-btn mp-btn-ghost mp-btn-flex" onclick="window.assetDetailPanel?.close?.()">Cancel</button>
        <button class="mp-btn mp-btn-danger mp-btn-flex" id="assetBurnBtn">Burn</button>
        <button class="mp-btn mp-btn-success mp-btn-flex" id="assetUpdateBtn">Update</button>
        <button class="mp-btn mp-btn-primary mp-btn-flex" id="assetListBtn">List</button>
      </div>
    </div>
  </div>`
}

/**
 * Ensure panel exists in DOM
 */
function ensurePanel() {
  if (!initialized && !document.getElementById(PANEL_ID)) {
    const container = document.getElementById('panels-container') || document.body
    container.insertAdjacentHTML('beforeend', generateHTML())
    bindPanelEvents()
    initialized = true
  }
}

/**
 * Bind panel event listeners
 */
function bindPanelEvents() {
  document.getElementById(PANEL_ID)?.addEventListener('click', (e) => {
    if (e.target.id === PANEL_ID) close()
  })

  // Name input - update counter on input
  document.getElementById('assetNameInput')?.addEventListener('input', updateNameCounter)

  // Description input - update counter on input
  document.getElementById('assetDescriptionInput')?.addEventListener('input', updateDescriptionCounter)

  // Category pills click handler
  document.getElementById('assetCategoryPills')?.addEventListener('click', (e) => {
    const pill = e.target.closest('.mp-category-pill')
    if (!pill) return
    document.querySelectorAll('#assetCategoryPills .mp-category-pill').forEach(p => p.classList.remove('active'))
    pill.classList.add('active')
  })

  // Rarity pills click handler
  document.getElementById('assetRarityPills')?.addEventListener('click', (e) => {
    const pill = e.target.closest('.mp-rarity-pill')
    if (!pill) return
    document.querySelectorAll('#assetRarityPills .mp-rarity-pill').forEach(p => p.classList.remove('active'))
    pill.classList.add('active')
    // Update badge preview
    const rarity = pill.dataset.rarity
    const badge = document.getElementById('assetRarityBadge')
    if (badge) {
      badge.textContent = rarity
      badge.className = `mp-rarity-badge mp-rarity-${rarity.toLowerCase()}`
    }
  })

  // Burn button
  document.getElementById('assetBurnBtn')?.addEventListener('click', burnAsset)

  // Update button
  document.getElementById('assetUpdateBtn')?.addEventListener('click', updateAssetOnChain)
}

/**
 * Update name character counter
 */
function updateNameCounter() {
  const input = document.getElementById('assetNameInput')
  const counter = document.getElementById('assetNameCounter')
  if (input && counter) counter.textContent = `${input.value.length} / 64`
}

/**
 * Update description character counter
 */
function updateDescriptionCounter() {
  const input = document.getElementById('assetDescriptionInput')
  const counter = document.getElementById('assetDescriptionCounter')
  if (input && counter) counter.textContent = `${input.value.length} / 500`
}

/**
 * Open asset detail panel
 * @param {object} asset - Asset data
 */
export function open(asset) {
  ensurePanel()

  if (!asset) {
    showToast('warning', 'No Asset', 'No asset data provided')
    return
  }

  currentAsset = asset
  window.currentDetailItem = asset

  // Helper to detect hash strings (should not be shown as title)
  const isHash = (str) => str && (str.length > 30 || /^[a-f0-9-]{20,}$/i.test(str))

  // Update image
  const imageEl = document.getElementById('assetImage')
  if (imageEl) imageEl.src = asset.image || ''

  // Update basic info - avoid showing hash as title or collection
  const displayTitle = asset.title && !isHash(asset.title)
    ? asset.title
    : asset.name && !isHash(asset.name)
      ? asset.name
      : ''
  const displayCollection = asset.collection && asset.collection !== 'Unknown' && !isHash(asset.collection)
    ? asset.collection
    : ''
  const displayCategory = asset.category || 'Objects'
  const displayRarity = asset.rarity || 'Common'

  // Set name input value and update counter
  const nameInput = document.getElementById('assetNameInput')
  if (nameInput) {
    nameInput.value = displayTitle
    updateNameCounter()
  }

  // Set description textarea and update counter
  const descInput = document.getElementById('assetDescriptionInput')
  if (descInput) {
    descInput.value = asset.description || ''
    updateDescriptionCounter()
  }

  // Set collection input
  const collectionInput = document.getElementById('assetCollectionInput')
  if (collectionInput) {
    collectionInput.value = displayCollection
  }

  // Set category pills
  document.querySelectorAll('#assetCategoryPills .mp-category-pill').forEach(pill => {
    pill.classList.remove('active')
    if (pill.dataset.category.toLowerCase() === displayCategory.toLowerCase()) {
      pill.classList.add('active')
    }
  })
  // Default to Objects if no match found
  if (!document.querySelector('#assetCategoryPills .mp-category-pill.active')) {
    document.querySelector('#assetCategoryPills .mp-category-pill[data-category="Objects"]')?.classList.add('active')
  }

  // Set rarity pills
  document.querySelectorAll('#assetRarityPills .mp-rarity-pill').forEach(pill => {
    pill.classList.remove('active')
    if (pill.dataset.rarity.toLowerCase() === displayRarity.toLowerCase()) {
      pill.classList.add('active')
    }
  })

  // Update blockchain links (Polygonscan & OpenSea)
  const blockchainLink = document.getElementById('assetBlockchainLink')
  const openSeaLink = document.getElementById('assetOpenSeaLink')
  const tokenId = asset.tokenId
  const contractAddress = '0x79f547F3E8a344D87064C15aA572a98E8d4A5c71' // OVGAssets on Polygon Mainnet

  if (tokenId && !isNaN(tokenId)) {
    if (blockchainLink) {
      blockchainLink.href = `https://polygonscan.com/nft/${contractAddress}/${tokenId}`
      blockchainLink.classList.remove('mp-hidden')
    }
    if (openSeaLink) {
      openSeaLink.href = `https://opensea.io/assets/matic/${contractAddress}/${tokenId}`
      openSeaLink.classList.remove('mp-hidden')
    }
  } else {
    blockchainLink?.classList.add('mp-hidden')
    openSeaLink?.classList.add('mp-hidden')
  }

  // Update rarity badge
  const rarityBadge = document.getElementById('assetRarityBadge')
  if (rarityBadge) {
    rarityBadge.textContent = displayRarity
    rarityBadge.className = `mp-rarity-badge mp-rarity-${displayRarity.toLowerCase()}`
  }

  // Update status
  updateStatusDisplay(asset)

  // Update bundle items (if bundle)
  updateBundleItems(asset)

  // Update history
  updateHistory(asset.history || [])

  // Update price chart
  updatePriceChart(asset.priceHistory || [])

  // Update CTA button
  updateCtaButton(asset)

  // Open panel
  document.getElementById(PANEL_ID)?.classList.add('open')
}

/**
 * Update status display based on asset state
 * @param {object} asset - Asset data
 */
function updateStatusDisplay(asset) {
  const status = asset.status || 'unlisted'
  const isListed = status !== 'unlisted'

  // Update listing status box
  const statusBox = document.getElementById('assetStatusListing')
  const statusEl = document.getElementById('assetListingStatus')

  if (statusBox && statusEl) {
    const statusText = {
      sale: 'For Sale',
      rent: 'For Rent',
      auction: 'In Auction',
      bundle: 'In Bundle',
      unlisted: 'Unlisted'
    }
    const statusClass = {
      sale: 'mp-status-sale',
      rent: 'mp-status-rent',
      auction: 'mp-status-auction',
      bundle: 'mp-status-bundle',
      unlisted: ''
    }
    statusEl.textContent = statusText[status] || 'Unlisted'
    statusBox.className = `mp-status-box ${statusClass[status] || ''}`
  }

  // Show/hide price
  const priceBox = document.getElementById('assetStatusPrice')
  if (priceBox) {
    priceBox.classList.toggle('mp-hidden', !isListed)
    if (isListed) {
      document.getElementById('assetPrice').textContent = asset.price || '0 OVG'
    }
  }

  // Update royalty
  document.getElementById('assetRoyalty').textContent = asset.royalty || '5%'
}

/**
 * Update bundle items display
 * @param {object} asset - Asset data
 */
function updateBundleItems(asset) {
  const section = document.getElementById('assetBundleItemsSection')
  const container = document.getElementById('assetBundleItems')
  const countEl = document.getElementById('assetBundleItemsCount')
  const status = asset.status || 'unlisted'
  const isBundle = status === 'bundle' || asset.isBundle

  if (!section || !container) return

  if (!isBundle || !asset.bundleItems?.length) {
    section.classList.add('mp-hidden')
    return
  }

  section.classList.remove('mp-hidden')
  countEl.textContent = asset.bundleItems.length

  container.innerHTML = asset.bundleItems.map(item => `
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

/**
 * Update CTA button based on asset state
 * @param {object} asset - Asset data
 */
function updateCtaButton(asset) {
  const status = asset.status || 'unlisted'
  const isListed = status !== 'unlisted'
  const listBtn = document.getElementById('assetListBtn')

  if (listBtn) {
    if (isListed) {
      listBtn.textContent = 'Edit'
      listBtn.onclick = () => { close(); window.openEditModal?.(status, asset) }
    } else {
      listBtn.textContent = 'List'
      listBtn.onclick = () => { close(); window.wizards?.list?.(asset) }
    }
  }
}

/**
 * Update history display
 * @param {Array} history - Array of history items
 */
function updateHistory(history) {
  const container = document.getElementById('assetHistory')
  if (!container) return

  if (!history || history.length === 0) {
    container.innerHTML = '<div class="mp-text-muted">No history available</div>'
    return
  }

  container.innerHTML = history.map(item => `
    <div class="mp-history-item">
      <div class="mp-history-icon">${item.icon}</div>
      <div class="mp-history-info">
        <div class="mp-history-action">${item.action}${item.actor ? ` <strong class="mp-text-accent">${item.actor}</strong>` : ''}</div>
        <div class="mp-history-time">${item.time}</div>
      </div>
      <div class="mp-history-price">${item.price}</div>
    </div>
  `).join('')
}

/**
 * Update price chart display
 * @param {Array} priceHistory - Array of price values
 */
function updatePriceChart(priceHistory) {
  const container = document.getElementById('assetPriceChart')
  if (!container) return

  if (!priceHistory || priceHistory.length === 0) {
    container.innerHTML = '<div class="mp-text-muted mp-text-center">No price data</div>'
    return
  }

  const max = Math.max(...priceHistory)
  container.innerHTML = priceHistory.map(price => {
    const height = Math.max((price / max) * 100, 5)
    return `<div class="mp-chart-bar" style="height: ${height}%;" title="${price.toFixed(2)} OVG"></div>`
  }).join('')
}

let burnConfirmMode = false
let updateConfirmMode = false

/**
 * Update asset metadata on blockchain (two-step confirmation)
 * Saves: title, description, collection, category, rarity
 */
async function updateAssetOnChain() {
  if (!currentAsset) return

  const btn = document.getElementById('assetUpdateBtn')
  const tokenId = currentAsset.tokenId

  if (!tokenId || isNaN(tokenId)) {
    showToast('error', 'Error', 'Invalid token ID')
    return
  }

  // First click: switch to confirm mode
  if (!updateConfirmMode) {
    updateConfirmMode = true
    if (btn) {
      btn.textContent = 'Confirm'
      btn.classList.remove('mp-btn-success')
      btn.classList.add('mp-btn-warning')
    }
    return
  }

  // Second click: execute update
  try {
    btn.textContent = 'Updating...'
    btn.disabled = true

    // Read all editable fields
    const newName = document.getElementById('assetNameInput')?.value.trim() || 'Untitled'
    const description = document.getElementById('assetDescriptionInput')?.value.trim() || ''
    const collection = document.getElementById('assetCollectionInput')?.value.trim() || 'OVGrid'
    const category = document.querySelector('#assetCategoryPills .mp-category-pill.active')?.dataset.category || 'Objects'
    const rarity = document.querySelector('#assetRarityPills .mp-rarity-pill.active')?.dataset.rarity || 'Common'
    const imageUrl = currentAsset.image || currentAsset.imageUrl || ''
    const assetUrl = currentAsset.assetUrl || ''

    const { blockchain } = await import('../services/blockchain.js')

    // Update metadata and attributes on blockchain
    await blockchain.updateAssetMetadata(tokenId, {
      name: newName,
      description,
      imageUrl,
      assetUrl,
      // Attributes for on-chain storage
      rarity,
      category,
      collection
    })

    // Update in GenosDB
    const nodeId = currentAsset.id || `asset_${tokenId}`
    const { result: existing } = await window.db.get(nodeId)
    await window.db.put({
      ...(existing?.value || existing || {}),
      title: newName,
      name: newName,
      description,
      collection,
      category: category.toLowerCase(),
      rarity: rarity.toLowerCase()
    }, nodeId)

    showToast('success', 'Updated', 'Asset metadata saved to blockchain')
    close()
    window.refreshCurrentView?.()

  } catch (e) {
    console.error('[AssetDetail] Update failed:', e)
    showToast('error', 'Update Failed', e.message)
  } finally {
    resetUpdateConfirmState()
  }
}

/**
 * Reset update confirmation state
 */
function resetUpdateConfirmState() {
  updateConfirmMode = false
  const btn = document.getElementById('assetUpdateBtn')
  if (btn) {
    btn.textContent = 'Update'
    btn.classList.remove('mp-btn-warning')
    btn.classList.add('mp-btn-success')
    btn.disabled = false
  }
}

/**
 * Burn the current asset (two-step confirmation)
 */
async function burnAsset() {
  if (!currentAsset) return

  const btn = document.getElementById('assetBurnBtn')
  const tokenId = currentAsset.tokenId

  if (!tokenId || isNaN(tokenId)) {
    showToast('error', 'Error', 'Invalid token ID')
    return
  }

  // First click: switch to confirm mode
  if (!burnConfirmMode) {
    burnConfirmMode = true
    if (btn) {
      btn.textContent = 'Confirm'
      btn.classList.add('mp-btn-warning')
    }
    return
  }

  // Second click: close modal, show overlay + toast instantly
  const isLand = currentAsset.category?.toLowerCase() === 'land'
  const coords = currentAsset.coordinates
  const asset = { ...currentAsset }
  close()

  const overlay = document.getElementById('loadingOverlay')
  overlay?.classList.add('active')
  showToast('info', 'Processing', 'Burning asset...')

  try {
    const { blockchain } = await import('../services/blockchain.js')

    // Land parcels: release claim in LandClaim contract BEFORE burning token
    if (isLand && coords) {
      const { BlockchainManager } = await import('../../../blockchain/BlockchainManager.js')
      const x = coords.face * 1000 + coords.localX
      await BlockchainManager.releaseLand(x, coords.localY)
    }

    await blockchain.burn(tokenId, asset.supply || 1, asset)

    // Remove ALL possible GenosDB records for this asset
    const assetNodeId = `asset_${tokenId}`
    await window.db?.remove(assetNodeId).catch(() => {})

    if (isLand && coords) {
      await window.db?.remove(`land_${coords.face}_${coords.localX}_${coords.localY}`).catch(() => {})
    }

    if (asset.id && asset.id !== assetNodeId) {
      await window.db?.remove(asset.id).catch(() => {})
    }

    if (isLand && coords) {
      window.dispatchEvent(new CustomEvent('landDataChanged', {
        detail: { removed: true, face: coords.face, localX: coords.localX, localY: coords.localY }
      }))
    }

    overlay?.classList.remove('active')
    showToast('success', 'Burned', `Asset #${tokenId} has been burned`)
    window.refreshCurrentView?.()

  } catch (e) {
    console.error('[AssetDetail] Burn failed:', e)
    overlay?.classList.remove('active')
    showToast('error', 'Burn Failed', e.message)
  } finally {
    resetBurnConfirmState()
  }
}

/**
 * Reset burn confirmation state
 */
function resetBurnConfirmState() {
  burnConfirmMode = false
  const btn = document.getElementById('assetBurnBtn')
  if (btn) {
    btn.textContent = 'Burn'
    btn.classList.remove('mp-btn-warning')
    btn.disabled = false
  }
}

/**
 * Close asset detail panel
 */
export async function close() {
  currentAsset = null
  window.currentDetailItem = null
  resetBurnConfirmState()
  resetUpdateConfirmState()
  document.getElementById(PANEL_ID)?.classList.remove('open')
}

/**
 * Configure royalty settings
 */
export function configureRoyalty() {
  if (!currentAsset) return
  close()
  window.wizards?.royalty?.(currentAsset)
}

/**
 * Gift asset to another user
 */
export function giftAsset() {
  if (!currentAsset) return
  close()
  window.wizards?.gift?.(currentAsset)
}

export function init() {
  window.assetDetailPanel = {
    open, close, configureRoyalty, giftAsset, generateHTML
  }
}

init()

export default {
  open, close, configureRoyalty, giftAsset, generateHTML, init
}
