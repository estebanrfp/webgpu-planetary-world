/**
 * Marketplace Mockup - Entry Point
 *
 * Factory function that creates the mockup marketplace controller.
 * Loads as overlay with "M" key shortcut.
 *
 * @module marketplace
 */

import { injectStyles, removeStyles } from './styles.js'

const OVERLAY_ID = 'mockup-marketplace-overlay'

/**
 * Create the Mockup Marketplace UI controller
 * @returns {object} MarketplaceUI API
 */
export const createMockupMarketplaceUI = () => {
  let isOpen = false
  let overlay = null
  let initialized = false

  /**
   * Generate the marketplace HTML content
   * @returns {string}
   */
  const generateHTML = () => `
    <div class="marketplace-app" role="application">
      <!-- Marketplace Paused Banner -->
      <div class="mp-paused-banner mp-hidden" id="pausedBanner">
        <div class="mp-paused-banner-content">
          <span class="mp-paused-icon">&#9888;</span>
          <div class="mp-paused-text">
            <strong>Marketplace Paused</strong>
            <span>Trading is temporarily disabled. Your assets are safe.</span>
          </div>
          <button class="mp-paused-dismiss" data-action="dismiss-paused" title="Dismiss">&#10005;</button>
        </div>
      </div>

      <!-- Header -->
      <header class="mp-header">
        <div class="mp-header-left">
          <button class="mp-menu-toggle" id="menuToggle" aria-label="Menu">
            <span></span>
          </button>
          <button class="mp-close-btn" id="mockupCloseBtn" title="Close (M)">&#10005;</button>
          <div class="mp-search">
            <span class="mp-search-icon">&#128269;</span>
            <input type="search" class="mp-search-input" id="searchInput" placeholder="Search">
          </div>
          <nav class="mp-nav-tabs">
            <button class="mp-nav-tab active" data-view="explore">Explore</button>
            <button class="mp-nav-tab" data-view="land">Map</button>
            <button class="mp-nav-tab" data-view="inventory">Inventory</button>
            <button class="mp-nav-tab" data-view="offers">Offers</button>
          </nav>
        </div>
        <div class="mp-header-right">
          <span class="mp-wallet-address">0x1234...5678</span>
          <button class="mp-header-icon" id="syncBlockchainBtn" data-action="sync-blockchain" title="Sync from blockchain" aria-label="Sync from blockchain"><span aria-hidden="true">&#8635;</span></button>
          <button class="mp-header-icon" data-action="open-modal" data-modal="analyticsModal" title="Analytics" aria-label="Open analytics">
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
          </button>
          <button class="mp-header-icon" data-action="open-modal" data-modal="settingsModal" title="Settings" aria-label="Open settings"><span aria-hidden="true">&#9881;</span></button>
        </div>
      </header>

      <!-- Subheader -->
      <div class="mp-subheader" id="subheader">
        <div class="mp-subheader-left">
          <button class="mp-subheader-action" data-subheader-view="explore" id="exploreSelectToggleBtn">
            <span class="mp-subheader-action-icon">&#9745;</span>
            <span>Select</span>
          </button>
          <span class="mp-subheader-selection-count" data-subheader-view="explore" id="exploreSelectionIndicator" class="mp-hidden">
            Selected (<span id="exploreSelectedCount">0</span>)
          </span>
          <button class="mp-subheader-action mp-subheader-action-primary" data-subheader-view="explore" id="batchBuyBtn" class="mp-hidden">Buy</button>
          <button class="mp-subheader-action" data-subheader-view="explore" id="cancelExploreBuyBtn" class="mp-hidden">Cancel</button>
          <button class="mp-subheader-action mp-back-btn" id="inventoryBackBtn" style="display: none;" onclick="window.clearInventoryGroupFilter?.()">
            <span class="mp-subheader-action-icon">←</span>
          </button>
          <button class="mp-subheader-action" data-subheader-view="inventory" id="inventorySelectToggleBtn">
            <span class="mp-subheader-action-icon">&#9745;</span>
            <span>Select</span>
          </button>
          <span class="mp-subheader-selection-count" data-subheader-view="inventory" id="selectionIndicator" class="mp-hidden">
            Selected (<span id="inventorySelectedCount">0</span>)
          </span>
          <button class="mp-subheader-action mp-subheader-action-primary" data-subheader-view="inventory" id="batchSellBtn" class="mp-hidden">List</button>
          <button class="mp-subheader-action mp-subheader-action-bundle" data-subheader-view="inventory" id="createBundleBtn" class="mp-hidden">Bundle</button>
          <button class="mp-subheader-action" data-subheader-view="inventory" id="cancelSelectBtn" class="mp-hidden">Cancel</button>
          <span class="mp-subheader-title" data-subheader-view="offers">Offers</span>
          <span class="mp-subheader-title" data-subheader-view="land">Map</span>
        </div>
        <div class="mp-subheader-right">
          <div class="mp-subheader-land-right" data-subheader-view="land">
            <span class="mp-subheader-land-info">90,774 Parcels · 6 Regions · 2 Hemispheres</span>
            <span class="mp-subheader-divider"></span>
            <span class="mp-subheader-label">View:</span>
            <span class="mp-subheader-coords-value" id="subheaderCoords">45°, 30°</span>
          </div>
        </div>
        <div class="mp-view-toggle" data-subheader-view="explore inventory collections">
          <button class="mp-view-btn active" data-view-mode="grid" title="Grid view"><svg aria-label="Grid View" class="fill-current" fill="currentColor" height="18" role="img" viewBox="0 -960 960 960" width="18" xmlns="http://www.w3.org/2000/svg"><path d="M120-520v-320h320v320H120Zm0 400v-320h320v320H120Zm400-400v-320h320v320H520Zm0 400v-320h320v320H520ZM200-600h160v-160H200v160Zm400 0h160v-160H600v160Zm0 400h160v-160H600v160Zm-400 0h160v-160H200v160Zm400-400Zm0 240Zm-240 0Zm0-240Z"/></svg></button>
          <button class="mp-view-btn" data-view-mode="table-expanded" title="List view"><svg aria-label="Table Rows" class="fill-current" fill="currentColor" height="18" role="img" viewBox="0 -960 960 960" width="18" xmlns="http://www.w3.org/2000/svg"><path d="M760-200v-120H200v120h560Zm0-200v-160H200v160h560Zm0-240v-120H200v120h560ZM200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Z"/></svg></button>
        </div>
      </div>

      <!-- Mobile Menu Overlay -->
      <div class="mp-mobile-overlay" id="mobileOverlay"></div>

      <!-- Mobile Menu Drawer -->
      <nav class="mp-mobile-menu" id="mobileMenu">
        <div class="mp-mobile-search">
          <span>&#128269;</span>
          <input type="search" id="mobileSearchInput" placeholder="Search...">
        </div>
        <div class="mp-mobile-menu-section">
          <div class="mp-mobile-menu-title">Navigation</div>
          <button class="mp-mobile-nav-item active" data-view="explore"><span class="mp-mobile-nav-icon">&#128270;</span> Explore</button>
          <button class="mp-mobile-nav-item" data-view="land"><span class="mp-mobile-nav-icon">&#127758;</span> Map</button>
        </div>
        <div class="mp-mobile-menu-section">
          <div class="mp-mobile-menu-title">My Account</div>
          <button class="mp-mobile-nav-item" data-view="inventory"><span class="mp-mobile-nav-icon">&#128188;</span> Inventory</button>
          <button class="mp-mobile-nav-item" data-view="offers"><span class="mp-mobile-nav-icon">&#128176;</span> Offers</button>
        </div>
      </nav>

      <!-- Sidebar -->
      <aside class="mp-sidebar">
        <div class="mp-sidebar-mobile-nav">
          <div class="mp-filter-section">
            <div class="mp-filter-header"><span class="mp-filter-title">Navigation</span></div>
            <div class="mp-filter-options">
              <div class="mp-filter-option mp-nav-option selected" data-view="explore"><span class="mp-nav-icon">&#128270;</span><span class="mp-filter-label">Explore</span></div>
              <div class="mp-filter-option mp-nav-option" data-view="land"><span class="mp-nav-icon">&#127758;</span><span class="mp-filter-label">Map</span></div>
              <div class="mp-filter-option mp-nav-option" data-view="inventory"><span class="mp-nav-icon">&#128188;</span><span class="mp-filter-label">Inventory</span></div>
              <div class="mp-filter-option mp-nav-option" data-view="offers"><span class="mp-nav-icon">&#128176;</span><span class="mp-filter-label">Offers</span></div>
            </div>
          </div>
        </div>

        <!-- Category Filter (Explore) -->
        <div class="mp-filter-group" data-views="explore">
          <div class="mp-filter-section" id="categoryFilter">
            <div class="mp-filter-header"><span class="mp-filter-title">Category</span><span class="mp-filter-toggle">&#9660;</span></div>
            <div class="mp-filter-pills">
              <button class="mp-filter-pill" data-category="favorites"><span>Favorites</span><span class="mp-pill-count" data-count-category="favorites">0</span></button>
              <button class="mp-filter-pill active" data-category="land"><span>Land</span><span class="mp-pill-count" data-count-category="land">0</span></button>
              <button class="mp-filter-pill active" data-category="wearables"><span>Wearables</span><span class="mp-pill-count" data-count-category="wearables">0</span></button>
              <button class="mp-filter-pill active" data-category="objects"><span>Objects</span><span class="mp-pill-count" data-count-category="objects">0</span></button>
              <button class="mp-filter-pill active" data-category="collections"><span>Collections</span><span class="mp-pill-count" data-count-category="collections">0</span></button>
            </div>
          </div>
        </div>

        <!-- Category Filter (Inventory) -->
        <div class="mp-filter-group mp-hidden" data-views="inventory">
          <div class="mp-filter-section" id="inventoryCategoryFilter">
            <div class="mp-filter-header"><span class="mp-filter-title">Category</span><span class="mp-filter-toggle">&#9660;</span></div>
            <div class="mp-filter-pills">
              <button class="mp-filter-pill active" data-inventory-category="land"><span>Land</span><span class="mp-pill-count" data-count-inventory="land">0</span></button>
              <button class="mp-filter-pill active" data-inventory-category="wearables"><span>Wearables</span><span class="mp-pill-count" data-count-inventory="wearables">0</span></button>
              <button class="mp-filter-pill active" data-inventory-category="objects"><span>Objects</span><span class="mp-pill-count" data-count-inventory="objects">0</span></button>
              <button class="mp-filter-pill active" data-inventory-category="collections"><span>Collections</span><span class="mp-pill-count" data-count-inventory="collections">0</span></button>
            </div>
          </div>
        </div>

        <!-- Explore Filters -->
        <div class="mp-filter-group" data-views="explore">
          <div class="mp-filter-section" id="statusFilter">
            <div class="mp-filter-header"><span class="mp-filter-title">Status</span><span class="mp-filter-toggle">&#9660;</span></div>
            <div class="mp-filter-pills">
              <button class="mp-filter-pill active" data-type="sale"><span>For Sale</span><span class="mp-pill-count" data-count-type="sale">0</span></button>
              <button class="mp-filter-pill active" data-type="rent"><span>For Rent</span><span class="mp-pill-count" data-count-type="rent">0</span></button>
              <button class="mp-filter-pill active" data-type="auction"><span>Auction</span><span class="mp-pill-count" data-count-type="auction">0</span></button>
              <button class="mp-filter-pill active" data-type="bundle"><span>Bundle</span><span class="mp-pill-count" data-count-type="bundle">0</span></button>
            </div>
          </div>
          <div class="mp-filter-section">
            <div class="mp-filter-header"><span class="mp-filter-title">Rarity</span><span class="mp-filter-toggle">&#9660;</span></div>
            <div class="mp-filter-pills">
              <button class="mp-filter-pill active" data-rarity="common"><span>Common</span><span class="mp-pill-count" data-count-rarity="common">0</span></button>
              <button class="mp-filter-pill active" data-rarity="uncommon"><span>Uncommon</span><span class="mp-pill-count" data-count-rarity="uncommon">0</span></button>
              <button class="mp-filter-pill active" data-rarity="rare"><span>Rare</span><span class="mp-pill-count" data-count-rarity="rare">0</span></button>
              <button class="mp-filter-pill active" data-rarity="epic"><span>Epic</span><span class="mp-pill-count" data-count-rarity="epic">0</span></button>
              <button class="mp-filter-pill active" data-rarity="legendary"><span>Legendary</span><span class="mp-pill-count" data-count-rarity="legendary">0</span></button>
              <button class="mp-filter-pill active" data-rarity="mythic"><span>Mythic</span><span class="mp-pill-count" data-count-rarity="mythic">0</span></button>
            </div>
          </div>
        </div>

        <!-- Inventory Filters -->
        <div class="mp-filter-group mp-hidden" data-views="inventory">
          <div class="mp-filter-section">
            <div class="mp-filter-header"><span class="mp-filter-title">Status</span><span class="mp-filter-toggle">&#9660;</span></div>
            <div class="mp-filter-pills">
              <button class="mp-filter-pill active" data-inventory-status="unlisted"><span>Unlisted</span><span class="mp-pill-count" data-count-listing="unlisted">0</span></button>
              <button class="mp-filter-pill active" data-inventory-status="sale"><span>For Sale</span><span class="mp-pill-count" data-count-listing="sale">0</span></button>
              <button class="mp-filter-pill active" data-inventory-status="rent"><span>For Rent</span><span class="mp-pill-count" data-count-listing="rent">0</span></button>
              <button class="mp-filter-pill active" data-inventory-status="auction"><span>Auction</span><span class="mp-pill-count" data-count-listing="auction">0</span></button>
              <button class="mp-filter-pill active" data-inventory-status="bundle"><span>Bundle</span><span class="mp-pill-count" data-count-listing="bundle">0</span></button>
            </div>
          </div>
          <div class="mp-filter-section">
            <div class="mp-filter-header"><span class="mp-filter-title">Rarity</span><span class="mp-filter-toggle">&#9660;</span></div>
            <div class="mp-filter-pills">
              <button class="mp-filter-pill active" data-inventory-rarity="common"><span>Common</span><span class="mp-pill-count" data-count-inventory-rarity="common">0</span></button>
              <button class="mp-filter-pill active" data-inventory-rarity="uncommon"><span>Uncommon</span><span class="mp-pill-count" data-count-inventory-rarity="uncommon">0</span></button>
              <button class="mp-filter-pill active" data-inventory-rarity="rare"><span>Rare</span><span class="mp-pill-count" data-count-inventory-rarity="rare">0</span></button>
              <button class="mp-filter-pill active" data-inventory-rarity="epic"><span>Epic</span><span class="mp-pill-count" data-count-inventory-rarity="epic">0</span></button>
              <button class="mp-filter-pill active" data-inventory-rarity="legendary"><span>Legendary</span><span class="mp-pill-count" data-count-inventory-rarity="legendary">0</span></button>
              <button class="mp-filter-pill active" data-inventory-rarity="mythic"><span>Mythic</span><span class="mp-pill-count" data-count-inventory-rarity="mythic">0</span></button>
            </div>
          </div>
        </div>

        <!-- Offers Filters -->
        <div class="mp-filter-group mp-hidden" data-views="offers">
          <div class="mp-filter-section">
            <div class="mp-filter-header"><span class="mp-filter-title">Direction</span><span class="mp-filter-toggle">&#9660;</span></div>
            <div class="mp-filter-pills">
              <button class="mp-filter-pill active" data-offer-direction="all"><span>All Offers</span><span class="mp-pill-count" data-count-direction="all">0</span></button>
              <button class="mp-filter-pill" data-offer-direction="received"><span>Received</span><span class="mp-pill-count" data-count-direction="received">0</span></button>
              <button class="mp-filter-pill" data-offer-direction="sent"><span>Sent</span><span class="mp-pill-count" data-count-direction="sent">0</span></button>
            </div>
          </div>
          <div class="mp-filter-section">
            <div class="mp-filter-header"><span class="mp-filter-title">Status</span><span class="mp-filter-toggle">&#9660;</span></div>
            <div class="mp-filter-pills">
              <button class="mp-filter-pill active" data-offer-status="pending"><span>Pending</span><span class="mp-pill-count" data-count-offer-status="pending">0</span></button>
              <button class="mp-filter-pill" data-offer-status="expired"><span>Expired</span><span class="mp-pill-count" data-count-offer-status="expired">0</span></button>
            </div>
          </div>
        </div>

        <!-- Land Map Filters -->
        <div class="mp-filter-group mp-hidden" data-views="land">
          <div class="mp-filter-section">
            <div class="mp-filter-header"><span class="mp-filter-title">Parcels</span><span class="mp-filter-toggle">&#9660;</span></div>
            <div class="mp-filter-pills">
              <button class="mp-filter-pill active" data-land-filter="sale"><span>For Sale</span></button>
              <button class="mp-filter-pill active" data-land-filter="auction"><span>Auction</span></button>
              <button class="mp-filter-pill active" data-land-filter="rent"><span>For Rent</span></button>
              <button class="mp-filter-pill active" data-land-filter="owned"><span>My Land</span></button>
            </div>
          </div>
          <div class="mp-filter-section">
            <div class="mp-filter-header"><span class="mp-filter-title">Boundaries</span><span class="mp-filter-toggle">&#9660;</span></div>
            <div class="mp-land-sidebar-legend">
              <div class="mp-land-legend-item"><div class="mp-land-legend-color region"></div><span>Region</span></div>
              <div class="mp-land-legend-item"><div class="mp-land-legend-color state"></div><span>State</span></div>
              <div class="mp-land-legend-item"><div class="mp-land-legend-color equator"></div><span>Equator</span></div>
            </div>
          </div>
        </div>
      </aside>

      <!-- Main -->
      <main class="mp-main" id="main-content">
        <div class="mp-grid-container">
          <div class="mp-card-grid"></div>
          <div class="mp-pagination" id="paginationBar">
            <span class="mp-pagination-info" id="paginationInfo">Loading...</span>
            <button class="mp-pagination-btn" id="firstPageBtn" disabled title="First">&laquo;</button>
            <button class="mp-pagination-btn" id="prevPageBtn" disabled title="Previous">&lsaquo;</button>
            <div class="mp-pagination-numbers" id="pageNumbers"></div>
            <button class="mp-pagination-btn" id="nextPageBtn" title="Next">&rsaquo;</button>
            <button class="mp-pagination-btn" id="lastPageBtn" title="Last">&raquo;</button>
          </div>
        </div>
      </main>

      <div id="views-container"></div>
      <div id="panels-container"></div>
      <div id="modals-container"></div>

      <div class="mp-selection-bar" id="selectionBar">
        <div class="mp-selection-info">
          <span class="mp-selection-count"><strong id="selectedCount">0</strong> items selected</span>
        </div>
        <div class="mp-selection-actions">
          <button class="mp-btn mp-btn-ghost" id="clearSelectionBtn">Clear</button>
          <button class="mp-btn mp-btn-primary" id="confirmBatchBtn">Continue</button>
        </div>
      </div>

      <div class="mp-loading-overlay" id="loadingOverlay">
        <div class="mp-spinner mp-spinner-lg"></div>
      </div>

      <div class="mp-toast-container" id="toastContainer"></div>

      <!-- Mint FAB -->
      <button class="mp-fab" id="mintFab" title="Mint Asset" aria-label="Mint new asset">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
      </button>
    </div>
  `

  /**
   * Load script dynamically
   * @param {string} src - Script source
   * @param {boolean} isModule - Whether it's an ES module
   * @returns {Promise<void>}
   */
  const loadScript = (src, isModule = false) => {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = src
      if (isModule) script.type = 'module'
      script.onload = resolve
      script.onerror = reject
      document.body.appendChild(script)
    })
  }

  /**
   * Get base path for JS files
   * @returns {string}
   */
  const getBasePath = () => {
    const scripts = document.querySelectorAll('script[src]')
    for (const script of scripts) {
      if (script.src.includes('mainPlanet') || script.src.includes('main.js')) {
        const url = new URL(script.src)
        return url.origin + '/lib/marketplace/'
      }
    }
    return '/lib/marketplace/'
  }

  /**
   * Load and initialize mockup modules
   */
  const initModules = async () => {
    if (initialized) return

    window.appSpinner?.show('Loading marketplace…')
    try {
      const basePath = getBasePath()

      // Load non-module scripts first (define globals)
      await loadScript(basePath + 'js/app-ui.js', false)

      // Load app-core.js as module (imports main.js internally)
      await loadScript(basePath + 'js/app-core.js', true)

      initialized = true
    } finally {
      window.appSpinner?.hide()
    }
  }

  /**
   * Open marketplace overlay
   */
  const open = async () => {
    if (isOpen) return
    isOpen = true

    // Inject styles
    injectStyles()

    // Create overlay and initialize only once
    if (!overlay) {
      overlay = document.createElement('div')
      overlay.id = OVERLAY_ID
      overlay.className = 'mockup-marketplace-overlay'
      document.body.appendChild(overlay)
      overlay.innerHTML = generateHTML()
      overlay.querySelector('#mockupCloseBtn')?.addEventListener('click', close)
      await initModules()
    }

    overlay.classList.add('open')

    // Re-enter parcel mode if reopening on the Map view (close() exited it, and
    // a no-op tab click won't re-fire it). Mirrors the open/close symmetry.
    if (document.querySelector('.mp-nav-tab[data-view="land"].active')) {
      window.landMapView?.show?.()
    }
  }

  /**
   * Close marketplace overlay
   */
  const close = () => {
    if (!isOpen) return
    isOpen = false
    overlay?.classList.remove('open')
    // Exit parcel map mode if active
    window.landMapView?.hide?.()
    overlay?.querySelector('.marketplace-app')?.classList.remove('land-active')
  }

  /**
   * Toggle marketplace
   */
  const toggle = () => isOpen ? close() : open()

  /**
   * Initialize (register keyboard shortcut)
   */
  const init = () => {
    document.addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() === 'm' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const tag = document.activeElement?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA') return
        toggle()
      }
    })
  }

  return { init, open, close, toggle }
}

export default createMockupMarketplaceUI
