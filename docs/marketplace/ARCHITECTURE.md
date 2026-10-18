# Marketplace - Architecture Overview

> Technical architecture and design decisions.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (Browser)                       │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │  Marketplace │  │   Wizards   │  │    Views/Tabs           │  │
│  │   index.js   │  │  (Lazy)     │  │  Inventory, Explore...  │  │
│  └──────┬──────┘  └──────┬──────┘  └───────────┬─────────────┘  │
│         │                │                      │                │
│         └────────────────┼──────────────────────┘                │
│                          │                                       │
│  ┌───────────────────────▼───────────────────────────────────┐  │
│  │                  BlockchainManager.js                      │  │
│  │  - Contract interactions                                   │  │
│  │  - Transaction handling                                    │  │
│  │  - Event parsing                                           │  │
│  └───────────────────────┬───────────────────────────────────┘  │
│                          │                                       │
│  ┌───────────────────────▼───────────────────────────────────┐  │
│  │                  MarketplaceCache.js                       │  │
│  │  - In-memory TTL cache                                     │  │
│  │  - RPC optimization                                        │  │
│  └───────────────────────┬───────────────────────────────────┘  │
└──────────────────────────┼───────────────────────────────────────┘
                           │
                           │ JSON-RPC
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Polygon Network                             │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │  OVGMarketplace │  │    OVGToken     │  │    OVGAssets    │  │
│  │     (Proxy)     │  │     (Proxy)     │  │     (Proxy)     │  │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘  │
│           │                    │                    │            │
│  ┌────────┴────────┐           │                    │            │
│  │   OVGMetadata   │           │                    │            │
│  │     (Proxy)     │           │                    │            │
│  │ External storage│           │                    │            │
│  └────────┬────────┘           │                    │            │
│           │                    │                    │            │
│           ▼                    ▼                    ▼            │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                   Implementation Contracts                   ││
│  │  (Upgradeable via UUPS)                                      ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

---

## Directory Structure

```
lib/
├── blockchain/
│   ├── BlockchainManager.js    # Main blockchain interface (~2500 LOC)
│   ├── contracts.js            # ABIs, addresses, Multicall3
│   └── MarketplaceCache.js     # Caching layer
│
├── config/
│   └── marketplaceConfig.js    # Centralized constants
│
├── utils/
│   ├── ErrorLogger.js          # Centralized error logging with buffer
│   ├── withRetry.js            # Retry with exponential backoff + timeouts
│   └── __tests__/              # Unit tests (28 tests)
│
├── marketplace/js/             # MODULARIZED APP CORE (v2.1.0)
│   ├── app-core.js             # Orchestrator (237 LOC, -95% from 4,716)
│   ├── app-ui.js               # UI interactions
│   ├── main.js                 # Entry point
│   │
│   ├── store/
│   │   └── appState.js         # Centralized state container
│   │
│   ├── core/                   # 35+ utility modules
│   │   ├── constants.js        # DB_NAME, ITEMS_PER_PAGE, etc.
│   │   ├── database.js         # GenosDB initialization
│   │   ├── user.js             # CURRENT_USER management
│   │   ├── time.js             # formatTimeRemaining, countdown
│   │   ├── subscriptions.js    # View subscription management
│   │   ├── cache.js            # clearAllCache
│   │   ├── pagination/         # Pagination system
│   │   │   ├── state.js        # State variables
│   │   │   ├── persistence.js  # localStorage save/load
│   │   │   └── handlers.js     # UI controls, infinite scroll
│   │   ├── filters/            # Filter system
│   │   │   ├── state.js        # Filters object
│   │   │   ├── query.js        # buildFilterQuery
│   │   │   ├── counts.js       # updateFilterCounts
│   │   │   ├── ui.js           # updateFilterUIFromState
│   │   │   └── listeners.js    # All filter event listeners
│   │   ├── rendering/          # Rendering utilities
│   │   │   ├── utils.js        # getItemStatus, formatTimeAgo
│   │   │   └── headers.js      # Table headers
│   │   ├── analytics/          # Analytics modal
│   │   │   ├── activity.js     # loadAnalyticsActivity
│   │   │   ├── stats.js        # calculateStats
│   │   │   └── chart.js        # renderModalPriceChart
│   │   ├── blockchain/         # Blockchain sync
│   │   │   └── sync.js         # loadBlockchainData, forceFullSync
│   │   └── init/               # Initialization
│   │       ├── appInitializer.js
│   │       ├── inventoryNavigation.js
│   │       └── viewDispatcher.js
│   │
│   ├── modules/                # 28+ UI rendering modules
│   │   ├── explore/            # Explore view
│   │   │   ├── persistence.js
│   │   │   ├── viewMode.js
│   │   │   ├── reset.js
│   │   │   ├── rendering.js
│   │   │   └── loading.js
│   │   ├── views/              # View loaders
│   │   │   ├── pagination.js
│   │   │   ├── loaders.js
│   │   │   └── subscriptions.js
│   │   ├── inventory/          # Inventory view
│   │   │   ├── viewMode.js
│   │   │   ├── grouping.js
│   │   │   └── rendering.js
│   │   ├── collections/        # Collections view
│   │   │   ├── viewMode.js
│   │   │   └── rendering.js
│   │   ├── offers/             # Offers view
│   │   │   └── rendering.js
│   │   ├── stats/              # Stats view
│   │   │   └── rendering.js
│   │   └── batch/              # Batch operations
│   │       └── index.js
│   │
│   ├── services/
│   │   └── blockchain.js       # TX execution layer
│   │
│   └── wizards/                # Lazy-loaded transaction UIs
│       ├── sellWizard.js
│       ├── buyWizard.js
│       ├── rentWizard.js
│       ├── editRentalWizard.js
│       └── ...
│
├── ui/marketplace/             # Legacy UI (being migrated)
│   ├── index.js                # Main controller
│   ├── styles.js               # CSS-in-JS styles
│   └── ...

blockchain/
├── contracts/
│   └── upgradeable/
│       ├── OVGMarketplaceUpgradeable.sol
│       ├── OVGTokenUpgradeable.sol
│       ├── OVGAssetsUpgradeable.sol
│       ├── OVGLandClaimUpgradeable.sol
│       └── OVGMetadataUpgradeable.sol   # V2.0.0 - External metadata storage
│
├── test/
│   ├── MarketplaceFees.test.js
│   ├── MultiToken.test.js
│   ├── BatchOperations.test.js
│   ├── TimedAuctions.test.js
│   └── ...
│
├── scripts/
│   ├── deploy-upgradeable.js
│   └── upgrade-contract.js
│
└── deployments/
    ├── polygonMainnet-upgradeable.json
    └── polygonAmoy-upgradeable.json
```

---

## Smart Contract Architecture

### Contract Inheritance

```
OVGMarketplaceUpgradeable
├── Initializable           (OpenZeppelin)
├── OwnableUpgradeable      (OpenZeppelin)
├── PausableUpgradeable     (OpenZeppelin)
├── ReentrancyGuardUpgradeable (OpenZeppelin)
└── UUPSUpgradeable         (OpenZeppelin)
```

### Data Structures

```solidity
struct Listing {
    address seller;
    uint256 assetId;
    uint256 amount;
    uint256 price;
    bool isRental;
    uint256 duration;
    address paymentToken;
}

struct BundleListing {
    address seller;
    uint256[] assetIds;
    uint256[] amounts;
    uint256 price;
    bool active;
    address paymentToken;
    bytes32 nameHash;
}

struct TimedAuction {
    address seller;
    uint256 assetId;
    uint256 amount;
    uint256 minBid;
    uint256 startTime;
    uint256 endTime;
    address highestBidder;
    uint256 highestBid;
    bool settled;
}
```

### External Metadata Contract (V2.0.0)

Due to EVM contract size limits (24KB max), metadata storage was moved to an external contract.

```solidity
// OVGMetadataUpgradeable.sol
struct ListingMetadata {
    string title;       // max 64 chars
    string description; // max 160 chars
    string imageUrl;    // max 128 chars
    string assetUrl;    // max 128 chars
}

mapping(uint256 => ListingMetadata) public listingMetadata;
mapping(uint256 => ListingMetadata) public bundleMetadata;
mapping(uint256 => ListingMetadata) public auctionMetadata;
```

**Flow:**
1. Create listing/bundle/auction on OVGMarketplace
2. Extract ID from event
3. Call OVGMetadata.setListingMetadata() / setBundleMetadata() / setAuctionMetadata()

**Gas Cost:** ~0.015 MATIC (~$0.01 USD) per metadata write

### Storage Layout

```
Slot 0-50:    OpenZeppelin base contracts
Slot 51:      ovgToken
Slot 52:      ovgAssets
Slot 53:      nextListingId
Slot 54:      nextBundleId
Slot 55-60:   listings mapping
Slot 61-65:   bundleListings mapping
Slot 66-70:   bids mapping
Slot 71-75:   globalBids mapping
Slot 76-80:   activeRentals mapping
Slot 81:      marketplaceFee
Slot 82:      feeRecipient
Slot 83:      accumulatedFees
Slot 84-90:   V1.3 multi-token mappings
Slot 91-100:  V1.5 auction mappings
```

---

## Frontend Architecture

### Modular Architecture (v2.1.0+)

The marketplace core (`app-core.js`) has been modularized from 4,716 to 577 lines (~87.8% reduction) for better maintainability and AI-assisted development.

#### Key Patterns

**1. Centralized State (appState)**
```javascript
// store/appState.js
export const appState = {
  // Pagination
  currentPage: 1,
  maxKnownPage: 1,
  pageLastItemCursors: {},

  // View pagination
  viewPagination: {
    inventory: { currentPage: 1, cursors: {}, noMoreItems: false },
    offers: { currentPage: 1, filterDirection: 'received' },
    ...
  },

  // View modes
  exploreViewMode: 'grid',
  inventoryViewMode: 'grid',

  // DOM references
  elements: null,

  // Inventory navigation
  expandedGroupKey: null,
  expandedGroupItems: [],
  navigationStack: [],
  ...
}
```

**2. Dependency Injection**
```javascript
// Modules receive dependencies via init functions
import { appState } from '../../store/appState.js'

let db = null
export function initInventoryRendering(deps) {
  db = deps.db
}

export function createInventoryCard(item) {
  const viewMode = appState.inventoryViewMode
  // Uses appState and injected db
}
```

**3. Module Organization**
- `core/` - Utilities, state management, business logic
- `modules/` - UI rendering, view-specific code
- `store/` - Centralized state container
- `services/` - Blockchain transaction execution

#### Module Index Structure

Each subdirectory has an `index.js` that re-exports for clean imports:
```javascript
// core/index.js
export * from './constants.js'
export { initDatabase } from './database.js'
export { filters, buildFilterQuery } from './filters/index.js'
export { loadBlockchainData } from './blockchain/index.js'
// ...
```

### Legacy Modular Architecture (v1.5.0+)

The legacy UI system uses a different modular pattern:

```
index.js (233 LOC)
├── Creates state via MarketplaceState.js
├── Creates dataLoader via DataLoader.js
├── Orchestrates handlers via handlers/*.js
└── Uses ModalGenerator.js for HTML

MarketplaceState.js (232 LOC)
├── Centralized state with getters/setters
├── UI state (overlay, isOpen, activeTab, isProcessing)
├── Selection state (selectedAsset, selectedListing, selectedAuction)
├── User state (address, balance, roles)
├── Mode flags (batchListMode, bundleSelectMode)
└── reset() method for state cleanup

DataLoader.js (184 LOC)
├── loadData() - Load data for current tab
└── loadListingBids() - Load bids for specific listing

handlers/*.js
├── NavigationHandlers.js - Tabs, back, close, refresh
├── InventoryHandlers.js - Card clicks, bundle selection
├── ExploreHandlers.js - Search, filters, favorites
├── TransactionHandlers.js - Sell, buy, rent, gift
├── BidHandlers.js - Place/accept/withdraw bids
├── BatchHandlers.js - Batch list/buy operations
├── AuctionHandlers.js - Timed auctions
└── AdminHandlers.js - Admin panel actions
```

### State Management

```javascript
// state/MarketplaceState.js
export const createMarketplaceState = () => {
  // Private state variables
  let overlay = null
  let isOpen = false
  let activeTab = 'inventory'
  // ...

  return {
    // Getters/setters for encapsulation
    get overlay() { return overlay },
    set overlay(v) { overlay = v },

    // Tab states (shared object)
    tabStates: {
      inventory: { items: [], currentPage: 1, ... },
      explore: { items: [], currentPage: 1, ... },
      // ...
    },

    // Collections
    favoriteIds: new Set(),
    selectedBundleAssets: new Set(),
    selectedBatchListAssets: new Set(),

    // Reset method
    reset() {
      selectedAsset = null
      selectedListing = null
      // ...
    }
  }
}
```

### Handler Pattern

```javascript
// handlers/TransactionHandlers.js
export const bind = (state, modules, refreshContent, dataLoader, updateHeaderBalance) => {
  // Bind action button
  document.getElementById('btn-confirm-buy')?.addEventListener('click', async () => {
    state.isProcessing = true
    refreshContent()

    try {
      const bm = await getBlockchainManager()
      await bm.purchaseAsset(state.selectedListing.listingId)

      state.isProcessing = false
      state.selectedListing = null
      await dataLoader.loadData()
    } catch (e) {
      state.isProcessing = false
      refreshContent()
    }
  })
}
```

### Lazy Loading Pattern

```javascript
// index.js
const modules = {}

const bindContentEvents = async () => {
  const [
    NavigationHandlers,
    TransactionHandlers,
    // ...
  ] = await Promise.all([
    import('./handlers/NavigationHandlers.js'),
    import('./handlers/TransactionHandlers.js'),
    // ...
  ])

  NavigationHandlers.bind(state, modules, refreshContent, dataLoader)
  TransactionHandlers.bind(state, modules, refreshContent, dataLoader, updateHeaderBalance)
  // ...
}
```

---

## Caching Strategy

### MarketplaceCache

```javascript
// Simple in-memory TTL cache
const cache = new Map()

export const MarketplaceCache = {
  set(key, value, ttl = 300000) { // 5 min default
    cache.set(key, {
      value,
      expires: Date.now() + ttl
    })
  },

  get(key) {
    const item = cache.get(key)
    if (!item) return null
    if (Date.now() > item.expires) {
      cache.delete(key)
      return null
    }
    return item.value
  },

  invalidate(key) {
    cache.delete(key)
  },

  invalidatePattern(pattern) {
    for (const key of cache.keys()) {
      if (key.includes(pattern)) {
        cache.delete(key)
      }
    }
  },

  clear() {
    cache.clear()
  }
}
```

### Cache Invalidation Points

| Action | Invalidated Keys |
|--------|------------------|
| Purchase | `active_listings`, `owned_assets` |
| List | `active_listings`, `owned_assets` |
| Cancel | `active_listings`, `owned_assets` |
| Bid | `active_listings` |
| Auction Settle | `active_auctions`, `owned_assets` |

---

## Security Architecture

### Smart Contract Security

```
┌─────────────────────────────────────────────────┐
│              Security Layers                     │
├─────────────────────────────────────────────────┤
│  1. Access Control (Ownable)                    │
│     └─ onlyOwner for admin functions            │
├─────────────────────────────────────────────────┤
│  2. Reentrancy Protection (ReentrancyGuard)     │
│     └─ nonReentrant on all state-changing       │
├─────────────────────────────────────────────────┤
│  3. Emergency Stop (Pausable)                   │
│     └─ whenNotPaused on critical functions      │
├─────────────────────────────────────────────────┤
│  4. Safe Transfers (SafeERC20)                  │
│     └─ safeTransfer, safeTransferFrom           │
├─────────────────────────────────────────────────┤
│  5. Input Validation                            │
│     └─ require() checks on all inputs           │
└─────────────────────────────────────────────────┘
```

### Frontend Security

| Measure | Implementation |
|---------|----------------|
| XSS Prevention | `escapeHTML()` utility |
| SRI Hashes | ethers.js integrity check |
| Version Pinning | genosdb@0.12.6 |
| Input Validation | Price/address validation |
| Address Checksum | `isValidEthAddress()` with ethers.isAddress() |
| Error Logging | `ErrorLogger` with buffer + global handlers |
| TX Timeouts | `withTimeout()` on tx.wait() (60s) |
| Race Protection | `isProcessing` guards in all handlers |
| Memory Cleanup | Interval cleanup in destroy/close |

---

## Transaction Flow

### Purchase Flow

```
User clicks "Buy"
       │
       ▼
┌──────────────────┐
│ Load BuyWizard   │
│ (lazy)           │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Fetch fee info   │
│ (royalty + fee)  │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Show price       │
│ breakdown        │
└────────┬─────────┘
         │
    User confirms
         │
         ▼
┌──────────────────┐
│ Check allowance  │
│ Approve if needed│
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Execute purchase │
│ transaction      │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Invalidate cache │
│ Update UI        │
└────────┬─────────┘
         │
         ▼
     Success toast
```

### Auction Flow

```
Seller: createAuction()
         │
         ▼
   Asset escrowed in contract
         │
         │◀──────────────────┐
         │                   │
         ▼                   │
   Bidder: placeBidOnAuction │
         │                   │
         ▼                   │
   Previous bidder refunded  │
   New bid escrowed          │
         │                   │
         └───────────────────┘

   Time passes...
         │
         ▼
   Auction ends (endTime reached)
         │
         ▼
   Anyone: settleAuction()
         │
         ├─── Has bids ──▶ Asset → Winner
         │                 Payment → Seller
         │                 Royalty → Creator
         │                 Fee → Marketplace
         │
         └─── No bids ──▶ Asset → Seller
```

---

## Performance Optimizations

### RPC Optimization

1. **Batched Requests**: Multiple view calls in single request
2. **Caching**: 5-minute TTL for listing data
3. **Lazy Loading**: Wizards loaded on demand
4. **Event Filtering**: Query only relevant events

### Gas Optimization

1. **Batch Operations**: Up to 15 items per transaction
2. **Minimal Storage Writes**: Pack data efficiently
3. **Optimizer**: Runs=10 for smaller bytecode

### UI Optimization

1. **Pagination**: 20 items per page default
2. **Virtual Scrolling**: For large lists (future)
3. **Debounced Search**: 300ms delay

---

## Testing Architecture

```
blockchain/test/                    # Smart Contract Tests (194 tests)
├── Unit Tests
│   ├── MarketplaceFees.test.js   (24 tests)
│   ├── MultiToken.test.js        (44 tests)
│   ├── BatchOperations.test.js   (15 tests)
│   └── TimedAuctions.test.js     (44 tests)
│
├── Integration Tests
│   ├── Upgrades.test.js          (82 tests)
│   └── MarketplaceV2.test.js     (comprehensive)
│
└── Total: 194 tests

lib/                                # Frontend Tests (251 tests)
├── utils/__tests__/
│   ├── ErrorLogger.test.js       (14 tests)
│   └── withRetry.test.js         (14 tests)
│
└── ui/marketplace/__tests__/
    ├── utils.test.js             (64 tests)
    ├── state.test.js             (43 tests)
    ├── calculations.test.js      (42 tests)
    ├── validation.test.js        (53 tests)
    ├── dataLoader.test.js        (21 tests)
    └── mocks/
        ├── blockchainManager.mock.js
        └── marketplaceConfig.mock.js
```

### Test Coverage

| Area | Coverage | Tests |
|------|----------|-------|
| Smart Contracts | ~95% | 194 |
| Frontend (Overall) | 72.90% | 251 |

#### Frontend Coverage Details

| File | Coverage |
|------|----------|
| `lib/utils/withRetry.js` | 97.62% |
| `lib/config/marketplaceConfig.js` | 87.97% |
| `lib/ui/marketplace/state/MarketplaceState.js` | 81.98% |
| `lib/utils/ErrorLogger.js` | 78.57% |
| `lib/ui/marketplace/utils.js` | 64.29% |

### Running Tests

```bash
# Smart Contract tests (Hardhat)
cd blockchain && npx hardhat test

# Frontend tests (Bun)
bun test

# Frontend tests with coverage
bun test --coverage

# Frontend tests in watch mode
bun test --watch
```

### Code Metrics

| Component | LOC | Notes |
|-----------|-----|-------|
| index.js | 233 | Main controller |
| MarketplaceState.js | 232 | Centralized state |
| ModalGenerator.js | 244 | HTML generators |
| DataLoader.js | 184 | Data fetching |
| handlers/*.js | 1,372 | Event handlers |
| **Total (core)** | ~2,265 | Modular architecture |
| **Contract Tests** | ~2,766 | Hardhat/Solidity |
| **Frontend Tests** | ~2,581 | Bun/JavaScript |

---

## Deployment Architecture

### Mainnet (Production)

| Component | Address |
|-----------|---------|
| OVGMarketplace (Proxy) | `0x5c721aCC1535b2eD3a96Ba1C5768c0A97Dfa77DA` |
| OVGMarketplace (Impl) | `0xE82d2C4F6cc2192EaAd79997300F08D5744524FF` |
| OVGToken | `0x0fB62F6ea4A58A610b3cF19DB401778B4126d28E` |
| OVGAssets | `0x79f547F3E8a344D87064C15aA572a98E8d4A5c71` |
| OVGLandClaim | `0xb11D83816c8645034099F09A011F30E1685cb7e8` |
| OVGMetadata (Proxy) | `0x8eDB11F435918371E28AC538c95Cf1b7b6505a10` |
| OVGMetadata (Impl) | `0xe2e169A69cf7008C03a365167953BaF38B7a3950` |

### Testnet (Polygon Amoy)

| Component | Address |
|-----------|---------|
| OVGMarketplace (Proxy) | `0x9982f5e65A342D7b8CAd1Ab3C83585916D98542a` |
| OVGToken | `0x564f99BAD84cE3fD36D5597874633eddBB304b8f` |
| OVGAssets | `0xD55d5049e597BA431d5C2b5c1f286532f0E0C195` |

---

## Production Readiness (v1.5.0+)

### Error Handling

```javascript
// lib/utils/ErrorLogger.js
export const ErrorLogger = {
  error: (msg, ctx) => { /* Log + buffer */ },
  warn: (msg, ctx) => { /* Log + buffer */ },
  info: (msg, ctx) => { /* Log only in dev */ },
  debug: (msg, ctx) => { /* Log only in dev */ },
  getBuffer: () => [...errorBuffer],  // Get logged errors
  clearBuffer: () => { errorBuffer = [] }
}

// Global error handlers (automatic)
window.addEventListener('error', ...)
window.addEventListener('unhandledrejection', ...)
```

### Transaction Timeouts

```javascript
// lib/utils/withRetry.js
import { withTimeout } from '../utils/withRetry.js'

// Usage in BlockchainManager
const receipt = await withTimeout(
  tx.wait(),
  MARKETPLACE_CONFIG.TX_WAIT_TIMEOUT_MS,  // 60s
  'Transaction timed out'
)
```

### Batch Pre-Validation

```javascript
// BlockchainManager.validateBatchPurchase()
const validation = await bm.validateBatchPurchase(listingIds)
if (!validation.valid) {
  // Show error with invalid listing IDs
  return
}
// Proceed with purchase
```

### Race Condition Guards

```javascript
// All transaction handlers follow this pattern:
document.getElementById('btn-confirm-buy')?.addEventListener('click', async () => {
  if (state.isProcessing) return  // Prevent double-submit
  state.isProcessing = true
  try {
    await bm.purchaseAsset(...)
  } finally {
    state.isProcessing = false
  }
})
```

---

## Future Improvements

### Completed

1. ✅ **Frontend Tests**: 251 unit tests (72.90% coverage) for utils, state, validation, calculations

### Planned

1. **IndexedDB Cache**: Persist cache across sessions
2. **Service Worker**: Offline support + push notifications
3. **Web3Modal**: Multi-wallet support

### Considered

1. **GenosDB Indexer**: P2P event indexing (replaces The Graph)
2. **WebSocket**: Real-time updates
3. **IPFS**: Decentralized metadata storage
4. **3D Preview**: WebGL/WebGPU asset viewer

---

## Version History

| Version | Changes |
|---------|---------|
| 2.0.0 | External Metadata Contract (OVGMetadata) - On-chain title, description, imageUrl, assetUrl |
| 1.5.2 | Frontend Unit Tests (251 tests, 72.90% coverage) |
| 1.5.1 | Production Readiness Fixes (ErrorLogger, withTimeout, race guards) |
| 1.5.0 | Timed Auctions, Modular Architecture Refactor |
| 1.4.0 | Batch Operations (list/buy up to 15 items) |
| 1.3.0 | Multi-Token Support (OVG, USDC, USDT) |
| 1.2.0 | Marketplace Fees, Admin Panel, Pausable |
| 1.1.0 | Bundle Names on-chain |
| 1.0.0 | Initial Release |
