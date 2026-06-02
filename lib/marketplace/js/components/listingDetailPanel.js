/**
 * Listing Detail Panel Component
 * Displays listing information for Explore view (buyer perspective)
 * @module marketplace/components/listingDetailPanel
 */

import { showToast } from '../services/toast.js'
import { autoLink } from '../services/textUtils.js'

const PANEL_ID = 'listingDetailPanel'
let currentListing = null
let initialized = false

/**
 * Generate panel HTML template
 * @returns {string} HTML string
 */
export function generateHTML() {
  return `
  <div class="mp-detail-panel" id="${PANEL_ID}" onclick="if(event.target === this) window.listingDetailPanel?.close?.()">
    <div class="mp-detail-modal">
      <div class="mp-detail-header">
        <h2 class="mp-modal-title">Listing Details</h2>
        <div class="mp-detail-header-actions">
          <button class="mp-detail-favorite-btn" id="listingFavoriteBtn" onclick="window.listingDetailPanel?.toggleFavorite?.()" title="Add to favorites">&#9825;</button>
          <button class="mp-modal-close" onclick="window.listingDetailPanel?.close?.()">&times;</button>
        </div>
      </div>
      <div class="mp-detail-scroll">
        <div class="mp-detail-image">
          <img loading="lazy" decoding="async" id="listingImage" src="" alt="Listing">
          <span class="mp-rarity-badge" id="listingRarityBadge">Rare</span>
          <span class="mp-seller-badge" id="listingSellerBadge">0x7a3d...8f2e</span>
        </div>
        <div class="mp-detail-content">
          <div class="mp-detail-collection" id="listingCollection">Genesis Plaza</div>
          <h2 class="mp-detail-title" id="listingTitle">Cyber Dragon Wings #142</h2>
          <a class="mp-blockchain-link mp-hidden" id="listingBlockchainLink" href="#" target="_blank" rel="noopener noreferrer">
            <span class="mp-blockchain-icon">&#9830;</span>
            <span>View on Polygonscan</span>
          </a>
          <a class="mp-blockchain-link mp-hidden" id="listingOpenSeaLink" href="#" target="_blank" rel="noopener noreferrer">
            <span class="mp-blockchain-icon">&#9778;</span>
            <span>View on OpenSea</span>
          </a>

          <div class="mp-status-row" id="listingStatusRow">
            <!-- Sale type status -->
            <div class="mp-status-box mp-status-price" id="listingStatusSale">
              <span class="mp-status-box-label">Price</span>
              <span class="mp-status-box-value" id="listingPrice">0.5 OVG</span>
            </div>
            <!-- Rent type status -->
            <div class="mp-status-box mp-status-rent mp-hidden" id="listingStatusRent">
              <span class="mp-status-box-label">Daily Rate</span>
              <span class="mp-status-box-value" id="listingRentRate">0.05 OVG/day</span>
            </div>
            <!-- Auction type status -->
            <div class="mp-status-box mp-status-auction mp-hidden" id="listingStatusAuction">
              <span class="mp-status-box-label">Current Bid</span>
              <span class="mp-status-box-value" id="listingCurrentBid">2.3 OVG</span>
            </div>
            <div class="mp-status-box mp-status-time mp-hidden" id="listingStatusTime">
              <span class="mp-status-box-label">Ends In</span>
              <span class="mp-status-box-value" id="listingEndsIn">2h 34m</span>
            </div>
            <!-- Bundle type status -->
            <div class="mp-status-box mp-status-bundle mp-hidden" id="listingStatusBundle">
              <span class="mp-status-box-label">Bundle Price</span>
              <span class="mp-status-box-value" id="listingBundlePrice">4.5 OVG</span>
            </div>
          </div>

          <!-- Description Section -->
          <div class="mp-detail-section">
            <div class="mp-detail-section-title">Description</div>
            <p class="mp-text-muted mp-lh-relaxed" id="listingDescription">
              A rare pair of cybernetic dragon wings from the Genesis Plaza collection.
            </p>
          </div>

          <!-- Bundle Items Section (only for bundles) -->
          <div class="mp-detail-section mp-hidden" id="listingBundleItemsSection">
            <div class="mp-detail-section-title">Bundle Items (<span id="listingBundleItemsCount">0</span>)</div>
            <div class="mp-bundle-items-grid" id="listingBundleItems">
              <!-- Bundle items populated dynamically -->
            </div>
          </div>

          <!-- Properties Section -->
          <div class="mp-detail-section">
            <div class="mp-detail-section-title">Attributes</div>
            <div class="mp-properties" id="listingAttributes">
              <!-- Properties populated dynamically -->
            </div>
          </div>

          <!-- History Section -->
          <div class="mp-detail-section">
            <div class="mp-detail-section-title">History</div>
            <div class="mp-mb-16">
              <div class="mp-chart-label">Price History (30 days)</div>
              <div class="mp-sales-chart" id="listingPriceChart">
                <!-- Chart bars populated dynamically -->
              </div>
            </div>
            <div id="listingHistory">
              <!-- History items populated dynamically -->
            </div>
          </div>
        </div>
      </div>
      <!-- Footer with buyer actions -->
      <div class="mp-modal-footer mp-modal-footer-duo mp-listing-footer">
        <button class="mp-btn mp-btn-ghost" onclick="window.listingDetailPanel?.close?.()">Cancel</button>
        <button class="mp-btn mp-btn-success" id="listingBuyBtn">Buy</button>
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
}

/**
 * Open listing detail panel
 * @param {object} listing - Listing data
 */
export function open(listing) {
  ensurePanel()

  if (!listing) {
    showToast('warning', 'No Listing', 'No listing data provided')
    return
  }

  currentListing = listing
  window.currentDetailItem = listing

  // Update image
  const imageEl = document.getElementById('listingImage')
  if (imageEl) imageEl.src = listing.image || ''

  // Update basic info - avoid showing hash as title
  const isHash = (str) => str && (str.length > 30 || /^[a-f0-9-]{20,}$/i.test(str))
  const displayTitle = listing.title && !isHash(listing.title)
    ? listing.title
    : listing.name && !isHash(listing.name)
      ? listing.name
      : 'Untitled Item'
  const displayCollection = listing.collection && listing.collection !== 'Unknown' && !isHash(listing.collection)
    ? listing.collection
    : 'Marketplace'

  document.getElementById('listingCollection').textContent = displayCollection
  document.getElementById('listingTitle').textContent = displayTitle

  // Update blockchain links (Polygonscan & OpenSea)
  const blockchainLink = document.getElementById('listingBlockchainLink')
  const openSeaLink = document.getElementById('listingOpenSeaLink')
  const tokenId = listing.tokenId
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

  // Update owner badge on image
  const seller = listing.seller || listing.owner || '0x7a3d...8f2e'
  const abbreviatedSeller = window.db?.sm?.abbrAddr?.(seller) || (seller.length > 12 ? `${seller.slice(0, 6)}...${seller.slice(-4)}` : seller)
  document.getElementById('listingSellerBadge').textContent = `OWNER ${abbreviatedSeller}`

  // Update rarity badge
  const rarityBadge = document.getElementById('listingRarityBadge')
  if (rarityBadge) {
    const rarity = listing.rarity || 'Common'
    rarityBadge.textContent = rarity
    rarityBadge.className = `mp-rarity-badge mp-rarity-${rarity.toLowerCase()}`
  }

  document.getElementById('listingDescription').innerHTML = autoLink(listing.description || 'No description available.')

  // Update status boxes based on listing type
  updateStatusDisplay(listing)

  // Update bundle items (if bundle)
  updateBundleItems(listing)

  // Update properties
  updateProperties(listing)

  // Update history
  updateHistory(listing.history || [])

  // Update price chart
  updatePriceChart(listing.priceHistory || [])

  // Update CTA buttons based on type
  updateCtaButtons(listing)

  // Update favorite button
  const favBtn = document.getElementById('listingFavoriteBtn')
  const isFav = window.favoriteItems?.has(listing.id)
  if (favBtn) {
    favBtn.classList.toggle('active', isFav)
    favBtn.innerHTML = isFav ? '&#9829;' : '&#9825;'
  }

  // Open panel
  document.getElementById(PANEL_ID)?.classList.add('open')
}

/**
 * Update status display based on listing type
 * @param {object} listing - Listing data
 */
function updateStatusDisplay(listing) {
  const type = listing.status || listing.type || 'sale'

  // Hide all status boxes first
  document.getElementById('listingStatusSale')?.classList.add('mp-hidden')
  document.getElementById('listingStatusRent')?.classList.add('mp-hidden')
  document.getElementById('listingStatusAuction')?.classList.add('mp-hidden')
  document.getElementById('listingStatusTime')?.classList.add('mp-hidden')
  document.getElementById('listingStatusBundle')?.classList.add('mp-hidden')

  // Show relevant status box
  if (type === 'sale') {
    document.getElementById('listingStatusSale')?.classList.remove('mp-hidden')
    document.getElementById('listingPrice').textContent = listing.price || '0 OVG'
  } else if (type === 'rent') {
    document.getElementById('listingStatusRent')?.classList.remove('mp-hidden')
    document.getElementById('listingRentRate').textContent = listing.rentRate || listing.price || '0.05 OVG/day'
  } else if (type === 'auction') {
    document.getElementById('listingStatusAuction')?.classList.remove('mp-hidden')
    document.getElementById('listingStatusTime')?.classList.remove('mp-hidden')
    document.getElementById('listingCurrentBid').textContent = listing.currentBid || listing.price || '0 OVG'
    const endsInEl = document.getElementById('listingEndsIn')
    if (endsInEl) {
      // Fallback chain: endsAt > listedAt+3days > timestamp+3days > now+3days
      const endsAt = listing.endsAt || (listing.listedAt ? listing.listedAt + 3 * 24 * 60 * 60 * 1000 : (listing.timestamp ? listing.timestamp + 3 * 24 * 60 * 60 * 1000 : Date.now() + 3 * 24 * 60 * 60 * 1000))
      endsInEl.textContent = window.formatTimeRemaining?.(endsAt) || '--'
      endsInEl.dataset.endsAt = endsAt
      endsInEl.classList.add('mp-timer-value')
    }
  } else if (type === 'bundle') {
    document.getElementById('listingStatusBundle')?.classList.remove('mp-hidden')
    document.getElementById('listingBundlePrice').textContent = listing.price || '0 OVG'
  }
}

/**
 * Update bundle items display
 * @param {object} listing - Listing data
 */
function updateBundleItems(listing) {
  const section = document.getElementById('listingBundleItemsSection')
  const container = document.getElementById('listingBundleItems')
  const countEl = document.getElementById('listingBundleItemsCount')
  const type = listing.status || listing.type || 'sale'
  const isBundle = type === 'bundle'

  if (!section || !container) return

  if (!isBundle || !listing.bundleItems?.length) {
    section.classList.add('mp-hidden')
    return
  }

  section.classList.remove('mp-hidden')
  countEl.textContent = listing.bundleItems.length

  container.innerHTML = listing.bundleItems.map(item => `
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
 * Update CTA buttons based on listing type
 * @param {object} listing - Listing data
 */
function updateCtaButtons(listing) {
  const type = listing.status || listing.type || 'sale'
  const buyBtn = document.getElementById('listingBuyBtn')

  if (buyBtn) {
    const btnConfig = {
      sale: { text: 'Buy', class: 'mp-btn-success', action: () => { close(); window.wizards?.buy?.(listing) } },
      rent: { text: 'Rent', class: 'mp-btn-rent', action: () => { close(); window.wizards?.rent?.(listing) } },
      auction: { text: 'Bid', class: 'mp-btn-warning', action: () => { close(); window.wizards?.bid?.(listing) } },
      bundle: { text: 'Buy', class: 'mp-btn-success', action: () => { close(); window.wizards?.bundleBuy?.(listing) } }
    }
    const config = btnConfig[type] || btnConfig.sale
    buyBtn.textContent = config.text
    buyBtn.className = `mp-btn ${config.class}`
    buyBtn.onclick = config.action
  }
}

/**
 * Update properties display with real listing data
 * @param {object} listing - Listing data
 */
function updateProperties(listing) {
  const container = document.getElementById('listingAttributes')
  if (!container) return

  const category = listing.category || 'Objects'
  const collection = listing.collection || 'Unknown'
  const rarity = listing.rarity || 'Common'

  container.innerHTML = `
    <div class="mp-property">
      <div class="mp-property-type">Category</div>
      <div class="mp-property-value">${category}</div>
    </div>
    <div class="mp-property">
      <div class="mp-property-type">Collection</div>
      <div class="mp-property-value">${collection}</div>
    </div>
    <div class="mp-property">
      <div class="mp-property-type">Rarity</div>
      <div class="mp-property-value">${rarity}</div>
    </div>
  `
}

/**
 * Update history display
 * @param {Array} history - Array of history items
 */
function updateHistory(history) {
  const container = document.getElementById('listingHistory')
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
  const container = document.getElementById('listingPriceChart')
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

/**
 * Close listing detail panel
 */
export function close() {
  currentListing = null
  window.currentDetailItem = null
  document.getElementById(PANEL_ID)?.classList.remove('open')
}

/**
 * Toggle favorite status
 */
export function toggleFavorite() {
  const btn = document.getElementById('listingFavoriteBtn')
  if (!btn || !currentListing) return

  const isFavorite = btn.classList.toggle('active')
  btn.innerHTML = isFavorite ? '&#9829;' : '&#9825;'

  // Use global favorite function if available
  if (typeof window.toggleFavorite === 'function') {
    window.toggleFavorite(currentListing.id)
  } else {
    currentListing.isFavorite = isFavorite
    showToast('success', isFavorite ? 'Added to Favorites' : 'Removed from Favorites', '')
  }
}

export function init() {
  window.listingDetailPanel = { open, close, toggleFavorite, generateHTML }
}

init()

export default { open, close, toggleFavorite, generateHTML, init }
