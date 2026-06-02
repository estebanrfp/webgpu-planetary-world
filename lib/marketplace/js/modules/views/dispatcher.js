/**
 * View Dispatcher (Lazy)
 * @module modules/views/dispatcher
 *
 * Provides loadViewByName using lazy loading to avoid static imports of renderers.
 */

import {
  getCollectionsView,
  getInventoryView,
  getOffersView,
  getActivityView
} from '../../core/lazy.js'

/**
 * Load a view by name using lazy loading
 * @param {string} viewName - View name
 * @param {object} options - Load options
 */
export async function loadViewByName(viewName, options = {}) {
  switch (viewName) {
    case 'collections': {
      const { loaders } = await getCollectionsView()
      return loaders.loadCollections(options)
    }
    case 'inventory': {
      const { subscriptions } = await getInventoryView()
      return subscriptions.subscribeToInventory(options)
    }
    case 'offers': {
      const { subscriptions } = await getOffersView()
      return subscriptions.subscribeToOffers(options)
    }
    case 'activity': {
      const { loaders } = await getActivityView()
      return loaders.loadActivity(options)
    }
  }
}
