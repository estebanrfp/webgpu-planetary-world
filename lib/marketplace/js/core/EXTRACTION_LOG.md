# Extraction Log - Modularization

This file tracks the modularization progress of `app-core.js`.

## Summary

| Metric | Before | After | Reduction |
|--------|--------|-------|-----------|
| **app-core.js** | 4,716 lines | 237 lines | **95%** |
| **Modules created** | 0 | 40+ | - |
| **Lazy modules** | 0 | 10+ views/analytics | - |

## Module Architecture

```
lib/marketplace/js/
├── app-core.js              (237 lines - orchestrator)
├── store/
│   └── appState.js          (centralized state container)
├── core/                    (35+ files - utilities & logic)
│   ├── constants.js         (DB_NAME, ITEMS_PER_PAGE, etc.)
│   ├── database.js          (GenosDB initialization)
│   ├── user.js              (CURRENT_USER management)
│   ├── time.js              (formatTimeRemaining, countdown)
│   ├── subscriptions.js     (view subscriptions management)
│   ├── cache.js             (clearAllCache)
│   ├── pagination/
│   │   ├── state.js         (currentPage, cursors, etc.)
│   │   ├── persistence.js   (save/load localStorage)
│   │   └── handlers.js      (updatePaginationControls, scroll)
│   ├── filters/
│   │   ├── state.js         (filters object)
│   │   ├── query.js         (buildFilterQuery, buildViewQuery)
│   │   ├── counts.js        (updateFilterCounts)
│   │   ├── ui.js            (updateFilterUIFromState)
│   │   └── listeners.js     (all filter event listeners)
│   ├── rendering/
│   │   ├── utils.js         (getItemStatus, formatTimeAgo, etc.)
│   │   └── headers.js       (table headers)
│   ├── analytics/
│   │   ├── activity.js      (loadAnalyticsActivity)
│   │   ├── stats.js         (calculateStats, loadAnalyticsTrending)
│   │   ├── chart.js         (renderModalPriceChart)
│   │   └── modalObserver.js (MutationObserver, selectStatsPeriod)
│   ├── blockchain/
│   │   ├── sync.js          (loadBlockchainData, forceFullSync)
│   │   └── index.js         (re-exports)
│   ├── viewModes/
│   │   └── exports.js       (setXViewMode, getXViewMode window exports)
│   └── init/
│       ├── appInitializer.js      (initializeApp)
│       ├── inventoryNavigation.js (expandAsset, filterByGroup)
│       └── viewDispatcher.js      (loadViewData, refreshCurrentView)
└── modules/                 (27+ files - UI rendering)
    ├── explore/
    │   ├── persistence.js   (savePaginationState)
    │   ├── viewMode.js      (setExploreViewMode)
    │   ├── reset.js         (resetPaginationState)
    │   ├── rendering.js     (createItemElement)
    │   └── loading.js       (loadItems)
    ├── views/
    │   ├── pagination.js    (saveViewPaginationState)
    │   ├── loaders.js       (loadCollections, loadInventory, etc.)
    │   └── subscriptions.js (subscribeToInventory, subscribeToOffers)
    ├── inventory/
    │   ├── viewMode.js      (setInventoryViewMode)
    │   ├── grouping.js      (groupInventoryItems)
    │   ├── rendering.js     (createInventoryCard, renderExpandedAsset)
    │   └── titleUpdate.js   (updateInventoryItemTitle - inline rename)
    ├── collections/
    │   ├── viewMode.js      (setCollectionsViewMode)
    │   ├── rendering.js     (createCollectionCard)
    │   └── favorites.js     (favoriteCollections, toggleFavorite)
    ├── offers/
    │   └── rendering.js     (createOfferTableRow)
    ├── stats/
    │   └── rendering.js     (loadStats, renderPriceChart)
    └── batch/
        ├── index.js         (applyBatchBuyFilter, state management)
        └── exports.js       (window exports for batch mode)
```

## Pattern: appState + Dependency Injection

All modules use a centralized state container and receive dependencies via init functions:

```javascript
// store/appState.js - centralized mutable state
export const appState = {
  // Pagination state
  currentPage: 1,
  maxKnownPage: 1,
  pageLastItemCursors: {},

  // View pagination
  viewPagination: {
    inventory: { currentPage: 1, ... },
    offers: { currentPage: 1, ... },
    ...
  },

  // DOM references
  elements: null,

  // View modes
  exploreViewMode: 'grid',
  inventoryViewMode: 'grid',
  collectionsViewMode: 'table-expanded',

  // Inventory state
  inventoryGroupsCache: new Map(),
  expandedGroupKey: null,
  expandedGroupItems: [],
  navigationStack: [],
  ...
}

// modules use appState + init for dependencies
import { appState } from '../../store/appState.js'

let db = null
export function initInventoryRendering(deps) {
  db = deps.db
}

export function createInventoryCard(item) {
  // Uses appState and injected db
}
```

## Extraction Timeline

### Phase 1-3: Core Infrastructure
- `constants.js` - DB_NAME, NO_IMAGE, ITEMS_PER_PAGE
- `database.js` - GenosDB initialization
- `user.js` - CURRENT_USER management
- `time.js` - formatTimeRemaining, countdown
- `subscriptions.js` - view subscription management

### Phase 4: Pagination
- `pagination/state.js` - state variables
- `pagination/persistence.js` - localStorage save/load
- `pagination/handlers.js` - UI controls and infinite scroll

### Phase 5: Filters
- `filters/state.js` - filters object
- `filters/query.js` - buildFilterQuery, buildViewQuery
- `filters/counts.js` - updateFilterCounts (with case-insensitive fix)
- `filters/ui.js` - updateFilterUIFromState
- `filters/listeners.js` - all filter event listeners (~307 lines)

### Phase 6: Rendering
- `rendering/utils.js` - getItemStatus, formatTimeAgo, etc.
- `rendering/headers.js` - table headers for all views

### Phase 7: Analytics
- `analytics/activity.js` - loadAnalyticsActivity, switchActivityMode
- `analytics/stats.js` - calculateStats, loadAnalyticsTrending
- `analytics/chart.js` - renderModalPriceChart
- `analytics/modalObserver.js` - MutationObserver, selectStatsPeriod (~70 lines)

### Phase 8: Cache
- `cache.js` - clearAllCache

### Phase 9: Blockchain Sync
- `blockchain/sync.js` - loadBlockchainData, forceFullSync (~250 lines)

### Phase 10: Initialization
- `init/appInitializer.js` - initializeApp, IntersectionObserver (~85 lines)
- `init/inventoryNavigation.js` - expandAsset, filterByGroup (~60 lines)
- `init/viewDispatcher.js` - loadViewData, refreshCurrentView (~55 lines)

### Phase 11: View Modes
- `viewModes/exports.js` - setXViewMode/getXViewMode window exports (~90 lines)

### Phase 12: Additional Modules (2026-02-05)
- `modules/inventory/titleUpdate.js` - updateInventoryItemTitle (~65 lines)
- `modules/collections/favorites.js` - favoriteCollections, toggleFavorite (~60 lines)

### Phase 13: Batch Exports & Cleanup (2026-02-05)
- `modules/batch/exports.js` - window exports for batch mode (~70 lines)
- Cleaned redundant "Note:" comments (~80 lines removed)

### Phase 14: Lazy Loading Implementation (2026-02-05)
- `core/lazy.js` - Centralized lazy loading infrastructure (~330 lines)
- **ALL views lazy loaded**: explore, inventory, collections, offers, activity
- Modules deferred: analytics, collections, batch, titleUpdate
- Uses `requestIdleCallback` for non-blocking preload
- Dynamic imports with caching to prevent duplicate loads

### Phase 15: Complete Lazy Loading - No Static View Imports (2026-02-05)
- Removed static import of `renderExpandedAsset` from app-core.js
- `core/init/inventoryNavigation.js` now uses lazy loading for `renderExpandedAsset`
- `modules/views/dispatcher.js` created for lazy view dispatch (no static imports)
- `core/pagination/handlers.js` uses lazy loading via `getExploreView()`
- **ZERO** static imports of view modules in app-core.js or core/*

**Lazy Loading Architecture:**
```
app-core.js (232 lines)
├── store/appState.js (state)
├── modules/*/viewMode.js (state only - no rendering)
├── modules/*/persistence.js (localStorage - no rendering)
├── core/index.js (utilities)
│   ├── constants, database, user, time
│   ├── subscriptions, cache
│   ├── pagination/* (handlers use lazy.js)
│   ├── filters/* (listeners use lazy.js)
│   ├── rendering/utils.js, headers.js (no views)
│   ├── analytics/* (lazy loaded)
│   ├── blockchain/sync.js
│   └── init/* (all use lazy.js for views)
└── core/lazy.js
    ├── getExploreView() → modules/explore/loading.js, rendering.js
    ├── getInventoryView() → modules/views/subscriptions.js, inventory/rendering.js
    ├── getCollectionsView() → modules/views/loaders.js, collections/rendering.js
    ├── getOffersView() → modules/views/subscriptions.js, offers/rendering.js
    └── getActivityView() → modules/views/loaders.js
```

**Lazy Loading Benefits:**
- Faster initial page load (only critical pagination/filter modules)
- ALL view modules deferred until needed
- Spinner shown while view module loads
- Background preload in browser idle time
- Single initialization per module (init flags)
- app-core.js reduced from 4,716 → 232 lines (95.1%)

## Verification Checklist

All window exports preserved:

- [x] `window.db`
- [x] `window.CURRENT_USER`
- [x] `window.updateCurrentUser(address)`
- [x] `window.formatTimeRemaining(endsAt)`
- [x] `window.startAuctionCountdown()`
- [x] `window.stopAuctionCountdown()`
- [x] `window.loadViewData(view, forceReset)`
- [x] `window.refreshCurrentView()`
- [x] `window.loadBlockchainData()`
- [x] `window.forceFullSync()`
- [x] `window.clearAllCache()`
- [x] `window.setExploreViewMode(mode)`
- [x] `window.setInventoryViewMode(mode)`
- [x] `window.setCollectionsViewMode(mode)`
- [x] `window.filterInventoryByGroup(groupId, title)`
- [x] `window.expandAsset(groupKey, items)`
- [x] `window.clearExpandedAsset()`
- [x] `window.clearInventoryGroupFilter()`
- [x] `window.applyBatchBuyFilter()`
- [x] `window.removeBatchBuyFilter()`
- [x] `window.applyInventorySelectFilter()`
- [x] `window.removeInventorySelectFilter()`
- [x] `window.updateInventoryItemTitle(itemId, newTitle)`
- [x] `window.favoriteCollections`
- [x] `window.toggleCollectionFavorite(id, event)`
- [x] `window.selectStatsPeriod(btn, period)`
- [x] Analytics: `switchActivityMode`, `loadAnalyticsStats`, etc.

## Key Fixes During Modularization

1. **Case-sensitive filter counts**: Category/rarity counts use `.toLowerCase()` comparison
2. **ITEMS_PER_PAGE import**: Correctly imported from `constants.js`
3. **Duration handling**: BlockchainManager returns days (not seconds)
4. **Offers sync**: loadBlockchainData includes getUserGlobalBids/getReceivedGlobalBids

## Benefits

1. **AI-friendly**: Small, focused modules are easier to analyze and debug
2. **Maintainability**: Changes isolated to specific modules
3. **Testing**: Each module can be unit tested independently
4. **Performance**: Lazy loading potential for unused modules
5. **Collaboration**: Multiple developers can work on different modules
