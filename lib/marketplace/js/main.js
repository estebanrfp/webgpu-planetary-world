/**
 * Marketplace Main Entry Point
 * Lazy loads wizards and components on demand
 * @module marketplace/main
 */

import { store } from './state/store.js'
import { initNavigation } from './handlers/navigation.js'
import { initModals } from './handlers/modals.js'
import { initOffers } from './handlers/offers.js'

/** Lazy-loaded modules cache */
const modules = {}

/**
 * Lazy load a wizard module
 * @param {string} name - Wizard name
 * @returns {Promise<object>} Wizard module
 */
export async function loadWizard(name) {
  if (!modules[name]) {
    modules[name] = await import(`./wizards/${name}Wizard.js`)
  }
  return modules[name]
}

/**
 * Lazy load a component module
 * @param {string} name - Component name
 * @returns {Promise<object>} Component module
 */
export async function loadComponent(name) {
  if (!modules[name]) {
    modules[name] = await import(`./components/${name}.js`)
  }
  return modules[name]
}

/** Panel open functions - lazy load on demand */
export const panels = {
  /** Open listing detail panel (Explore view - buyer perspective) */
  async listingDetail(itemIdOrListing, itemData) {
    const panel = await loadComponent('listingDetailPanel')
    const listing = typeof itemIdOrListing === 'object'
      ? itemIdOrListing
      : { id: itemIdOrListing, ...itemData, tokenId: String(itemData?.tokenId ?? itemData?.assetId ?? itemIdOrListing).replace(/^asset_/, '') }
    panel.open(listing)
  },
  /** Open asset detail panel (Inventory view - owner perspective) */
  async assetDetail(itemIdOrAsset, itemData) {
    const panel = await loadComponent('assetDetailPanel')
    const asset = typeof itemIdOrAsset === 'object'
      ? itemIdOrAsset
      : { id: itemIdOrAsset, ...itemData, tokenId: String(itemData?.tokenId ?? itemData?.assetId ?? itemIdOrAsset).replace(/^asset_/, '') }
    panel.open(asset)
  },
  async bundleDetail(bundle) {
    const panel = await loadComponent('bundleDetailPanel')
    panel.open(bundle)
  }
}

/** Wizard open functions - lazy load on demand */
export const wizards = {
  // Buyer actions
  async buy(listing) {
    const wizard = await loadWizard('buy')
    wizard.open(listing)
  },
  async offer(listing) {
    const wizard = await loadWizard('offer')
    wizard.open(listing)
  },
  async bid(auction) {
    const wizard = await loadWizard('bid')
    wizard.open(auction)
  },
  async rent(listing) {
    const wizard = await loadWizard('rent')
    wizard.open(listing)
  },
  async batchBuy(listings) {
    const wizard = await loadWizard('batchBuy')
    wizard.open(listings)
  },
  async globalOffer(assetId) {
    const wizard = await loadWizard('globalOffer')
    wizard.open(assetId)
  },

  // Owner actions
  async sell(asset) {
    const wizard = await loadWizard('sell')
    wizard.open(asset)
  },
  async rentOut(asset) {
    const wizard = await loadWizard('rentOut')
    wizard.open(asset)
  },
  async auction(asset) {
    const wizard = await loadWizard('auction')
    wizard.open(asset)
  },
  async gift(asset) {
    const wizard = await loadWizard('gift')
    wizard.open(asset)
  },
  async bundle(assets) {
    const wizard = await loadWizard('bundle')
    wizard.open(assets)
  },
  async batchSell(assets) {
    const wizard = await loadWizard('batchSell')
    wizard.open(assets)
  },
  async royalty(asset) {
    const wizard = await loadWizard('royalty')
    wizard.open(asset)
  },
  async extend(listing) {
    const wizard = await loadWizard('extend')
    wizard.open(listing)
  },

  // Edit actions
  async editSale(listing) {
    const wizard = await loadWizard('editSale')
    wizard.open(listing)
  },
  async editRental(listing) {
    const wizard = await loadWizard('editRental')
    wizard.open(listing)
  },
  async editAuction(auction) {
    const wizard = await loadWizard('editAuction')
    wizard.open(auction)
  },
  async editBundle(bundle) {
    const wizard = await loadWizard('editBundle')
    wizard.open(bundle)
  },

  // Bundle buy
  async bundleBuy(bundle) {
    const wizard = await loadWizard('bundleBuy')
    wizard.open(bundle)
  },

  // List action selector
  async list(asset) {
    const wizard = await loadWizard('list')
    wizard.open(asset)
  },

  // Admin actions
  async mint() {
    const wizard = await loadWizard('mint')
    wizard.open()
  },
  async collectionSettings() {
    const wizard = await loadWizard('collectionSettings')
    wizard.open()
  },

  // Land minting - direct call to blockchain
  async mintLand({ x, y }) {
    const { showToast } = await import('./services/toast.js')
    const { blockchain } = await import('./services/blockchain.js')

    // Simple confirmation
    const confirmed = confirm(`Mint land parcel at coordinates (${x}, ${y})?`)
    if (!confirmed) return

    try {
      await blockchain.mintLand({ x, y })
    } catch (err) {
      showToast('error', 'Mint Failed', err.message)
    }
  },

  // Other
  async analytics(data) {
    const wizard = await loadWizard('analytics')
    wizard.open(data)
  },
  async settings() {
    const wizard = await loadWizard('settings')
    wizard.open()
  }
}

/**
 * Modal ID to wizard mapping
 */
const modalWizardMap = {
  analyticsModal: 'analytics',
  settingsModal: 'settings'
}

/**
 * Initialize marketplace
 */
export async function init() {
  // Initialize core handlers
  initNavigation()
  initModals()
  initOffers()

  // Expose to global scope for onclick handlers
  window.wizards = wizards
  window.panels = panels
  window.store = store

  // Expose panel open functions
  window.openListingDetailPanel = panels.listingDetail  // For Explore view
  window.openAssetDetailPanel = panels.assetDetail      // For Inventory view
  window.openBundleDetailPanel = panels.bundleDetail

  // Delegated handler for data-action="open-modal" buttons
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action="open-modal"]')
    if (!btn) return

    const modalId = btn.dataset.modal
    const wizardName = modalWizardMap[modalId]
    if (wizardName && wizards[wizardName]) {
      await wizards[wizardName]()
    }
  })
}

// Auto-init when DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
