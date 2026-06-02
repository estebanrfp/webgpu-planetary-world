/**
 * Init module index
 * @module core/init/index
 *
 * Initialization and window exports for various subsystems.
 */

export {
  initInventoryNavigation,
  setupInventoryNavigationExports,
  filterInventoryByGroup,
  getInventoryGroupFilter,
  expandAsset,
  clearExpandedAsset,
  getExpandedAsset,
  clearInventoryGroupFilter
} from './inventoryNavigation.js'

export {
  initAppInitializer,
  initializeApp
} from './appInitializer.js'

export {
  initViewDispatcher,
  loadViewData,
  refreshCurrentView,
  setupViewDispatcherExports
} from './viewDispatcher.js'
