/**
 * Navigation Handlers
 * Tabs, views, sidebar, back buttons
 * @module marketplace/handlers/navigation
 */

import { store } from '../state/store.js'

/** View configurations */
const VIEWS = ['explore', 'inventory', 'offers', 'activity', 'land']
const VIEW_STORAGE_KEY = 'ovgrid-marketplace-db_currentView'

/**
 * Save current view to localStorage
 * @param {string} view - View name
 */
function saveCurrentView(view) {
  try {
    localStorage.setItem(VIEW_STORAGE_KEY, view)
  } catch (e) { /* ignore */ }
}

/**
 * Load saved view from localStorage
 * @returns {string} Saved view or 'explore' as default
 */
export function loadSavedView() {
  try {
    const saved = localStorage.getItem(VIEW_STORAGE_KEY)
    return VIEWS.includes(saved) ? saved : 'explore'
  } catch (e) {
    return 'explore'
  }
}

/**
 * Switch to a different view
 * @param {string} view - View name
 */
export async function switchView(view) {
  if (!VIEWS.includes(view)) return

  store.setState({ currentView: view })
  saveCurrentView(view)

  // Update sidebar visibility
  const sidebar = document.querySelector('.mp-sidebar')
  if (sidebar) {
    sidebar.style.display = view === 'land' ? 'none' : ''
  }

  // Update active navigation items (header tabs, mobile nav, sidebar menu)
  document.querySelectorAll('.mp-nav-tab').forEach(item => {
    item.classList.toggle('active', item.dataset.view === view)
  })
  document.querySelectorAll('.mp-mobile-nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.view === view)
  })
  document.querySelectorAll('.mp-nav-option').forEach(item => {
    item.classList.toggle('selected', item.dataset.view === view)
  })

  // Update content area
  document.querySelectorAll('.mp-view').forEach(v => {
    v.classList.toggle('active', v.id === `view-${view}`)
  })

  // Update sidebar filters for current view
  if (typeof window.updateSidebarForView === 'function') {
    window.updateSidebarForView(view)
  }

  // Update subheader actions for current view
  if (typeof window.updateSubheaderForView === 'function') {
    window.updateSubheaderForView(view)
  }

  // Handle pagination bar visibility
  const paginationBar = document.getElementById('paginationBar')
  const viewsWithPagination = ['explore', 'inventory', 'offers']
  if (paginationBar) {
    paginationBar.style.display = viewsWithPagination.includes(view) ? 'flex' : 'none'
  }

  // Toggle parcel map mode class on marketplace overlay
  const overlay = document.querySelector('.mockup-marketplace-overlay')
  overlay?.classList.toggle('mp-parcel-map-mode', view === 'land')

  if (view === 'land') {
    const landMapView = await import('../components/landMapView.js')
    landMapView.show()
  } else {
    window.landMapView?.hide?.()
  }

  window.loadViewData?.(view)

}

/**
 * Switch tab within a view
 * @param {string} tab - Tab name
 */
export function switchTab(tab) {
  store.setState({ currentTab: tab })

  document.querySelectorAll('.mp-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tab)
  })

  document.querySelectorAll('.mp-tab-content').forEach(content => {
    content.classList.toggle('active', content.id === `tab-${tab}`)
  })
}

/**
 * Go back (close detail panel or modal)
 */
export function goBack() {
  const { activeModal, selectedAsset, selectedListing } = store.getState()

  if (activeModal) {
    closeModal(activeModal)
  } else if (selectedAsset || selectedListing) {
    closeDetailPanel()
  }
}

/**
 * Close detail panel
 */
export function closeDetailPanel() {
  store.setState({
    selectedAsset: null,
    selectedListing: null,
    selectedBundle: null
  })

  document.getElementById('detailPanel')?.classList.remove('open')
  document.getElementById('bundleDetailPanel')?.classList.remove('open')
}

/**
 * Close modal by ID
 * @param {string} modalId - Modal element ID
 */
export function closeModal(modalId) {
  const modal = document.getElementById(modalId)
  modal?.classList.remove('open')
  store.setState({ activeModal: null })
}

/**
 * Close all modals
 */
export function closeAllModals() {
  document.querySelectorAll('.mp-modal-overlay').forEach(m => {
    m.classList.remove('open')
  })
  closeDetailPanel()
  store.setState({ activeModal: null })
}

/**
 * Initialize navigation handlers
 */
export function initNavigation() {
  // Header tabs navigation
  document.querySelectorAll('.mp-nav-tab').forEach(item => {
    item.addEventListener('click', () => {
      const view = item.dataset.view
      if (view) switchView(view)
    })
  })

  // Mobile navigation
  document.querySelectorAll('.mp-mobile-nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const view = item.dataset.view
      if (view) switchView(view)
    })
  })

  // Sidebar menu options
  document.querySelectorAll('.mp-nav-option').forEach(item => {
    item.addEventListener('click', () => {
      const view = item.dataset.view
      if (view) switchView(view)
    })
  })

  // Tab navigation
  document.querySelectorAll('.mp-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab
      if (tabName) switchTab(tabName)
    })
  })

  // Back buttons
  document.querySelectorAll('[data-action="back"]').forEach(btn => {
    btn.addEventListener('click', goBack)
  })

  // Modal backdrop close
  document.querySelectorAll('.mp-modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeModal(overlay.id)
      }
    })
  })

  // Expose to global
  window.switchView = switchView
  window.switchTab = switchTab
  window.goBack = goBack
  window.closeDetailPanel = closeDetailPanel
  window.closeModal = closeModal
  window.closeAllModals = closeAllModals
  window.loadSavedView = loadSavedView

  /**
   * Get current active view name
   * @returns {string} Current view name
   */
  window.getCurrentView = function() {
    // First try from store
    const state = store.getState()
    if (state.currentView) return state.currentView
    // Fallback: check active view in DOM
    const activeView = document.querySelector('.mp-view.active')
    return activeView?.id?.replace('view-', '') || 'explore'
  }

  // Restore saved view on init
  const savedView = loadSavedView()
  if (savedView && savedView !== 'explore') {
    // Delay to ensure DOM is ready and other modules are loaded
    setTimeout(() => switchView(savedView), 100)
  }

}
