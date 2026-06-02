
    // Close all modals on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeAllModals()
    })

    // Initialize view toggle buttons once app-core.js is loaded
    const initViewToggleSync = () => {
      if (typeof window.getExploreViewMode === 'function') {
        // Sync buttons with saved mode for initial view (explore)
        const mode = window.getExploreViewMode()
        document.querySelectorAll('.mp-view-btn').forEach(btn => {
          const btnMode = btn.dataset.viewMode || 'grid'
          btn.classList.toggle('active', btnMode === mode)
        })
      } else {
        // Retry after a short delay if app-core.js is not yet loaded
        setTimeout(initViewToggleSync, 100)
      }
    }
    // Also sync on page load after DOM is ready
    window.addEventListener('load', () => {
      const currentView = typeof window.getCurrentView === 'function' ? window.getCurrentView() : 'explore'
      if (typeof window.syncViewToggleButtons === 'function') {
        window.syncViewToggleButtons(currentView)
      }
      // Initialize sidebar filters for current view
      if (typeof window.updateSidebarForView === 'function') {
        window.updateSidebarForView(currentView)
      }
    })
    initViewToggleSync()

    // Sidebar filter section toggle (expand/collapse)
    document.querySelectorAll('.mp-filter-header').forEach(header => {
      header.addEventListener('click', () => {
        const section = header.closest('.mp-filter-section')
        if (section) section.classList.toggle('collapsed')
      })
    })

    // ========== MODAL MANAGER WITH ACCESSIBILITY ==========
    let previousFocusElement = null
    let activeFocusTrap = null

    /**
     * Trap focus within a modal for accessibility
     * @param {HTMLElement} modal - The modal element
     */
    function trapFocus(modal) {
      const focusableSelectors = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      const focusableElements = modal.querySelectorAll(focusableSelectors)
      const firstFocusable = focusableElements[0]
      const lastFocusable = focusableElements[focusableElements.length - 1]

      const handleKeydown = (e) => {
        if (e.key !== 'Tab') return

        if (e.shiftKey && document.activeElement === firstFocusable) {
          e.preventDefault()
          lastFocusable?.focus()
        } else if (!e.shiftKey && document.activeElement === lastFocusable) {
          e.preventDefault()
          firstFocusable?.focus()
        }
      }

      modal.addEventListener('keydown', handleKeydown)
      activeFocusTrap = { modal, handler: handleKeydown }
      firstFocusable?.focus()
    }

    /**
     * Remove focus trap from modal
     */
    function removeFocusTrap() {
      if (activeFocusTrap) {
        activeFocusTrap.modal.removeEventListener('keydown', activeFocusTrap.handler)
        activeFocusTrap = null
      }
    }

    /**
     * Opens a modal with focus management
     * @param {string} id - Modal ID
     */
    function openModal(id) {
      previousFocusElement = document.activeElement
      const modal = document.getElementById(id)
      modal?.classList.add('open')
      if (modal) trapFocus(modal)
    }

    /**
     * Closes a modal and restores focus
     * @param {string} id - Modal ID
     */
    function closeModal(id) {
      const modal = document.getElementById(id)
      modal?.classList.remove('open')
      removeFocusTrap()
      previousFocusElement?.focus()
    }

    /**
     * Closes all open modals
     */
    function closeAllModals() {
      document.querySelectorAll('.mp-modal-overlay').forEach(m => m.classList.remove('open'))
      removeFocusTrap()
      closeDetailPanel()
      previousFocusElement?.focus()
    }

    // ========== LIST MODAL FUNCTIONS ==========
    /**
     * Opens the list modal (action selector) for inventory items
     * @param {object} data - Item data (id, title, collection, image)
     */
    async function openListModal(data = {}) {
      const wizard = await import('./wizards/listWizard.js')
      wizard.open(data)
    }
    window.openListModal = openListModal

    // ========== BID MODAL FUNCTIONS ==========
    /**
     * Opens the bid modal in auction or offer mode
     * @param {string} type - 'auction' or 'offer'
     * @param {object} data - Item data
     */
    async function openBidModal(type = 'auction', data = {}) {
      const wizard = await import('./wizards/bidWizard.js')
      wizard.open({ ...data, mode: type })
    }

    /**
     * Opens the buy modal (lazy loaded)
     * @param {object} data - Item data
     */
    async function openBuyModal(data = {}) {
      const wizard = await import('./wizards/buyWizard.js')
      wizard.open(data)
    }

    /**
     * Opens the rent modal (lazy loaded)
     * @param {object} data - Item data
     */
    async function openRentModal(data = {}) {
      const wizard = await import('./wizards/rentWizard.js')
      wizard.open(data)
    }

    /**
     * Opens the extend modal (lazy loaded)
     * @param {object} data - Rental data
     */
    async function openExtendModal(data = {}) {
      const wizard = await import('./wizards/extendWizard.js')
      wizard.open(data)
    }

    // Expose modal functions
    window.openBidModal = openBidModal
    window.openBuyModal = openBuyModal
    window.openRentModal = openRentModal
    window.openExtendModal = openExtendModal

    // ========== TOKEN SELECTOR ==========
    const selectedTokens = {
      sell: 'OVG',
      rent: 'OVG',
      auction: 'OVG',
      'bid-auction': 'OVG',
      'bid-offer': 'OVG',
      'batch-sell': 'OVG',
      'batch-buy': 'OVG'
    }

    /**
     * Handles token selection in modals
     * @param {HTMLElement} btn - The clicked token button
     * @param {string} modalId - Modal identifier
     */
    function selectToken(btn, modalId) {
      const selector = btn.closest('.mp-token-selector')
      selector.querySelectorAll('.mp-token-option').forEach(opt => opt.classList.remove('active'))
      btn.classList.add('active')

      const token = btn.dataset.token
      selectedTokens[modalId] = token

      // Update addon text in related inputs
      const addonMappings = {
        'sell': 'sellPriceAddon',
        'bid-auction': 'bidAuctionAmount',
        'bid-offer': 'bidOfferAmount'
      }

      // Update input addon if exists
      if (modalId === 'sell') {
        const addon = document.getElementById('sellPriceAddon')
        if (addon) addon.textContent = token
      }
    }

    // Expose token selector
    window.selectToken = selectToken
    window.selectedTokens = selectedTokens

    // ========== ACTIVITY MODE ==========
    let currentActivityMode = 'global'

    /**
     * Switches between Global and Personal activity modes
     * @param {string} mode - 'global' or 'personal'
     */
    function switchActivityMode(mode) {
      currentActivityMode = mode

      // Update toggle buttons
      document.querySelectorAll('.mp-mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode)
      })

      // Update info box
      const infoBox = document.getElementById('activityModeInfo')
      if (infoBox) {
        if (mode === 'global') {
          infoBox.className = 'mp-activity-mode-info'
          infoBox.innerHTML = '<span class="mp-mode-info-icon">&#127760;</span><span class="mp-mode-info-text">Showing all marketplace activity</span>'
        } else {
          infoBox.className = 'mp-activity-mode-info personal'
          infoBox.innerHTML = '<span class="mp-mode-info-icon">&#128100;</span><span class="mp-mode-info-text">Showing your transactions only</span>'
        }
      }

      // Reload activity data with new mode (in analytics modal)
      if (typeof window.loadAnalyticsActivity === 'function') {
        window.loadAnalyticsActivity()
      }
    }

    // Expose activity mode function
    window.switchActivityMode = switchActivityMode
    window.currentActivityMode = currentActivityMode

    // ========== BLOCKCHAIN SYNC ==========
    let isSyncing = false

    /**
     * Sync local data from blockchain
     * Overwrites local GenosDB data with on-chain state
     */
    async function syncFromBlockchain() {
      if (isSyncing) return

      isSyncing = true

      try {
        // Call the real blockchain sync function
        await window.forceFullSync?.()
      } catch (e) {
        console.error('[Sync] Failed:', e.message)
        showToast('error', 'Sync Failed', e.message)
      } finally {
        isSyncing = false
      }
    }
    window.syncFromBlockchain = syncFromBlockchain

    // ========== MARKETPLACE PAUSED BANNER ==========
    let isMarketplacePaused = false

    /**
     * Shows the marketplace paused banner
     */
    function showPausedBanner() {
      isMarketplacePaused = true
      const banner = document.getElementById('pausedBanner')
      const app = document.querySelector('.marketplace-app')
      if (banner) banner.style.display = 'block'
      if (app) app.classList.add('paused')

      // Disable trading buttons
      document.querySelectorAll('.mp-action-buy, .mp-action-bid, .mp-action-rent, .mp-card-btn').forEach(btn => {
        btn.disabled = true
        btn.style.opacity = '0.5'
        btn.style.cursor = 'not-allowed'
      })
    }

    /**
     * Hides the marketplace paused banner
     */
    function hidePausedBanner() {
      isMarketplacePaused = false
      const banner = document.getElementById('pausedBanner')
      const app = document.querySelector('.marketplace-app')
      if (banner) banner.style.display = 'none'
      if (app) app.classList.remove('paused')

      // Re-enable trading buttons
      document.querySelectorAll('.mp-action-buy, .mp-action-bid, .mp-action-rent, .mp-card-btn').forEach(btn => {
        btn.disabled = false
        btn.style.opacity = ''
        btn.style.cursor = ''
      })
    }

    /**
     * Dismisses the banner temporarily (user clicked X)
     */
    function dismissPausedBanner() {
      const banner = document.getElementById('pausedBanner')
      const app = document.querySelector('.marketplace-app')
      if (banner) banner.style.display = 'none'
      if (app) app.classList.remove('paused')
    }

    // Expose banner functions
    window.showPausedBanner = showPausedBanner
    window.hidePausedBanner = hidePausedBanner
    window.dismissPausedBanner = dismissPausedBanner
    window.isMarketplacePaused = isMarketplacePaused

    /**
     * Open QuickSwap DEX to swap tokens to OVG
     * @param {string} fromToken - Optional source token symbol
     */
    function openQuickSwap(fromToken = '') {
      const OVG_ADDRESS = '0x0fB62F6ea4A58A610b3cF19DB401778B4126d28E'
      const url = `https://quickswap.exchange/#/swap?outputCurrency=${OVG_ADDRESS}`
      window.open(url, '_blank', 'noopener,noreferrer')
    }
    window.openQuickSwap = openQuickSwap

    // Detail Panels - Separate panels for Explore (listing) and Inventory (asset)
    async function openListingDetailPanel(itemId, itemData) {
      const panel = await import('./components/listingDetailPanel.js')
      panel.open({ id: itemId, ...itemData, tokenId: String(itemData?.tokenId ?? itemData?.assetId ?? itemId).replace(/^asset_/, '') })
    }

    async function openAssetDetailPanel(itemId, itemData) {
      const panel = await import('./components/assetDetailPanel.js')
      // If itemData is already a complete object, use it directly
      // Otherwise merge with itemId
      const asset = itemData && typeof itemData === 'object'
        ? { ...itemData, id: itemData.id || itemId, tokenId: String(itemData.tokenId ?? itemData.assetId ?? (itemData.id || itemId)).replace(/^asset_/, '') }
        : { id: itemId, tokenId: String(itemId).replace(/^asset_/, '') }
      panel.open(asset)
    }

    async function closeAllDetailPanels() {
      const [listingPanel, assetPanel] = await Promise.all([
        import('./components/listingDetailPanel.js'),
        import('./components/assetDetailPanel.js')
      ])
      listingPanel.close()
      assetPanel.close()
    }

    // Tabs
    function switchTab(btn, tabId) {
      btn.parentElement.querySelectorAll('.mp-tab').forEach(t => t.classList.remove('active'))
      btn.classList.add('active')
      btn.closest('.mp-detail-content, .mp-modal-body').querySelectorAll('.mp-tab-content').forEach(c => c.classList.remove('active'))
      document.getElementById('tab-' + tabId)?.classList.add('active')
    }

    // Expose functions to global scope for onclick handlers
    window.openModal = openModal
    window.closeModal = closeModal
    window.closeAllModals = closeAllModals
    window.openListingDetailPanel = openListingDetailPanel
    window.openAssetDetailPanel = openAssetDetailPanel
    window.closeDetailPanel = closeAllDetailPanels
    window.switchTab = switchTab

    /**
     * Open edit modal for listed items
     * @param {string} listingType - 'sale' or 'rent'
     * @param {object} itemData - Item data {id, title, collection, image, price}
     */
    async function openEditModal(listingType, itemData) {
      const wizardMap = {
        sale: 'editSaleWizard',
        rent: 'editRentalWizard',
        auction: 'editAuctionWizard',
        bundle: 'editBundleWizard'
      }
      const wizardName = wizardMap[listingType]
      if (wizardName) {
        const wizard = await import(`./wizards/${wizardName}.js`)
        wizard.open(itemData)
      }
    }
    window.openEditModal = openEditModal

    /**
     * Open edit modal from card/row - uses data-item-id (hash from db.map)
     * Fetches fresh data from GenosDB to ensure description and other fields are current
     */
    async function openEditFromCard(btn, type) {
      const el = btn.closest('.mp-card') || btn.closest('.mp-table-row')
      if (!el) return
      const d = el.dataset
      const itemId = d.itemId

      // Fetch fresh data from GenosDB
      let itemData = {
        id: itemId,
        title: d.title,
        collection: d.collection,
        image: d.image,
        price: d.price,
        bundleItems: d.bundleItems ? JSON.parse(d.bundleItems) : []
      }

      if (window.db && itemId) {
        try {
          const { result } = await window.db.get(itemId)
          if (result?.value) {
            itemData = { ...itemData, ...result.value, id: itemId }
          }
        } catch (e) {
          console.warn('Could not fetch item data from DB:', e)
        }
      }

      openEditModal(type || d.status, itemData)
    }
    window.openEditFromCard = openEditFromCard

    /**
     * Open list modal from card/row
     */
    function openListFromCard(btn) {
      const el = btn.closest('.mp-card') || btn.closest('.mp-table-row')
      if (!el) return
      const d = el.dataset
      openListModal({ id: d.itemId, title: d.title, collection: d.collection, image: d.image })
    }
    window.openListFromCard = openListFromCard

    /**
     * Open extend modal from card/row
     */
    function openExtendFromCard(btn) {
      const el = btn.closest('.mp-card') || btn.closest('.mp-table-row')
      if (!el) return
      const d = el.dataset
      window.openExtendModal?.({ id: d.itemId, title: d.title, collection: d.collection, image: d.image })
    }
    window.openExtendFromCard = openExtendFromCard

    // ========== INVENTORY SELECT MODE ==========
    let inventorySelectMode = false
    const selectedInventoryItems = new Map()

    /**
     * Toggle item selection in inventory
     * @param {HTMLElement} card - Card element
     */
    function toggleInventorySelection(card) {
      if (!inventorySelectMode) return
      const itemId = card.dataset.itemId
      if (selectedInventoryItems.has(itemId)) {
        selectedInventoryItems.delete(itemId)
        card.classList.remove('batch-selected')
      } else {
        // For virtual items (expanded units), store realAssetId and unitIndex
        const isVirtualItem = itemId?.includes(':unit:')
        selectedInventoryItems.set(itemId, {
          id: itemId,
          realAssetId: card.dataset.realAssetId || itemId,
          title: card.dataset.title,
          collection: card.dataset.collection,
          image: card.dataset.image,
          unitIndex: card.dataset.unitIndex || null,
          isVirtual: isVirtualItem
        })
        card.classList.add('batch-selected')
      }
      updateInventorySelectUI()
    }

    /**
     * Update UI elements based on selection count
     */
    function updateInventorySelectUI() {
      const count = selectedInventoryItems.size
      const hasSelection = count >= 2

      // Update counter
      const countEl = document.getElementById('inventorySelectedCount')
      if (countEl) countEl.textContent = count

      // Get UI elements
      const selectionIndicator = document.getElementById('selectionIndicator')
      const batchSellBtn = document.getElementById('batchSellBtn')
      const createBundleBtn = document.getElementById('createBundleBtn')
      const cancelBtn = document.getElementById('cancelSelectBtn')
      const selectToggleBtn = document.getElementById('inventorySelectToggleBtn')

      // Show/hide based on select mode
      if (selectToggleBtn) selectToggleBtn.style.display = inventorySelectMode ? 'none' : 'flex'
      if (selectionIndicator) selectionIndicator.style.display = inventorySelectMode ? 'flex' : 'none'
      if (batchSellBtn) batchSellBtn.style.display = hasSelection ? 'flex' : 'none'
      if (createBundleBtn) createBundleBtn.style.display = hasSelection ? 'flex' : 'none'
      if (cancelBtn) cancelBtn.style.display = inventorySelectMode ? 'flex' : 'none'
    }

    /**
     * Enable inventory select mode
     * Uses the filter system to show only 'unlisted' items (can be listed/bundled)
     */
    function enableInventorySelectMode() {
      inventorySelectMode = true
      window.inventorySelectMode = true
      // Apply filter to show only unlisted items (this reloads the data)
      if (typeof window.applyInventorySelectFilter === 'function') {
        window.applyInventorySelectFilter()
      }
      updateInventorySelectUI()
    }

    /**
     * Disable inventory select mode
     */
    function disableInventorySelectMode() {
      inventorySelectMode = false
      window.inventorySelectMode = false
      selectedInventoryItems.clear()
      // Restore previous filter state (this reloads the data)
      if (typeof window.removeInventorySelectFilter === 'function') {
        window.removeInventorySelectFilter()
      }
      updateInventorySelectUI()
    }

    /**
     * Open Batch Sell Modal with selected items
     */
    async function openBatchSellModal() {
      if (selectedInventoryItems.size < 2) return
      const wizard = await import('./wizards/batchSellWizard.js')
      wizard.open(Array.from(selectedInventoryItems.values()))
    }

    /**
     * Open Bundle Modal with selected items
     */
    async function openBundleModal() {
      if (selectedInventoryItems.size < 2) return
      const wizard = await import('./wizards/bundleWizard.js')
      wizard.open(Array.from(selectedInventoryItems.values()))
    }

    /**
     * Remove item from batch sell modal
     */
    function removeBatchItem(itemId) {
      selectedInventoryItems.delete(itemId)
      document.querySelector(`.mp-batch-item[data-batch-id="${itemId}"]`)?.remove()
      document.querySelector(`.mp-card-inventory[data-item-id="${itemId}"]`)?.classList.remove('batch-selected')

      const count = selectedInventoryItems.size
      const modalCount = document.getElementById('batchModalCount')
      const summaryItems = document.getElementById('batchSummaryItems')
      if (modalCount) modalCount.textContent = count
      if (summaryItems) summaryItems.textContent = count

      updateInventorySelectUI()
      updateBatchTotal()

      if (count < 2) closeModal('batchSellModal')
    }

    /**
     * Calculate and update batch total
     */
    function updateBatchTotal() {
      const inputs = document.querySelectorAll('.mp-batch-item-price input')
      let total = 0
      inputs.forEach(input => { total += parseFloat(input.value) || 0 })
      const totalEl = document.getElementById('batchSummaryTotal')
      if (totalEl) totalEl.textContent = `${total.toFixed(2)} OVG`
    }

    /**
     * Update bundle summary based on price input
     */
    function updateBundleSummary() {
      const priceInput = document.getElementById('bundlePriceInput')
      const summaryPrice = document.getElementById('bundleSummaryPrice')
      const price = parseFloat(priceInput?.value) || 0
      if (summaryPrice) summaryPrice.textContent = `${price.toFixed(2)} OVG`
    }

    /**
     * Confirm and create bundle via blockchain
     */
    async function confirmCreateBundle() {
      const nameInput = document.getElementById('bundleNameInput')
      const priceInput = document.getElementById('bundlePriceInput')
      const price = parseFloat(priceInput?.value) || 0

      if (price <= 0) {
        showToast('warning', 'Invalid Price', 'Please enter a valid price for the bundle.')
        return
      }

      const bundleName = nameInput?.value?.trim() || `Bundle (${selectedInventoryItems.size} items)`
      closeModal('bundleModal')

      try {
        await window.blockchain?.createBundle(Array.from(selectedInventoryItems.keys()), bundleName, price)
      } catch (error) {
        // Error toast shown by blockchain.js
      }
    }

    // Event listeners for subheader buttons
    document.getElementById('inventorySelectToggleBtn')?.addEventListener('click', enableInventorySelectMode)
    document.getElementById('batchSellBtn')?.addEventListener('click', openBatchSellModal)
    document.getElementById('createBundleBtn')?.addEventListener('click', openBundleModal)
    document.getElementById('cancelSelectBtn')?.addEventListener('click', disableInventorySelectMode)
    document.getElementById('mintFab')?.addEventListener('click', async () => {
      if (!window.mintWizard) await import('../../../lib/marketplace/js/wizards/mintWizard.js')
      window.mintWizard?.open?.()
    })

    // Bundle price input listener
    document.getElementById('bundlePriceInput')?.addEventListener('input', updateBundleSummary)

    // Token selector in modals
    document.querySelectorAll('.mp-token-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const parent = btn.closest('.mp-token-selector, .mp-token-options')
        parent?.querySelectorAll('.mp-token-btn').forEach(b => b.classList.remove('active'))
        btn.classList.add('active')
      })
    })

    // Expose functions
    window.inventorySelectMode = inventorySelectMode
    window.selectedInventoryItems = selectedInventoryItems
    window.toggleBatchSelection = toggleInventorySelection
    window.toggleInventorySelection = toggleInventorySelection
    window.enableInventorySelectMode = enableInventorySelectMode
    window.disableInventorySelectMode = disableInventorySelectMode
    window.openBatchSellModal = openBatchSellModal
    window.openBundleModal = openBundleModal
    window.removeBatchItem = removeBatchItem
    window.updateBatchTotal = updateBatchTotal
    window.updateBundleSummary = updateBundleSummary
    window.confirmCreateBundle = confirmCreateBundle

    // ========== BATCH BUY MODE (Explore) ==========
    let batchBuyMode = false
    const selectedBatchBuyItems = new Map()

    /**
     * Toggle batch buy selection for a card or table row
     * @param {HTMLElement} element - Card or row element
     */
    function toggleBatchBuySelection(element) {
      if (!batchBuyMode) return
      const itemId = element.dataset.itemId
      if (selectedBatchBuyItems.has(itemId)) {
        selectedBatchBuyItems.delete(itemId)
        element.classList.remove('batch-selected')
      } else {
        selectedBatchBuyItems.set(itemId, {
          id: itemId,
          title: element.dataset.title,
          collection: element.dataset.collection,
          image: element.dataset.image,
          price: element.dataset.price,
          priceNum: parseFloat(element.dataset.priceNum) || 0
        })
        element.classList.add('batch-selected')
      }
      updateBatchBuyUI()
    }

    /**
     * Update batch buy UI elements (counter, buttons visibility)
     */
    function updateBatchBuyUI() {
      const count = selectedBatchBuyItems.size
      const hasSelection = count >= 2
      const countEl = document.getElementById('exploreSelectedCount')
      if (countEl) countEl.textContent = count

      const selectionIndicator = document.getElementById('exploreSelectionIndicator')
      const buyBtn = document.getElementById('batchBuyBtn')
      const cancelBtn = document.getElementById('cancelExploreBuyBtn')
      const selectToggleBtn = document.getElementById('exploreSelectToggleBtn')

      // Show/hide based on select mode
      if (selectToggleBtn) selectToggleBtn.style.display = batchBuyMode ? 'none' : 'flex'
      if (selectionIndicator) selectionIndicator.style.display = batchBuyMode ? 'flex' : 'none'
      if (buyBtn) buyBtn.style.display = hasSelection ? 'flex' : 'none'
      if (cancelBtn) cancelBtn.style.display = batchBuyMode ? 'flex' : 'none'
    }

    /**
     * Enable batch buy select mode
     * Uses the filter system to show only 'sale' type items
     */
    function enableBatchBuyMode() {
      batchBuyMode = true
      window.batchBuyMode = true
      // Apply filter to show only 'sale' items (this reloads the data)
      if (typeof window.applyBatchBuyFilter === 'function') {
        window.applyBatchBuyFilter()
      }
      updateBatchBuyUI()
    }

    /**
     * Disable batch buy select mode
     */
    function disableBatchBuyMode() {
      batchBuyMode = false
      window.batchBuyMode = false
      selectedBatchBuyItems.clear()
      // Restore previous filter state (this reloads the data)
      if (typeof window.removeBatchBuyFilter === 'function') {
        window.removeBatchBuyFilter()
      }
      updateBatchBuyUI()
    }

    function toggleBatchBuyMode() {
      if (batchBuyMode) {
        disableBatchBuyMode()
      } else {
        enableBatchBuyMode()
      }
    }

    async function openBatchBuyModal() {
      if (selectedBatchBuyItems.size === 0) return
      const wizard = await import('./wizards/batchBuyWizard.js')
      wizard.open(Array.from(selectedBatchBuyItems.values()))
    }

    function removeBatchBuyItem(itemId) {
      selectedBatchBuyItems.delete(itemId)
      const itemEl = document.querySelector(`.mp-batch-item[data-batch-buy-id="${itemId}"]`)
      if (itemEl) itemEl.remove()
      // Remove selection from card or table row
      const cardEl = document.querySelector(`.mp-card[data-item-id="${itemId}"]`)
      if (cardEl) cardEl.classList.remove('batch-selected')
      const rowEl = document.querySelector(`.mp-table-row[data-item-id="${itemId}"]`)
      if (rowEl) rowEl.classList.remove('batch-selected')

      const modalCount = document.getElementById('batchBuyModalCount')
      const summaryItems = document.getElementById('batchBuySummaryItems')
      if (modalCount) modalCount.textContent = selectedBatchBuyItems.size
      if (summaryItems) summaryItems.textContent = selectedBatchBuyItems.size

      updateBatchBuyUI()
      updateBatchBuyTotal()

      if (selectedBatchBuyItems.size === 0) {
        closeModal('batchBuyModal')
      }
    }

    function updateBatchBuyTotal() {
      let subtotal = 0
      selectedBatchBuyItems.forEach(item => {
        subtotal += item.priceNum || 0
      })

      // Apply volume discount: 2% off if total > 5 OVG, 5% if > 20 OVG
      let discountPercent = 0
      if (subtotal > 20) {
        discountPercent = 5
      } else if (subtotal > 5) {
        discountPercent = 2
      }

      const discount = subtotal * (discountPercent / 100)
      const total = subtotal - discount

      const totalEl = document.getElementById('batchBuySummaryTotal')
      const discountEl = document.getElementById('batchBuyDiscount')

      if (totalEl) totalEl.textContent = `${total.toFixed(2)} OVG`

      // Show/update discount element
      if (discountEl) {
        if (discountPercent > 0) {
          discountEl.textContent = `-${discount.toFixed(2)} OVG (${discountPercent}%)`
          discountEl.parentElement.style.display = 'flex'
        } else {
          discountEl.parentElement.style.display = 'none'
        }
      }
    }

    // Batch Buy Button
    const batchBuyBtn = document.getElementById('batchBuyBtn')
    if (batchBuyBtn) {
      batchBuyBtn.addEventListener('click', openBatchBuyModal)
    }

    // Token selector in batch buy modal
    document.querySelectorAll('.mp-batch-buy-tokens .mp-token-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.mp-batch-buy-tokens .mp-token-btn').forEach(b => b.classList.remove('active'))
        btn.classList.add('active')
      })
    })

    // Explore Select Toggle Button
    const exploreSelectToggleBtn = document.getElementById('exploreSelectToggleBtn')
    if (exploreSelectToggleBtn) {
      exploreSelectToggleBtn.addEventListener('click', enableBatchBuyMode)
    }

    // Explore Cancel Select Button
    const cancelExploreBuyBtn = document.getElementById('cancelExploreBuyBtn')
    if (cancelExploreBuyBtn) {
      cancelExploreBuyBtn.addEventListener('click', disableBatchBuyMode)
    }

    // Expose batch buy functions and state
    window.batchBuyMode = batchBuyMode
    window.selectedBatchBuyItems = selectedBatchBuyItems
    window.toggleBatchBuySelection = toggleBatchBuySelection
    window.removeBatchBuyItem = removeBatchBuyItem
    window.updateBatchBuyTotal = updateBatchBuyTotal
    window.enableBatchBuyMode = enableBatchBuyMode
    window.disableBatchBuyMode = disableBatchBuyMode
    window.toggleBatchBuyMode = toggleBatchBuyMode
    window.openBatchBuyModal = openBatchBuyModal

    /**
     * Open bundle buy modal for purchasing bundles in Explore
     * @param {Object} bundleData - Bundle data with items array
     */
    async function openBundleBuyModal(bundleData) {
      if (!bundleData || !bundleData.items) return
      const wizard = await import('./wizards/bundleBuyWizard.js')
      wizard.open(bundleData)
    }
    window.openBundleBuyModal = openBundleBuyModal

    // --- Bundle Detail Panel Functions ---
    async function openBundleDetailPanel(bundleData) {
      const panel = await import('./components/bundleDetailPanel.js')
      panel.open(bundleData)
    }
    window.openBundleDetailPanel = openBundleDetailPanel

    async function closeBundleDetailPanel() {
      const panel = await import('./components/bundleDetailPanel.js')
      panel.close()
    }
    window.closeBundleDetailPanel = closeBundleDetailPanel

    async function toggleBundleFavorite() {
      const panel = await import('./components/bundleDetailPanel.js')
      panel.toggleFavorite()
    }
    window.toggleBundleFavorite = toggleBundleFavorite

    // Settings Modal Tabs — handled by settingsWizard.js bindEvents()

    // Analytics Modal Tabs
    function switchAnalyticsTab(tabName) {
      document.querySelectorAll('[data-analytics-tab]').forEach(t => t.classList.remove('active'))
      document.querySelectorAll('[data-analytics-content]').forEach(c => c.classList.remove('active'))
      document.querySelector(`[data-analytics-tab="${tabName}"]`)?.classList.add('active')
      document.querySelector(`[data-analytics-content="${tabName}"]`)?.classList.add('active')

      // Load data when switching to activity tab
      if (tabName === 'activity' && typeof window.loadAnalyticsActivity === 'function') {
        window.loadAnalyticsActivity()
      }
    }
    window.switchAnalyticsTab = switchAnalyticsTab

    // Settings Modal Toggles
    document.querySelectorAll('[data-modal-setting]').forEach(toggle => {
      toggle.addEventListener('click', () => toggle.classList.toggle('active'))
    })

    // Settings Modal Network Toggle
    document.getElementById('modalBtnTestnet')?.addEventListener('click', function() {
      this.classList.add('mp-network-btn-active')
      document.getElementById('modalBtnMainnet')?.classList.remove('mp-network-btn-active')
    })
    document.getElementById('modalBtnMainnet')?.addEventListener('click', function() {
      this.classList.add('mp-network-btn-active')
      document.getElementById('modalBtnTestnet')?.classList.remove('mp-network-btn-active')
    })

    // Royalty preset buttons
    function setRoyaltyPreset(value) {
      const input = document.getElementById('royaltyPercentInput')
      if (input) input.value = value

      document.querySelectorAll('.mp-royalty-preset').forEach(btn => {
        btn.classList.toggle('active', parseFloat(btn.textContent) === value)
      })
    }
    window.setRoyaltyPreset = setRoyaltyPreset

    // Offer Modal functions
    function updateOfferSummary() {
      const amount = parseFloat(document.getElementById('offerAmount')?.value) || 0
      const listedPrice = parseFloat(document.getElementById('offerListedPrice')?.textContent) || 3.5

      document.getElementById('offerSummaryAmount').textContent = `${amount.toFixed(2)} OVG`

      const savings = listedPrice - amount
      const savingsPercent = listedPrice > 0 ? ((savings / listedPrice) * 100).toFixed(0) : 0
      const savingsEl = document.getElementById('offerSavings')
      if (savingsEl) {
        if (savings > 0) {
          savingsEl.textContent = `${savings.toFixed(2)} OVG (${savingsPercent}%)`
          savingsEl.parentElement.style.color = 'var(--mp-success)'
        } else {
          savingsEl.textContent = 'Premium offer'
          savingsEl.parentElement.style.color = 'var(--mp-warning)'
        }
      }
    }
    window.updateOfferSummary = updateOfferSummary

    async function openOfferModal(itemData) {
      const wizard = await import('./wizards/offerWizard.js')
      wizard.open(itemData)
    }
    window.openOfferModal = openOfferModal

    // ========== BID INCREMENT PRESETS ==========
    function setBidIncrement(increment) {
      const input = document.getElementById('bidAuctionAmount')
      const currentBidEl = document.getElementById('bidCurrentBid')
      if (!input || !currentBidEl) return
      const currentBid = parseFloat(currentBidEl.textContent) || 0
      const newBid = currentBid + increment
      input.value = newBid.toFixed(2)
      if (typeof validateAuctionBid === 'function') validateAuctionBid()
    }
    window.setBidIncrement = setBidIncrement

    // ========== RENT OUT MODAL FUNCTIONS ==========
    async function openRentOutModal() {
      const wizard = await import('./wizards/rentOutWizard.js')
      wizard.open(window.currentDetailItem)
    }
    window.openRentOutModal = openRentOutModal

    // View toggle (Grid/Table/Table-Expanded)
    document.querySelectorAll('.mp-view-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.mp-view-btn').forEach(b => b.classList.remove('active'))
        btn.classList.add('active')

        const viewMode = btn.dataset.viewMode || 'grid' // grid or table-expanded
        const activeView = (typeof window.getCurrentView === 'function' ? window.getCurrentView() : null) || 'explore'

        // Handle view mode based on current view
        if (activeView === 'explore') {
          if (typeof window.setExploreViewMode === 'function') {
            window.setExploreViewMode(viewMode)
          }
        } else if (activeView === 'inventory') {
          if (typeof window.setInventoryViewMode === 'function') {
            window.setInventoryViewMode(viewMode)
          }
        } else if (activeView === 'collections') {
          if (typeof window.setCollectionsViewMode === 'function') {
            window.setCollectionsViewMode(viewMode)
          }
        }
      })
    })

    // Close modal on overlay click
    document.querySelectorAll('.mp-modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.classList.remove('open')
      })
    })

    // ========== MOBILE MENU ==========
    const menuToggle = document.getElementById('menuToggle')
    const mobileMenu = document.getElementById('mobileMenu')
    const mobileOverlay = document.getElementById('mobileOverlay')
    const sidebar = document.querySelector('.mp-sidebar')

    function toggleMobileMenu() {
      const isOpen = sidebar?.classList.contains('open')
      sidebar?.classList.toggle('open', !isOpen)
      mobileOverlay?.classList.toggle('open', !isOpen)
      menuToggle?.classList.toggle('active', !isOpen)
      document.body.style.overflow = isOpen ? '' : 'hidden'
    }

    function closeMobileMenu() {
      sidebar?.classList.remove('open')
      mobileOverlay?.classList.remove('open')
      menuToggle?.classList.remove('active')
      document.body.style.overflow = ''
    }

    function mobileNavigate(view) {
      closeMobileMenu()
      switchView(view)
      // Update mobile menu active state
      document.querySelectorAll('.mp-mobile-nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.view === view)
      })
      // Update mobile filters for the new view
      updateMobileFiltersForView(view)
    }

    // Toggle mobile filters expand/collapse
    window.toggleMobileFilters = function() {
      const content = document.getElementById('mobileFiltersContent')
      const icon = document.getElementById('mobileFiltersToggleIcon')
      if (content && icon) {
        content.classList.toggle('collapsed')
        icon.innerHTML = content.classList.contains('collapsed') ? '&#9650;' : '&#9660;'
      }
    }

    // Update mobile filters based on current view
    window.updateMobileFiltersForView = function(view) {
      const filterGroups = document.querySelectorAll('.mp-mobile-filter-group')
      const filtersSection = document.getElementById('mobileFilters')
      const filtersTitle = document.getElementById('mobileFiltersTitle')

      // Views without filters
      const viewsWithoutFilters = ['land', 'stats']

      if (filtersSection) {
        filtersSection.style.display = viewsWithoutFilters.includes(view) ? 'none' : 'block'
      }

      // Update title based on view
      if (filtersTitle) {
        const titles = {
          explore: 'Filters',
          inventory: 'Filters',
          offers: 'Filter Offers',
          activity: 'Activity Filters'
        }
        filtersTitle.textContent = titles[view] || 'Filters'
      }

      // Show/hide filter groups based on view
      filterGroups.forEach(group => {
        const views = group.dataset.mobileViews?.split(',') || []
        group.classList.toggle('visible', views.includes(view))
      })

      // Hide Favorites chip in Inventory (favorites are for other users' items)
      const favoritesChip = document.querySelector('.mp-mobile-chip-favorites')
      if (favoritesChip) {
        favoritesChip.style.display = view === 'inventory' ? 'none' : ''
      }
    }

    // Initialize mobile filters on page load
    updateMobileFiltersForView('explore')

    // Mobile filter chip click handlers
    document.querySelectorAll('.mp-mobile-chip').forEach(chip => {
      chip.addEventListener('click', function() {
        const parent = this.closest('.mp-mobile-filter-chips')
        const isMultiSelect = this.dataset.mobileCategory || this.dataset.mobileStatus

        if (isMultiSelect) {
          // Multi-select: toggle individual chip
          this.classList.toggle('active')
        } else {
          // Single-select: only one active
          parent.querySelectorAll('.mp-mobile-chip').forEach(c => c.classList.remove('active'))
          this.classList.add('active')
        }

        // Sync with desktop sidebar filters
        syncMobileFiltersToSidebar(this)
      })
    })

    // Sync mobile filter selection to sidebar
    function syncMobileFiltersToSidebar(chip) {
      // Category filter sync
      if (chip.dataset.mobileCategory) {
        const category = chip.dataset.mobileCategory
        const sidebarOption = document.querySelector(`.mp-filter-option[data-category="${category}"]`)
        if (sidebarOption) {
          sidebarOption.classList.toggle('selected', chip.classList.contains('active'))
          sidebarOption.click() // Trigger the existing filter logic
        }
      }

      // Sort sync
      if (chip.dataset.mobileSortSelect) {
        const sortSelect = document.getElementById('sortSelect')
        if (sortSelect) {
          sortSelect.value = chip.value
          sortSelect.dispatchEvent(new Event('change'))
        }
      }

      // Status filter sync
      if (chip.dataset.mobileStatus) {
        const status = chip.dataset.mobileStatus
        const sidebarOption = document.querySelector(`.mp-filter-option[data-type="${status}"]`)
        if (sidebarOption) {
          sidebarOption.classList.toggle('selected', chip.classList.contains('active'))
        }
      }

      // Activity mode sync
      if (chip.dataset.mobileActivityMode) {
        const mode = chip.dataset.mobileActivityMode
        if (typeof switchActivityMode === 'function') {
          switchActivityMode(mode)
        }
      }

      // Listing status sync (Inventory)
      if (chip.dataset.mobileListing) {
        const status = chip.dataset.mobileListing
        const sidebarOption = document.querySelector(`.mp-filter-option[data-inventory-status="${status}"]`)
        if (sidebarOption) {
          sidebarOption.click() // Trigger the existing filter logic
        }
      }
    }

    // Mobile sort select sync
    document.getElementById('mobileSortSelect')?.addEventListener('change', function() {
      const sortSelect = document.getElementById('sortSelect')
      if (sortSelect) {
        sortSelect.value = this.value
        sortSelect.dispatchEvent(new Event('change'))
      }
    })

    menuToggle?.addEventListener('click', toggleMobileMenu)
    mobileOverlay?.addEventListener('click', closeMobileMenu)

    // Close menu on escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && mobileMenu?.classList.contains('open')) {
        closeMobileMenu()
      }
    })

    // Expose mobile menu functions globally
    window.mobileNavigate = mobileNavigate
    window.toggleMobileMenu = toggleMobileMenu
    window.closeMobileMenu = closeMobileMenu

    // View Switcher (All views)
    let currentView = 'explore'

    // ========== FAVORITES SYSTEM ==========
    const FAVORITES_KEY = 'ovgrid_marketplace_favorites'
    let favoriteItems = new Set(JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]'))

    function saveFavorites() {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favoriteItems]))
    }

    function toggleFavorite(itemId, event) {
      if (event) event.stopPropagation()

      if (favoriteItems.has(itemId)) {
        favoriteItems.delete(itemId)
        showToast('info', 'Removed from Favorites', 'Item removed from your favorites')
      } else {
        favoriteItems.add(itemId)
        showToast('success', 'Added to Favorites', 'Item added to your favorites')
      }
      saveFavorites()
      updateFavoriteUI(itemId)
      updateFavoritesCount()
    }

    function updateFavoriteUI(itemId) {
      const isFav = favoriteItems.has(itemId)

      // Update card view
      const cards = document.querySelectorAll(`.mp-card[data-item-id="${itemId}"]`)
      cards.forEach(card => {
        const heartBtn = card.querySelector('.mp-favorite-btn')
        if (heartBtn) {
          heartBtn.classList.toggle('active', isFav)
          heartBtn.innerHTML = isFav ? '&#9829;' : '&#9825;'
        }
      })

      // Update table view
      const rows = document.querySelectorAll(`.mp-table-row[data-item-id="${itemId}"]`)
      rows.forEach(row => {
        const starBtn = row.querySelector('.mp-table-favorite')
        if (starBtn) {
          starBtn.classList.toggle('active', isFav)
          starBtn.innerHTML = isFav ? '★' : '☆'
        }
      })
    }

    function updateFavoritesCount() {
      const countEl = document.querySelector('[data-count-category="favorites"]')
      if (countEl) countEl.textContent = favoriteItems.size
    }

    function isFavorite(itemId) {
      return favoriteItems.has(itemId)
    }

    // Expose favorites functions globally
    window.toggleFavorite = toggleFavorite
    window.isFavorite = isFavorite
    window.favoriteItems = favoriteItems
    window.updateFavoritesCount = updateFavoritesCount

    async function switchView(view) {
      const app = document.querySelector('.marketplace-app')
      const gridContainer = document.querySelector('.mp-card-grid')

      // Reset batch modes when switching views
      if (typeof disableBatchBuyMode === 'function') {
        disableBatchBuyMode()
      }
      if (typeof disableBatchMode === 'function') {
        disableBatchMode()
      }

      currentView = view

      // Update nav tabs
      document.querySelectorAll('.mp-nav-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.view === view)
      })

      // Update mobile nav options in sidebar
      document.querySelectorAll('.mp-nav-option').forEach(opt => {
        opt.classList.toggle('selected', opt.dataset.view === view)
      })

      // Update sidebar filters based on view
      updateSidebarForView(view)

      // Update subheader actions based on view
      updateSubheaderForView(view)

      // Update mobile filters based on view
      if (typeof window.updateMobileFiltersForView === 'function') {
        window.updateMobileFiltersForView(view)
      }

      // Handle land view separately (lazy loaded)
      if (view === 'land') {
        app.classList.add('land-active')
        // Hide pagination bar for land view
        const paginationBar = document.getElementById('paginationBar')
        if (paginationBar) paginationBar.style.display = 'none'
        // Lazy load land map view component
        const landMapView = await import('./components/landMapView.js')
        landMapView.show()
      } else {
        app.classList.remove('land-active')
        // Hide land view if it exists
        window.landMapView?.hide?.()

        // Show pagination bar for views with pagination
        const paginationBar = document.getElementById('paginationBar')
        const viewsWithPagination = ['explore', 'inventory', 'offers']
        if (paginationBar) {
          paginationBar.style.display = viewsWithPagination.includes(view) ? 'flex' : 'none'
        }

        // Restore grid class for explore view
        const gridContainer = document.querySelector('.mp-card-grid')
        if (gridContainer && view === 'explore') {
          gridContainer.className = 'mp-card-grid'
        }

        // Load view-specific data
        if (typeof window.loadViewData === 'function') {
          window.loadViewData(view)
        }
      }
    }

    // Expose switchView to global scope (getCurrentView is defined in navigation.js)
    window.switchView = switchView

    // Handle cancel listing action
    function handleCancelListing() {
      if (!window.currentDetailItem) return
      showToast('info', 'Canceling Listing', 'This will remove your item from the marketplace')
      // In production, this would call blockchain to cancel the listing
      closeDetailPanel()
    }
    window.handleCancelListing = handleCancelListing

    // --- Offer Management Functions ---
    function setButtonLoading(btn, loading) {
      if (!btn) return
      if (loading) {
        btn.classList.add('loading')
        btn.dataset.originalHtml = btn.innerHTML
        btn.innerHTML = '<span class="mp-btn-spinner"></span>'
      } else {
        btn.classList.remove('loading')
        if (btn.dataset.originalHtml) btn.innerHTML = btn.dataset.originalHtml
      }
    }

    async function acceptOffer(offerElement, offerId) {
      if (!offerElement || !offerId) return
      const btn = offerElement.querySelector('.accept')
      const allBtns = offerElement.querySelectorAll('.mp-table-action-sm')

      allBtns.forEach(b => b.disabled = true)
      setButtonLoading(btn, true)

      try {
        // Get bidder from offer data
        const bidder = offerElement.dataset.counterparty || window.CURRENT_USER
        await window.blockchain?.acceptOffer(offerId, bidder)
        // Element will be removed by realtime subscription when status changes
      } catch (error) {
        showToast('error', 'Error', 'Failed to accept offer')
        allBtns.forEach(b => b.disabled = false)
        setButtonLoading(btn, false)
      }
    }
    window.acceptOffer = acceptOffer

    async function withdrawOffer(offerElement, offerId) {
      if (!offerElement || !offerId) return
      const btn = offerElement.querySelector('.withdraw')
      const allBtns = offerElement.querySelectorAll('.mp-table-action-sm')

      allBtns.forEach(b => b.disabled = true)
      setButtonLoading(btn, true)

      try {
        await window.blockchain?.withdrawOffer(offerId)
        // Element will be removed by realtime subscription when status changes
      } catch (error) {
        showToast('error', 'Error', 'Failed to withdraw offer')
        allBtns.forEach(b => b.disabled = false)
        setButtonLoading(btn, false)
      }
    }
    window.withdrawOffer = withdrawOffer

    async function cancelOffer(offerElement, offerId) {
      await withdrawOffer(offerElement, offerId)
    }
    window.cancelOffer = cancelOffer

    // Update sidebar filters based on current view
    function updateSidebarForView(view) {
      const sidebar = document.querySelector('.mp-sidebar')
      const viewsWithoutSidebar = []

      // Hide sidebar for specific views (use '' to let CSS handle responsive)
      if (sidebar) {
        sidebar.style.display = viewsWithoutSidebar.includes(view) ? 'none' : ''
      }

      // Hide/show filter groups based on view
      document.querySelectorAll('.mp-filter-group').forEach(group => {
        const views = group.dataset.views?.split(',') || ['explore']
        const shouldShow = views.includes(view)
        group.style.display = shouldShow ? '' : 'none'
        group.classList.toggle('mp-hidden', !shouldShow)
      })

      // Hide Favorites filter in Inventory (favorites are for other users' items)
      const favoritesFilter = document.querySelector('.mp-filter-option[data-category="favorites"]')
      if (favoritesFilter) {
        favoritesFilter.style.display = view === 'inventory' ? 'none' : ''
      }

      // Update sidebar title
      const sidebarTitle = document.querySelector('.mp-sidebar-title')
      if (sidebarTitle) {
        const titles = {
          explore: 'Filters',
          inventory: 'Filters',
          land: 'Map',
          offers: 'Filter Offers',
          activity: 'Filter Activity',
          stats: 'Stats Info'
        }
        sidebarTitle.textContent = titles[view] || 'Filters'
      }
    }
    window.updateSidebarForView = updateSidebarForView

    // Update subheader actions based on current view
    function updateSubheaderForView(view) {
      document.querySelectorAll('[data-subheader-view]').forEach(el => {
        const views = el.dataset.subheaderView.split(' ')
        el.style.display = views.includes(view) ? 'flex' : 'none'
      })
      // Sync view toggle buttons with saved mode
      syncViewToggleButtons(view)
      // Sync batch buy select mode buttons after view change
      if (view === 'explore' && typeof updateBatchBuyUI === 'function') {
        updateBatchBuyUI()
      }
      // Sync inventory select mode buttons after view change
      if (view === 'inventory' && typeof updateInventorySelectUI === 'function') {
        updateInventorySelectUI()
      }
    }
    window.updateSubheaderForView = updateSubheaderForView

    /**
     * Sync view toggle buttons with the saved view mode for the current view
     * @param {string} view - Current view name
     */
    function syncViewToggleButtons(view) {
      let currentMode = 'grid'

      // Get current view mode from getters
      if (view === 'explore' && typeof window.getExploreViewMode === 'function') {
        currentMode = window.getExploreViewMode()
      } else if (view === 'inventory' && typeof window.getInventoryViewMode === 'function') {
        currentMode = window.getInventoryViewMode()
      } else if (view === 'collections' && typeof window.getCollectionsViewMode === 'function') {
        currentMode = window.getCollectionsViewMode()
      }

      // Update button active states
      document.querySelectorAll('.mp-view-btn').forEach(btn => {
        const btnMode = btn.dataset.viewMode || 'grid'
        btn.classList.toggle('active', btnMode === currentMode)
      })
    }
    window.syncViewToggleButtons = syncViewToggleButtons

    // Offers Tab Switcher
    function switchOffersTab(btn, tabId) {
      btn.parentElement.querySelectorAll('.mp-offers-tab').forEach(t => t.classList.remove('active'))
      btn.classList.add('active')
      document.querySelectorAll('[id^="offers-"]').forEach(c => c.classList.remove('active'))
      document.getElementById('offers-' + tabId)?.classList.add('active')
    }

    // Duration Selector
    function selectDuration(el) {
      el.parentElement.querySelectorAll('.mp-duration-option').forEach(opt => opt.classList.remove('selected'))
      el.classList.add('selected')
    }

    // Character Counter
    function updateCharCounter(input) {
      const counter = input.parentElement.querySelector('.mp-char-counter')
      if (counter) {
        const len = input.value.length
        const max = input.maxLength || 32
        counter.textContent = `${len} / ${max}`
        counter.classList.toggle('warning', len > max * 0.8)
        counter.classList.toggle('error', len >= max)
      }
    }

    // Inline Rename
    let originalName = ''

    /**
     * Initiates inline rename mode for asset title
     */
    function startInlineRename() {
      const display = document.getElementById('renameDisplay')
      const form = document.getElementById('renameForm')
      const input = document.getElementById('renameInput')
      const title = document.getElementById('renameTitle')

      originalName = title.textContent
      input.value = originalName
      updateRenameCounter(input)

      display.classList.add('hidden')
      form.classList.add('active')
      input.focus()
      input.select()
    }

    /**
     * Updates the character counter for rename input
     * @param {HTMLInputElement} input - The rename input element
     */
    function updateRenameCounter(input) {
      const counter = document.getElementById('renameCounter')
      const saveBtn = document.getElementById('renameSaveBtn')
      const len = input.value.length
      const max = input.maxLength || 32

      counter.textContent = `${len} / ${max}`
      counter.classList.remove('warning', 'error')

      if (len > max * 0.8) counter.classList.add('warning')
      if (len >= max) counter.classList.add('error')

      // Disable save if empty or same as original
      saveBtn.disabled = len === 0 || input.value.trim() === originalName
    }

    /**
     * Saves the new name via on-chain transaction
     */
    async function saveInlineRename() {
      const input = document.getElementById('renameInput')
      const title = document.getElementById('renameTitle')
      const newName = input.value.trim()

      if (!newName || newName === originalName) {
        cancelInlineRename()
        return
      }

      // Update title immediately (optimistic UI)
      title.textContent = newName

      // Exit edit mode
      cancelInlineRename()

      // Update in database if available
      const currentItem = window.currentDetailItem
      if (currentItem?.id && typeof window.updateInventoryItemTitle === 'function') {
        await window.updateInventoryItemTitle(currentItem.id, newName)
        // Update current item data
        if (currentItem.data) currentItem.data.title = newName
      }

      // Show success toast
      showToast('success', 'Asset Renamed', `Now called "${newName}". Transaction pending...`)
    }

    /**
     * Cancels inline rename and restores display mode
     */
    function cancelInlineRename() {
      const display = document.getElementById('renameDisplay')
      const form = document.getElementById('renameForm')

      display.classList.remove('hidden')
      form.classList.remove('active')
    }

    // Handle Escape key to cancel rename
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const form = document.getElementById('renameForm')
        if (form?.classList.contains('active')) {
          cancelInlineRename()
        }
      }
      if (e.key === 'Enter') {
        const form = document.getElementById('renameForm')
        const saveBtn = document.getElementById('renameSaveBtn')
        if (form?.classList.contains('active') && !saveBtn.disabled) {
          saveInlineRename()
        }
      }
    })

    // Expose inline rename functions to global scope
    window.startInlineRename = startInlineRename
    window.updateRenameCounter = updateRenameCounter
    window.saveInlineRename = saveInlineRename
    window.cancelInlineRename = cancelInlineRename

    // Bundle Item Toggle
    function toggleBundleItem(el) {
      el.classList.toggle('selected')
      updateBundleCount()
    }

    function updateBundleCount() {
      const selected = document.querySelectorAll('#bundleModal .mp-inventory-item.selected')
      const countEl = document.querySelector('#bundleModal strong')
      if (countEl) countEl.textContent = `Selected: ${selected.length} items`
    }

    /**
     * Updates bundle name character counter
     * @param {HTMLInputElement} input - The bundle name input element
     */
    function updateBundleNameCounter(input) {
      const counter = document.getElementById('bundleNameCounter')
      if (counter) {
        const len = input.value.length
        const max = input.maxLength || 48
        counter.textContent = `${len} / ${max}`
        counter.classList.remove('warning', 'error')
        if (len > max * 0.8) counter.classList.add('warning')
        if (len >= max) counter.classList.add('error')
      }
    }

    // Expose bundle functions
    window.toggleBundleItem = toggleBundleItem
    window.updateBundleCount = updateBundleCount
    window.updateBundleNameCounter = updateBundleNameCounter

    // Batch Selection Mode
    let batchMode = null
    let selectedItems = new Set()

    function startBatchMode(mode) {
      batchMode = mode
      selectedItems.clear()
      document.querySelectorAll('.mp-card').forEach(card => {
        card.classList.add('mp-card-selectable')
      })
      document.getElementById('selectionBar').classList.add('visible')
      updateSelectedCount()
    }

    function clearSelection() {
      batchMode = null
      selectedItems.clear()
      document.querySelectorAll('.mp-card').forEach(card => {
        card.classList.remove('mp-card-selectable', 'selected')
      })
      document.getElementById('selectionBar').classList.remove('visible')
    }

    function updateSelectedCount() {
      document.getElementById('selectedCount').textContent = selectedItems.size
    }

    function confirmBatchAction() {
      if (batchMode === 'buy') {
        showToast('success', 'Batch Purchase', `Purchased ${selectedItems.size} items successfully!`)
      } else if (batchMode === 'list') {
        showToast('success', 'Batch Listed', `Listed ${selectedItems.size} items for sale!`)
      }
      clearSelection()
    }

    // Card click handler for batch mode
    document.addEventListener('click', (e) => {
      if (!batchMode) return
      const card = e.target.closest('.mp-card-selectable')
      if (card) {
        e.stopPropagation()
        card.classList.toggle('selected')
        const id = card.dataset.itemId || card.dataset.assetId
        if (card.classList.contains('selected')) {
          selectedItems.add(id)
        } else {
          selectedItems.delete(id)
        }
        updateSelectedCount()
      }
    })

    // Add keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'b' && e.ctrlKey) {
        e.preventDefault()
        startBatchMode('buy')
      }
    })

    // Land Map Filter Pills — handled by listeners.js (setupLandFilterListener)

    // Handle selection action based on button text
    async function handleSelectionAction() {
      const btn = document.getElementById('selectionAction')
      const action = btn?.textContent?.trim()
      const item = window.currentDetailItem?.data || window.currentDetailItem

      // Validate item has listing data (id or price) for marketplace actions
      const hasListingData = item && (item.id || item.price || item.mintedData)

      switch(action) {
        case 'Buy Now':
          if (hasListingData) window.wizards?.buy?.(item)
          break
        case 'Place Bid':
          if (hasListingData) window.wizards?.bid?.(item)
          break
        case 'Rent Now':
          if (hasListingData) window.wizards?.rent?.(item)
          break
        case 'Mint':
          // Mint only needs coordinates
          if (item?.x !== undefined && item?.y !== undefined) {
            window.wizards?.mintLand?.(item)
          }
          break
        case 'Manage':
          switchView('inventory')
          break
        case 'View':
        default:
          if (hasListingData) {
            window.assetDetailPanel?.open?.(item)
          }
          break
      }
    }

    // --- Listing Type Filter Chips ---
    document.querySelectorAll('.mp-filter-chip[data-listing-type]').forEach(chip => {
      chip.addEventListener('click', () => {
        // Update UI - remove active from all chips
        document.querySelectorAll('.mp-filter-chip[data-listing-type]').forEach(c => c.classList.remove('active'))
        chip.classList.add('active')

        // Update filter state
        const listingType = chip.dataset.listingType
        filters.listingType = listingType

        // Reset pagination and reload
        resetPaginationState()
        loadItems()
      })
    })

    // ========== EVENT DELEGATION SYSTEM ==========
    /**
     * Central event delegation handler for data-action attributes
     * Reduces inline onclick handlers and improves maintainability
     */
    function initEventDelegation() {
      document.addEventListener('click', (e) => {
        const target = e.target.closest('[data-action]')
        if (!target) return

        const action = target.dataset.action
        const modalId = target.dataset.modal
        const view = target.dataset.view
        const value = target.dataset.value

        switch (action) {
          case 'open-modal':
            // Only open if modal exists in DOM (inline modals)
            // Lazy-loaded modals are handled by main.js wizards system
            if (modalId && document.getElementById(modalId)) openModal(modalId)
            break
          case 'close-modal':
            if (modalId) closeModal(modalId)
            else closeAllModals()
            break
          case 'switch-view':
            if (view) switchView(view)
            break
          case 'toggle-batch-buy':
            toggleBatchBuyMode()
            break
          case 'toggle-batch-sell':
            toggleBatchSellMode()
            break
          case 'open-batch-buy':
            openBatchBuyModal()
            break
          case 'open-batch-sell':
            openBatchSellModal()
            break
          case 'sync-blockchain':
            syncFromBlockchain()
            break
          case 'dismiss-paused':
            dismissPausedBanner()
            break
          default:
            // Allow custom actions to be handled by other modules
            const customEvent = new CustomEvent('mp-action', {
              detail: { action, target, modalId, view, value },
              bubbles: true
            })
            target.dispatchEvent(customEvent)
        }
      })
    }

    // Initialize event delegation
    initEventDelegation()

    // Initialize sidebar filters for initial view (explore by default)
    updateSidebarForView('explore')

    // Expose event delegation for extensibility
    window.initEventDelegation = initEventDelegation
  
