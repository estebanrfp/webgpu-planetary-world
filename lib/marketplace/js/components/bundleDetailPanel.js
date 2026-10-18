/**
 * Bundle Detail Panel Component
 * Displays detailed bundle information in a slide-out panel
 * @module marketplace/components/bundleDetailPanel
 */

import { showToast } from '../services/toast.js'
import { autoLink } from '../services/textUtils.js'

const PANEL_ID = 'bundleDetailPanel'
let currentBundle = null
let initialized = false

/**
 * Generate panel HTML template
 * @returns {string} HTML string
 */
export function generateHTML() {
  return `
  <div class="mp-detail-panel" id="${PANEL_ID}" onclick="if(event.target === this) closeBundleDetailPanel()">
    <div class="mp-detail-modal">
      <div class="mp-detail-header">
        <h2 class="mp-modal-title">&#128230; Bundle Details</h2>
        <div class="mp-detail-header-actions">
          <button class="mp-detail-favorite-btn" id="bundleFavoriteBtn" onclick="toggleBundleFavorite()" title="Add to favorites">&#9825;</button>
          <button class="mp-modal-close" onclick="closeBundleDetailPanel()">&times;</button>
        </div>
      </div>
      <div class="mp-detail-scroll">
        <div class="mp-detail-content">
          <div class="mp-detail-collection" id="bundleDetailCollection">WebGPU Planetary World Bundles</div>
          <h1 class="mp-detail-title" id="bundleDetailName">Starter Pack Bundle</h1>

          <div class="mp-detail-owner">
            <div class="mp-detail-owner-avatar"></div>
            <div>
              <div class="mp-detail-owner-label">Seller</div>
              <div class="mp-detail-owner-name" id="bundleDetailSeller">0x7a3d...8f2e</div>
            </div>
          </div>

          <div class="mp-status-row">
            <div class="mp-status-box mp-status-bundle">
              <span class="mp-status-box-label">Bundle Price</span>
              <span class="mp-status-box-value" id="bundleDetailPrice">4.5 OVG</span>
            </div>
            <div class="mp-status-box mp-status-savings">
              <span class="mp-status-box-label">You Save</span>
              <span class="mp-status-box-value" id="bundleDetailSavings">1.2 OVG (21%)</span>
            </div>
          </div>

          <!-- Description Section -->
          <div class="mp-detail-section mp-hidden" id="bundleDescriptionSection">
            <div class="mp-detail-section-title">Description</div>
            <p class="mp-text-muted mp-lh-relaxed" id="bundleDetailDescription">
              No description available.
            </p>
          </div>

          <div class="mp-bundle-items-section">
            <div class="mp-bundle-items-header">
              <span>Items in Bundle</span>
              <span class="mp-bundle-count" id="bundleItemCount">5 items</span>
            </div>
            <div class="mp-bundle-items-grid" id="bundleItemsGrid">
              <!-- Items populated dynamically -->
            </div>
          </div>

          <div class="mp-summary">
            <div class="mp-summary-row"><span class="mp-summary-label">Individual Total</span><span class="mp-summary-value" id="bundleIndividualTotal">5.7 OVG</span></div>
            <div class="mp-summary-row"><span class="mp-summary-label">Bundle Price</span><span class="mp-summary-value" id="bundleSummaryPrice">4.5 OVG</span></div>
            <div class="mp-summary-row mp-text-success"><span class="mp-summary-label">Your Savings</span><span class="mp-summary-value" id="bundleSummarySavings">1.2 OVG (21%)</span></div>
          </div>
        </div>
      </div>
      <!-- Buyer Footer -->
      <div class="mp-modal-footer mp-modal-footer-duo mp-bundle-footer-buyer">
        <button class="mp-btn mp-btn-ghost" onclick="closeBundleDetailPanel()">Cancel</button>
        <button class="mp-btn mp-btn-success" id="bundleBuyBtn" onclick="buyBundle()">Buy Bundle</button>
      </div>
      <!-- Owner Footer -->
      <div class="mp-modal-footer mp-modal-footer-duo mp-bundle-footer-owner mp-hidden">
        <button class="mp-btn mp-btn-ghost" onclick="closeBundleDetailPanel()">Cancel</button>
        <button class="mp-btn mp-btn-primary" id="bundleEditBtn" onclick="editBundle()">Edit Bundle</button>
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
    initialized = true
  }
}

/**
 * Open bundle detail panel
 * @param {object} bundle - Bundle data with items array
 */
export function open(bundle) {
  ensurePanel()

  if (!bundle) {
    showToast('warning', 'No Bundle', 'No bundle data provided')
    return
  }

  currentBundle = bundle
  window.currentBundleItem = bundle

  // Update basic info
  document.getElementById('bundleDetailCollection').textContent = bundle.collection || 'WebGPU Planetary World Bundles'
  document.getElementById('bundleDetailName').textContent = bundle.title || bundle.name || 'Untitled Bundle'
  // Abbreviate seller address using GenosDB's db.sm.abbrAddr if available
  const seller = bundle.owner || bundle.seller || '0x7a3d...8f2e'
  const abbreviatedSeller = window.db?.sm?.abbrAddr?.(seller) || (seller.length > 12 ? `${seller.slice(0, 6)}...${seller.slice(-4)}` : seller)
  document.getElementById('bundleDetailSeller').textContent = abbreviatedSeller

  // Update description
  const descSection = document.getElementById('bundleDescriptionSection')
  const descEl = document.getElementById('bundleDetailDescription')
  if (descSection && descEl) {
    if (bundle.description) {
      descSection.classList.remove('mp-hidden')
      descEl.innerHTML = autoLink(bundle.description)
    } else {
      descSection.classList.add('mp-hidden')
    }
  }

  // Calculate totals
  const items = bundle.items || []
  const individualTotal = items.reduce((sum, item) => sum + (parseFloat(item.price) || 0), 0)
  const bundlePrice = parseFloat(bundle.price) || individualTotal * 0.8
  const savings = individualTotal - bundlePrice
  const savingsPercent = individualTotal > 0 ? Math.round((savings / individualTotal) * 100) : 0

  // Update prices
  document.getElementById('bundleDetailPrice').textContent = `${bundlePrice.toFixed(2)} OVG`
  document.getElementById('bundleDetailSavings').textContent = `${savings.toFixed(2)} OVG (${savingsPercent}%)`
  document.getElementById('bundleIndividualTotal').textContent = `${individualTotal.toFixed(2)} OVG`
  document.getElementById('bundleSummaryPrice').textContent = `${bundlePrice.toFixed(2)} OVG`
  document.getElementById('bundleSummarySavings').textContent = `${savings.toFixed(2)} OVG (${savingsPercent}%)`
  document.getElementById('bundleItemCount').textContent = `${items.length} items`

  // Update items grid
  updateItemsGrid(items)

  // Show/hide footers based on ownership
  const isOwner = bundle.isOwner ?? false
  document.querySelector('.mp-bundle-footer-buyer')?.classList.toggle('mp-hidden', isOwner)
  document.querySelector('.mp-bundle-footer-owner')?.classList.toggle('mp-hidden', !isOwner)

  // Open panel
  document.getElementById(PANEL_ID)?.classList.add('open')
}

/**
 * Update items grid display
 * @param {Array} items - Array of item objects
 */
function updateItemsGrid(items) {
  const container = document.getElementById('bundleItemsGrid')
  if (!container) return

  if (items.length === 0) {
    // Default items for mockup
    items = [
      { name: 'Cyber Helmet', image: 'https://picsum.photos/80/80?random=1', price: '1.2' },
      { name: 'Neon Jacket', image: 'https://picsum.photos/80/80?random=2', price: '0.8' },
      { name: 'Holo Boots', image: 'https://picsum.photos/80/80?random=3', price: '1.5' },
      { name: 'Cyber Gloves', image: 'https://picsum.photos/80/80?random=4', price: '0.9' },
      { name: 'LED Visor', image: 'https://picsum.photos/80/80?random=5', price: '1.3' }
    ]
  }

  container.innerHTML = items.map(item => `
    <div class="mp-bundle-item">
      <div class="mp-bundle-item-image"><img loading="lazy" decoding="async" src="${item.image || 'https://picsum.photos/80/80'}" alt="${item.name || item.title}"></div>
      <div class="mp-bundle-item-info">
        <div class="mp-bundle-item-name">${item.name || item.title}</div>
        <div class="mp-bundle-item-price">${item.price || '0'} OVG</div>
      </div>
    </div>
  `).join('')
}

/**
 * Close bundle detail panel
 */
export function close() {
  currentBundle = null
  window.currentBundleItem = null
  document.getElementById(PANEL_ID)?.classList.remove('open')
}

/**
 * Toggle favorite status
 */
export function toggleFavorite() {
  const btn = document.getElementById('bundleFavoriteBtn')
  if (!btn) return

  const isFavorite = btn.classList.toggle('active')
  btn.innerHTML = isFavorite ? '&#9829;' : '&#9825;'

  if (currentBundle) {
    currentBundle.isFavorite = isFavorite
  }

  showToast('success', isFavorite ? 'Added to Favorites' : 'Removed from Favorites', '')
}

/**
 * Buy the current bundle
 */
export async function buy() {
  if (!currentBundle) return

  close()

  try {
    const { blockchain } = await import('../services/blockchain.js')
    await blockchain.buyBundle(currentBundle.id, currentBundle.price)
  } catch (error) {
    // Error toast shown by blockchain.js
  }
}

/**
 * Edit the current bundle (owner action)
 */
export async function edit() {
  if (!currentBundle) return

  close()
  const wizard = await import('../wizards/editBundleWizard.js')
  wizard.open(currentBundle)
}

export function init() {
  window.bundleDetailPanel = { open, close, toggleFavorite, buy, edit, generateHTML }
  window.closeBundleDetailPanel = close
  window.toggleBundleFavorite = toggleFavorite
  window.openBundleDetailPanel = open
  window.buyBundle = buy
  window.editBundle = edit
}

init()

export default { open, close, toggleFavorite, buy, edit, generateHTML, init }
