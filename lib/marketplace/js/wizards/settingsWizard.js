/**
 * Settings Wizard
 * Marketplace settings and preferences
 * @module marketplace/wizards/settingsWizard
 */

import { openModal, closeModal } from '../handlers/modals.js'
import { showToast } from '../services/toast.js'
import { blockchain } from '../services/blockchain.js'

const MODAL_ID = 'settingsModal'
const SETTINGS_ID = 'marketplace-settings'
let initialized = false
let tradingPaused = false
let marketplacePaused = false
let currentNetwork = 'mainnet'
let networkConfirmMode = false
let pendingNetwork = null
let pauseAllConfirmMode = false
let pauseTradingConfirmMode = false
let withdrawConfirmMode = false

/**
 * Default settings
 */
const defaultSettings = {
  notifications: { sales: true, offers: true, auctions: true, rentals: true },
  display: { currency: 'OVG', gridSize: 'medium' },
  privacy: { showActivity: true, showCollection: true }
}

let currentSettings = { ...defaultSettings }

/**
 * Generate modal HTML template
 * @returns {string} HTML string
 */
export function generateHTML() {
  return `
  <div class="mp-modal-overlay" id="${MODAL_ID}" role="dialog" aria-modal="true">
    <div class="mp-modal mp-modal-settings">
      <div class="mp-modal-header">
        <h2 class="mp-modal-title">Settings</h2>
        <button class="mp-modal-close" onclick="closeModal('${MODAL_ID}')">&times;</button>
      </div>
      <div class="mp-modal-body mp-settings-modal-body">
        <div class="mp-settings-tabs">
          <button class="mp-settings-tab active" data-settings-tab="trading">Trading</button>
          <button class="mp-settings-tab" data-settings-tab="network">Network</button>
          <button class="mp-settings-tab" data-settings-tab="admin">Admin</button>
        </div>

        <!-- Trading Tab -->
        <div class="mp-settings-tab-content active" data-settings-content="trading">
          <div class="mp-settings-group">
            <div class="mp-trading-status">
              <div class="mp-trading-status-info">
                <div class="mp-trading-status-badge mp-trading-status-active" id="settingsTradingBadge">ACTIVE</div>
                <span class="mp-trading-status-text" id="settingsTradingText">Trading is enabled</span>
              </div>
              <button class="mp-btn mp-btn-cta-pause mp-btn-sm" id="settingsPauseTradingBtn">Pause Trading</button>
            </div>
            <div class="mp-settings-row">
              <div class="mp-settings-label">
                <span class="mp-settings-label-title">Default Royalty</span>
                <span class="mp-settings-label-desc">Default royalty percentage for new listings</span>
              </div>
              <div class="mp-settings-control">
                <select class="mp-settings-select" id="settingsDefaultRoyalty">
                  <option value="0">0%</option>
                  <option value="2.5">2.5%</option>
                  <option value="5" selected>5%</option>
                  <option value="10">10%</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <!-- Network Tab -->
        <div class="mp-settings-tab-content" data-settings-content="network">
          <div class="mp-settings-group">
            <div class="mp-settings-row">
              <div class="mp-settings-label">
                <span class="mp-settings-label-title">Environment</span>
                <span class="mp-settings-label-desc">Switch between testnet and mainnet</span>
              </div>
              <div class="mp-settings-control">
                <div class="mp-pills mp-pills-network" id="settingsNetworkPills">
                  <button class="mp-pill" data-network="testnet">Testnet</button>
                  <button class="mp-pill mp-pill-active" data-network="mainnet">Mainnet</button>
                </div>
              </div>
            </div>
            <div class="mp-info-box mp-info-warning mp-mt-12 mp-text-sm mp-hidden" id="settingsNetworkWarning">
              Switching networks will disconnect your current session. Click again to confirm.
            </div>
          </div>
        </div>

        <!-- Admin Tab -->
        <div class="mp-settings-tab-content" data-settings-content="admin">
          <div class="mp-settings-group">
            <div class="mp-trading-status">
              <div class="mp-trading-status-info">
                <div class="mp-trading-status-badge mp-trading-status-active" id="settingsMarketplaceBadge">ACTIVE</div>
                <span class="mp-trading-status-text" id="settingsMarketplaceText">Marketplace is running</span>
              </div>
              <button class="mp-btn mp-btn-cta-pause mp-btn-sm" id="settingsPauseAllBtn">Pause All</button>
            </div>
            <div class="mp-fees-box">
              <div class="mp-fees-info">
                <span class="mp-fees-label">Fees Collected</span>
                <span class="mp-fees-value" id="settingsFeesCollected">Loading...</span>
              </div>
              <button class="mp-btn mp-btn-success mp-btn-sm" id="settingsWithdrawAllFeesBtn">Withdraw</button>
            </div>
            <div class="mp-settings-row">
              <div class="mp-settings-label">
                <span class="mp-settings-label-title">Marketplace Fee</span>
                <span class="mp-settings-label-desc">Fee charged on all transactions</span>
              </div>
              <div class="mp-settings-control">
                <select class="mp-settings-select" id="settingsMarketplaceFee">
                  <option value="1">1%</option>
                  <option value="2.5" selected>2.5%</option>
                  <option value="5">5%</option>
                </select>
              </div>
            </div>
            <div class="mp-admin-actions">
              <button class="mp-btn mp-btn-ghost mp-btn-sm" id="settingsClearCacheBtn">Clear Cache</button>
              <button class="mp-btn mp-btn-primary mp-btn-sm" id="settingsCollectionBtn">Collection Settings</button>
            </div>
          </div>
        </div>
      </div>
      <div class="mp-modal-footer mp-modal-footer-duo" id="settingsModalFooter">
        <button class="mp-btn mp-btn-ghost" onclick="closeModal('${MODAL_ID}')">Close</button>
        <button class="mp-btn mp-btn-primary" id="settingsSubmitBtn">Save Changes</button>
      </div>
    </div>
  </div>`
}

/**
 * Ensure modal exists in DOM
 */
function ensureModal() {
  if (!document.getElementById(MODAL_ID)) {
    const container = document.getElementById('modals-container') || document.body
    container.insertAdjacentHTML('beforeend', generateHTML())
  }
  if (!initialized) {
    bindEvents()
    initialized = true
  }
}

/**
 * Bind event listeners
 */
function bindEvents() {
  document.getElementById('settingsSubmitBtn')?.addEventListener('click', submit)
  document.getElementById('settingsClearCacheBtn')?.addEventListener('click', clearCache)
  document.getElementById('settingsPauseTradingBtn')?.addEventListener('click', toggleTrading)
  document.getElementById('settingsPauseAllBtn')?.addEventListener('click', toggleMarketplace)
  document.getElementById('settingsWithdrawAllFeesBtn')?.addEventListener('click', withdrawFees)

  // Network pills - delegated event
  document.getElementById('settingsNetworkPills')?.addEventListener('click', (e) => {
    const pill = e.target.closest('.mp-pill')
    if (pill) handleNetworkPillClick(pill.dataset.network)
  })

  // Admin actions
  document.getElementById('settingsCollectionBtn')?.addEventListener('click', async () => {
    closeModal(MODAL_ID)
    const collectionWizard = await import('./collectionSettingsWizard.js')
    collectionWizard.open()
  })

  // Tab switching
  document.querySelectorAll(`#${MODAL_ID} [data-settings-tab]`).forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.settingsTab))
  })
}

/**
 * Load trading status from GenosDB
 */
async function loadTradingStatus() {
  const db = window.db
  if (!db) return

  const { result } = await db.get(SETTINGS_ID)
  tradingPaused = result?.tradingPaused ?? false
  updateTradingUI()
}

/**
 * Update trading UI based on current state
 */
function updateTradingUI() {
  const badge = document.getElementById('settingsTradingBadge')
  const text = document.getElementById('settingsTradingText')
  const btn = document.getElementById('settingsPauseTradingBtn')

  if (badge) {
    badge.textContent = tradingPaused ? 'PAUSED' : 'ACTIVE'
    badge.classList.toggle('mp-trading-status-active', !tradingPaused)
    badge.classList.toggle('mp-trading-status-paused', tradingPaused)
  }
  if (text) text.textContent = tradingPaused ? 'Trading is paused' : 'Trading is enabled'
  if (btn) {
    btn.textContent = tradingPaused ? 'Resume Trading' : 'Pause Trading'
    btn.classList.remove('mp-btn-warning')
    btn.classList.add('mp-btn-cta-pause')
  }
}

/**
 * Reset pause trading confirm state
 */
function resetPauseTradingConfirmState() {
  pauseTradingConfirmMode = false
  const btn = document.getElementById('settingsPauseTradingBtn')
  if (btn) {
    btn.textContent = tradingPaused ? 'Resume Trading' : 'Pause Trading'
    btn.classList.remove('mp-btn-warning')
    btn.classList.add('mp-btn-cta-pause')
  }
}

/**
 * Toggle trading status (two-step confirmation)
 * Flow: First click → Confirm mode, Second click → Blockchain TX
 */
async function toggleTrading() {
  const btn = document.getElementById('settingsPauseTradingBtn')

  // First click: switch to confirm mode
  if (!pauseTradingConfirmMode) {
    pauseTradingConfirmMode = true
    if (btn) {
      btn.textContent = 'Confirm'
      btn.classList.remove('mp-btn-cta-pause')
      btn.classList.add('mp-btn-warning')
    }
    return
  }

  // Second click: execute
  const newState = !tradingPaused

  try {
    await blockchain.toggleTrading(newState)
    tradingPaused = newState
    resetPauseTradingConfirmState()
    updateTradingUI()
  } catch (error) {
    resetPauseTradingConfirmState()
    // Error toast shown by blockchain.js
  }
}

/**
 * Load marketplace status from GenosDB
 */
async function loadMarketplaceStatus() {
  const db = window.db
  if (!db) return

  const { result } = await db.get(SETTINGS_ID)
  marketplacePaused = result?.marketplacePaused ?? false
  updateMarketplaceUI()
}

/**
 * Update marketplace UI based on current state
 */
function updateMarketplaceUI() {
  const badge = document.getElementById('settingsMarketplaceBadge')
  const text = document.getElementById('settingsMarketplaceText')
  const btn = document.getElementById('settingsPauseAllBtn')

  if (badge) {
    badge.textContent = marketplacePaused ? 'PAUSED' : 'ACTIVE'
    badge.classList.toggle('mp-trading-status-active', !marketplacePaused)
    badge.classList.toggle('mp-trading-status-paused', marketplacePaused)
  }
  if (text) text.textContent = marketplacePaused ? 'Marketplace is paused' : 'Marketplace is running'
  if (btn) {
    btn.textContent = marketplacePaused ? 'Resume All' : 'Pause All'
    btn.classList.remove('mp-btn-warning')
    btn.classList.add('mp-btn-cta-pause')
  }
}

/**
 * Reset pause all confirm state
 */
function resetPauseAllConfirmState() {
  pauseAllConfirmMode = false
  const btn = document.getElementById('settingsPauseAllBtn')
  if (btn) {
    btn.textContent = marketplacePaused ? 'Resume All' : 'Pause All'
    btn.classList.remove('mp-btn-warning')
    btn.classList.add('mp-btn-cta-pause')
  }
}

/**
 * Toggle marketplace status (two-step confirmation)
 * Flow: First click → Confirm mode, Second click → Blockchain TX
 */
async function toggleMarketplace() {
  const btn = document.getElementById('settingsPauseAllBtn')

  // First click: switch to confirm mode
  if (!pauseAllConfirmMode) {
    pauseAllConfirmMode = true
    if (btn) {
      btn.textContent = 'Confirm'
      btn.classList.remove('mp-btn-cta-pause')
      btn.classList.add('mp-btn-warning')
    }
    return
  }

  // Second click: execute
  const newState = !marketplacePaused

  try {
    await blockchain.toggleMarketplace(newState)
    marketplacePaused = newState
    resetPauseAllConfirmState()
    updateMarketplaceUI()
  } catch (error) {
    resetPauseAllConfirmState()
    // Error toast shown by blockchain.js
  }
}

/**
 * Load accumulated fees from contract and update UI
 */
async function loadAccumulatedFees() {
  const el = document.getElementById('settingsFeesCollected')
  const btn = document.getElementById('settingsWithdrawAllFeesBtn')
  if (!el) return

  try {
    const fees = await blockchain.getAccumulatedFees()
    const numFees = parseFloat(fees) || 0
    el.textContent = `${numFees.toLocaleString('en-US', { maximumFractionDigits: 4 })} OVG`
    if (btn) btn.disabled = numFees === 0
  } catch {
    el.textContent = '0 OVG'
    if (btn) btn.disabled = true
  }
}

/**
 * Reset withdraw confirm state
 */
function resetWithdrawConfirmState() {
  withdrawConfirmMode = false
  const btn = document.getElementById('settingsWithdrawAllFeesBtn')
  if (btn) {
    btn.textContent = 'Withdraw'
    btn.classList.remove('mp-btn-warning')
    btn.classList.add('mp-btn-success')
  }
}

/**
 * Withdraw marketplace fees (two-step confirmation)
 * Flow: First click → Confirm mode, Second click → Blockchain TX
 */
async function withdrawFees() {
  const btn = document.getElementById('settingsWithdrawAllFeesBtn')

  // First click: switch to confirm mode
  if (!withdrawConfirmMode) {
    withdrawConfirmMode = true
    if (btn) {
      btn.textContent = 'Confirm'
      btn.classList.remove('mp-btn-success')
      btn.classList.add('mp-btn-warning')
    }
    return
  }

  // Second click: execute
  try {
    await blockchain.withdrawFees()
    resetWithdrawConfirmState()
    await loadAccumulatedFees()
  } catch (error) {
    resetWithdrawConfirmState()
    // Error toast shown by blockchain.js
  }
}

/**
 * Load network status from marketplaceConfig (source of truth)
 */
async function loadNetworkStatus() {
  try {
    const { getActiveNetwork, initNetworkFromStorage } = await import('../../../../lib/config/marketplaceConfig.js')
    // Initialize from localStorage preference
    initNetworkFromStorage()
    const network = getActiveNetwork()
    // Map chainId to network key: 137 = MAINNET, 80002 = TESTNET
    currentNetwork = network.chainId === 137 ? 'mainnet' : 'testnet'
  } catch (e) {
    // Fallback to GenosDB
    const db = window.db
    if (db) {
      const { result } = await db.get(SETTINGS_ID)
      currentNetwork = result?.network?.toLowerCase() ?? 'mainnet'
    }
  }
  updateNetworkUI()
}

/**
 * Update network UI based on current state
 */
function updateNetworkUI() {
  const pills = document.querySelectorAll('#settingsNetworkPills .mp-pill')
  pills.forEach(pill => {
    pill.classList.toggle('mp-pill-active', pill.dataset.network === currentNetwork)
    pill.classList.remove('mp-pill-warning')
  })

  // Hide warning box
  const warning = document.getElementById('settingsNetworkWarning')
  if (warning) warning.classList.add('mp-hidden')
}

/**
 * Reset network confirm state
 */
function resetNetworkConfirmState() {
  networkConfirmMode = false
  pendingNetwork = null
  updateNetworkUI()
}

/**
 * Handle network pill click (two-step confirmation)
 * @param {string} network - 'testnet' or 'mainnet'
 */
async function handleNetworkPillClick(network) {
  // Clicking same network - no action
  if (network === currentNetwork && !networkConfirmMode) return

  const pill = document.querySelector(`#settingsNetworkPills .mp-pill[data-network="${network}"]`)
  const warning = document.getElementById('settingsNetworkWarning')

  // First click: switch to confirm mode
  if (!networkConfirmMode || pendingNetwork !== network) {
    networkConfirmMode = true
    pendingNetwork = network

    // Reset all pills, highlight pending one with warning style
    document.querySelectorAll('#settingsNetworkPills .mp-pill').forEach(p => {
      p.classList.remove('mp-pill-active', 'mp-pill-warning')
    })
    if (pill) pill.classList.add('mp-pill-warning')

    // Show warning
    if (warning) warning.classList.remove('mp-hidden')
    return
  }

  // Second click on same pending network: execute
  try {
    // Close modal immediately, sync happens in background with overlay
    closeModal(MODAL_ID)
    currentNetwork = network
    resetNetworkConfirmState()
    await blockchain.switchNetwork(network)
  } catch (error) {
    resetNetworkConfirmState()
    // Error toast shown by blockchain.js
  }
}

/**
 * Clear all cache (GenosDB, IndexedDB, localStorage, MarketplaceCache) without page refresh
 */
async function clearCache() {
  try {
    // Clear in-memory MarketplaceCache first
    try {
      const { MarketplaceCache } = await import('../../../../lib/blockchain/MarketplaceCache.js')
      MarketplaceCache.clear()
      console.log('[Settings] MarketplaceCache cleared')
    } catch (e) {
      console.warn('[Settings] MarketplaceCache not available:', e.message)
    }

    // Clear GenosDB (primary data store)
    if (window.db?.clear) {
      console.log('[Settings] Clearing GenosDB...')
      await window.db.clear()
      console.log('[Settings] GenosDB cleared')
    } else {
      console.warn('[Settings] db.clear() not available')
    }

    // Clear all IndexedDB databases
    const databases = await indexedDB.databases?.() ?? []
    await Promise.all(
      databases.map(({ name }) =>
        new Promise((resolve, reject) => {
          const request = indexedDB.deleteDatabase(name)
          request.onsuccess = resolve
          request.onerror = reject
        })
      )
    )
    console.log('[Settings] IndexedDB cleared')

    // Clear localStorage
    localStorage.clear()
    console.log('[Settings] localStorage cleared')

    showToast('success', 'Cache Cleared', 'All local data has been removed')
  } catch (error) {
    console.error('[Settings] Clear cache error:', error)
    showToast('error', 'Error', 'Failed to clear cache: ' + error.message)
  }
}

/**
 * Switch settings tab
 * @param {string} tab - Tab name
 */
export function switchTab(tab) {
  document.querySelectorAll(`#${MODAL_ID} [data-settings-tab]`).forEach(t => {
    t.classList.toggle('active', t.dataset.settingsTab === tab)
  })
  document.querySelectorAll(`#${MODAL_ID} [data-settings-content]`).forEach(p => {
    p.classList.toggle('active', p.dataset.settingsContent === tab)
  })
}

/**
 * Open settings wizard
 */
export async function open() {
  ensureModal()
  loadSettings()
  populateForm()
  // Reset confirm states
  resetPauseTradingConfirmState()
  resetPauseAllConfirmState()
  resetWithdrawConfirmState()
  resetNetworkConfirmState()
  await Promise.all([loadTradingStatus(), loadMarketplaceStatus(), loadNetworkStatus(), loadAccumulatedFees()])
  openModal(MODAL_ID)
}

/**
 * Close settings wizard
 */
export function close() {
  closeModal(MODAL_ID)
}

/**
 * Load settings from storage
 */
function loadSettings() {
  try {
    const stored = localStorage.getItem('mp-settings')
    if (stored) {
      currentSettings = { ...defaultSettings, ...JSON.parse(stored) }
    }
  } catch (e) {
    // Use default settings on error
  }
}

/**
 * Save settings to storage
 */
function saveSettings() {
  try {
    localStorage.setItem('mp-settings', JSON.stringify(currentSettings))
  } catch (e) {
    // Silently fail on save error
  }
}

/**
 * Populate form with current settings
 */
function populateForm() {
  // Placeholder for future form fields
}

/**
 * Collect form values
 */
function collectFormValues() {
  currentSettings = {
    notifications: {
      sales: document.getElementById('settingsNotifSales')?.checked ?? true,
      offers: document.getElementById('settingsNotifOffers')?.checked ?? true,
      auctions: document.getElementById('settingsNotifAuctions')?.checked ?? true,
      rentals: document.getElementById('settingsNotifRentals')?.checked ?? true
    },
    display: {
      currency: document.getElementById('settingsCurrency')?.value || 'OVG',
      gridSize: document.getElementById('settingsGridSize')?.value || 'medium'
    },
    privacy: {
      showActivity: document.getElementById('settingsShowActivity')?.checked ?? true,
      showCollection: document.getElementById('settingsShowCollection')?.checked ?? true
    }
  }
}

/**
 * Submit settings
 */
export function submit() {
  collectFormValues()
  saveSettings()
  showToast('success', 'Settings Saved', 'Your preferences have been updated')
  close()
}

/**
 * Reset to defaults
 */
export function reset() {
  currentSettings = { ...defaultSettings }
  populateForm()
  showToast('info', 'Settings Reset', 'Reverted to default settings')
}

export function init() {
  // Delegated tab switching — works regardless of when modal is created
  document.addEventListener('click', (e) => {
    const tab = e.target.closest(`#${MODAL_ID} [data-settings-tab]`)
    if (tab) switchTab(tab.dataset.settingsTab)
  })
  window.settingsWizard = { open, close, submit, reset, switchTab, generateHTML }
}

init()

export default { open, close, submit, reset, switchTab, generateHTML, init }
