# GenosDB Integration — Marketplace

> How the world's marketplace uses **GenosDB** as a real-time, P2P, reactive data
> layer over a blockchain. A reference for the patterns that make it work — and a
> worked example of GenosDB under production load.

The marketplace is the most data-intensive part of the world. It treats **Polygon as
the source of truth** for ownership and **GenosDB as the live read layer**:
the chain is mirrored into GenosDB, every view subscribes to it reactively with
`db.map`, and changes sync P2P to other peers. The UI never reads the chain
directly. The patterns below are what make that work — follow them when extending
the marketplace.

**Status:** ✅ Core integration complete + modularized · **Version:** 0.6.0

## Related Documents

- [POLYGON_IMPLEMENTATION.md](./POLYGON_IMPLEMENTATION.md) — Blockchain contracts, addresses, scripts, Multicall3, deployment
- [ERC1155_SUPPLY_MODEL.md](./ERC1155_SUPPLY_MODEL.md) — Supply management, inventory grouping, batch operations
---

## Core integration rules & patterns

> These are the load-bearing rules of the GenosDB ↔ blockchain integration.
> Read them first before changing marketplace data code — and as a guide to the
> patterns the world uses GenosDB for.

### Rule 0: Blockchain-First Architecture (MOST IMPORTANT)

```
┌─────────────────────────────────────────────────────────────────┐
│                    DATA FLOW ARCHITECTURE                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   BLOCKCHAIN ◄── Source of Truth (absolute)                    │
│        │                                                        │
│        ▼                                                        │
│   Operation succeeds? ──NO──▶ Nothing happens (show error)      │
│        │                                                        │
│       YES                                                       │
│        │                                                        │
│        ▼                                                        │
│   GenosDB Local Write ──▶ P2P Sync to all connected nodes       │
│        │                                                        │
│        ▼                                                        │
│   UI Update (real-time)                                         │
│                                                                 │
│   [Refresh Button] ──▶ Re-sync from blockchain ──▶ Overwrite    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Key principles:**
- **Blockchain = absolute source of truth**
- **If blockchain fails → NOTHING is written to GenosDB**
- **GenosDB = local cache + P2P sync layer**
- **Refresh = re-sync from blockchain, overwrites local data**

```javascript
// ✅ CORRECT - Blockchain-first pattern
async function executeTx(name, params, options, onSuccess) {
  try {
    const result = await blockchainOperation(name, params)  // Blockchain first
    if (result.success) {
      await onSuccess(result, params)  // GenosDB write ONLY if blockchain OK
    }
  } catch (error) {
    showToast('error', 'Transaction failed')  // Nothing written
  }
}

// ❌ WRONG - Writing to GenosDB before blockchain confirms
await db.put(data, id)  // NO! Blockchain must confirm first
await blockchainOperation()  // Too late, data already written
```

### Rule 1: Unified Data Model (NO Separate Listing Records)

```javascript
// ❌ WRONG - Old pattern with separate listings
const listingId = await db.put({ dataType: 'listing', assetId: xxx, ... })

// ✅ CORRECT - Unified model: asset IS the listing
await db.put({ ...asset, status: 'sale', price: '100 OVG', seller: user }, assetId)
```

**Key principle:** Assets contain listing info directly. The `status` field determines if item is listed:
- `'unlisted'` - Not for sale (in owner's inventory)
- `'sale'` - Listed for direct sale
- `'rent'` - Listed for rent
- `'auction'` - Listed for auction
- `'bundle'` - Part of a bundle
- `'offer'` - An offer record

### Rule 2: Use `getNodeValue()` NOT `db.get()` Directly

```javascript
// ❌ WRONG - db.get() returns { result: { id, value, edges, timestamp } }
const { result: asset } = await db.get(assetId)
const title = asset.title  // WRONG! asset is { id, value, ... }, not the data

// ✅ CORRECT - getNodeValue() extracts the actual value
const asset = await getNodeValue(assetId)
const title = asset.title  // CORRECT! asset is the actual data
```

**`getNodeValue` helper:**
```javascript
async function getNodeValue(id) {
  const { result } = await db.get(id)
  return result?.value
}
```

### Rule 3: No Local Cache (Todo-List Pattern)

```javascript
// ❌ WRONG - Maintaining local cache
const assetsCache = new Map()
assetsCache.set(id, { id, value })
const allItems = Array.from(assetsCache.values())

// ✅ CORRECT - Query GenosDB directly
async function getAllAssets() {
  const { results } = await db.map({ query: {}, field: 'timestamp', order: 'desc' })
  return results.filter(r => isAssetRecord(r.value)).map(r => ({ id: r.id, value: r.value }))
}
```

### Rule 4: Handle `removed` Action FIRST

```javascript
// ❌ WRONG - Value check before removal handling
db.map({ query: {} }, ({ id, value, action }) => {
  if (!value || !isAssetRecord(value)) return  // Skips removed items!
  if (action === 'removed') { ... }  // Never reached for removed items
})

// ✅ CORRECT - Handle removal first
db.map({ query: {} }, ({ id, value, action }) => {
  if (action === 'removed') {
    triggerReRender()  // Re-query and re-render
    return
  }
  if (!value || !isAssetRecord(value)) return
  // Handle other actions...
})
```

### Rule 5: Ownership Transfer on Purchase

```javascript
// ✅ CORRECT - Buy function updates owner and unlists
async buy(assetId, price) {
  const asset = await getNodeValue(assetId)
  await db.put({
    ...asset,
    owner: getCurrentUser(),  // Transfer ownership
    status: 'unlisted',       // Remove from marketplace
    price: null,
    seller: null
  }, assetId)
}
```

### Rule 6: Record Type Discrimination

```javascript
// Assets have: owner, status (no 'type' field)
// Activities have: type field ('purchase', 'sale', 'bid', etc.)

function isAssetRecord(value) {
  if (!value) return false
  if (value.type) return false  // Activities have 'type'
  return value.status !== undefined || value.owner !== undefined
}
```

### Rule 8: tokenId Type Boundary — `String()` at Producer

> **Refactored 2026-02-05.** All listing/asset objects MUST include a `tokenId` field as a **string** (numeric, no `asset_` prefix).

**Root cause:** `BlockchainManager.js` returns `Number(assetId)` (line 736). The `pendingOfferAssets` Set stores strings via `String(o.assetId)`. JavaScript `Set.has()` uses strict equality — `Set.has(Number)` ≠ `Set.has(String)`.

```
┌─────────────────────────────────────────────────────────────────────┐
│                    tokenId TYPE BOUNDARY ARCHITECTURE                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   BlockchainManager  →  assetId: Number(assetId)  →  1770259037734 │
│        │                                              (JS Number)   │
│        ▼                                                            │
│   SYNC (sync.js)  →  tokenId: String(listing.assetId)              │
│        │                                              "1770259037734"│
│        ▼                                              (JS String)   │
│   PRODUCERS (rendering.js, main.js, app-ui.js, inventory/)         │
│        │                                                            │
│        │  tokenId = String(x ?? y ?? id).replace(/^asset_/, '')    │
│        │           ^^^^^^                                           │
│        │  String() wraps ENTIRE ?? chain — not just last fallback  │
│        ▼                                                            │
│   CONSUMERS (wizards, panels, blockchain.js)                        │
│        │                                                            │
│        │  listing.tokenId  ← always a string, direct access        │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

```javascript
// ✅ CORRECT - Producer: String() wraps entire ?? chain
const tokenId = String(value.tokenId ?? value.assetId ?? id).replace(/^asset_/, '')
const listing = { id, tokenId, title: value.title, price: value.price }

// ✅ CORRECT - Sync: String() on every db.put tokenId
await db.put({ tokenId: String(listing.assetId), ... }, nodeId)

// ✅ CORRECT - Consumer trusts producer
const hasPendingOffer = window.pendingOfferAssets?.has(listing.tokenId)

// ❌ WRONG - String() only on last fallback (Number leaks through)
const tokenId = value.tokenId ?? value.assetId ?? String(id).replace(/^asset_/, '')

// ❌ WRONG - Fallback chain in consumer
const rawId = listing.tokenId || listing.assetId || listing.id
```

**Why not change BlockchainManager?** It legitimately uses Numbers for BigInt conversions and numeric comparisons (`assetId >= 1000`). The producer is the correct type boundary between blockchain (Numbers) and marketplace (Strings).

### Rule 7: MANDATORY Callback Mode for Real-Time Views

> **CRITICAL:** All views (Explore, Inventory, Offers) MUST use `db.map()` with callback for real-time reactivity.

```javascript
// ❌ WRONG - Static mode (no callback) - NO real-time updates
const { results } = await db.map({ query: {}, field: 'timestamp', order: 'desc' })
results.forEach(item => renderCard(item))

// ✅ CORRECT - Callback mode with unsubscribe for real-time
const { results, unsubscribe } = await db.map(
  { query: {}, field: 'timestamp', order: 'desc' },
  ({ id, value, action }) => {
    if (action === 'added') appendCard(id, value)
    else if (action === 'updated') updateCard(id, value)
    else if (action === 'removed') removeCard(id)
  }
)
subscriptions.currentView = unsubscribe
```

**Key principles:**

1. **Callback = real-time mode** - When you pass a callback to `db.map()`, it enables real-time subscriptions
2. **No callback = static query** - Without callback, `db.map()` returns results once and never updates
3. **Store unsubscribe** - Always store the `unsubscribe` function to cancel when switching views
4. **Cancel on view change** - Call `unsubscribe()` before creating new subscription to prevent memory leaks

```javascript
// Subscription management pattern
const subscriptions = { explore: null, inventory: null, offers: null }

function cancelSubscription(view) {
  if (subscriptions[view]) {
    subscriptions[view]()
    subscriptions[view] = null
  }
}

async function loadExploreView() {
  cancelSubscription('explore')  // Cancel previous

  const { results, unsubscribe } = await db.map(
    queryOptions,
    ({ id, value, action }) => {
      // Handle real-time updates
    }
  )

  subscriptions.explore = unsubscribe  // Store for later cleanup
}
```

**Exception:** Scroll pagination (append/prepend) can use `realtime: false` since those are one-time operations:

```javascript
// Scroll append - one-time query, no subscription needed
const { results } = await db.map({ ...queryOptions, realtime: false })
```

---

## Modular Architecture (app-core.js)

> **app-core.js has been modularized from 4,716 to 577 lines (87.8% reduction).**

### Module Structure

```
lib/marketplace/js/
├── app-core.js              (577 lines - orchestrator)
├── store/
│   └── appState.js          (centralized state container)
├── core/                    (30+ files - utilities & logic)
│   ├── constants.js         (DB_NAME, NO_IMAGE, ITEMS_PER_PAGE)
│   ├── database.js          (GenosDB initialization)
│   ├── user.js              (CURRENT_USER management)
│   ├── time.js              (formatTimeRemaining, countdown)
│   ├── subscriptions.js     (view subscriptions management)
│   ├── cache.js             (clearAllCache)
│   ├── pagination/          (state, persistence, handlers)
│   ├── filters/             (state, query, counts, ui, listeners)
│   ├── rendering/           (utils, headers)
│   ├── analytics/           (activity, stats, chart)
│   ├── blockchain/          (sync, index)
│   └── init/                (appInitializer, inventoryNavigation, viewDispatcher)
└── modules/                 (25+ files - UI rendering)
    ├── explore/             (persistence, viewMode, reset, rendering, loading)
    ├── views/               (pagination, loaders, subscriptions)
    ├── inventory/           (viewMode, grouping, rendering)
    ├── collections/         (viewMode, rendering)
    ├── offers/              (rendering)
    ├── stats/               (rendering)
    └── batch/               (batch mode operations)
```

### Pattern: appState + Dependency Injection

All modules use a centralized state container (`store/appState.js`) and receive dependencies via init functions:

```javascript
// store/appState.js - centralized mutable state
export const appState = {
  viewPagination: { inventory: {}, offers: {}, activity: {}, collections: {} },
  elements: null,  // DOM references
  exploreViewMode: 'grid',
  inventoryViewMode: 'grid',
  inventoryGroupsCache: new Map(),
  expandedGroupKey: null,
  // ...
}

// Modules use appState + init for dependencies
import { appState } from '../../store/appState.js'

let db = null
export function initInventoryRendering(deps) {
  db = deps.db
}

export function createInventoryCard(item) {
  // Uses appState and injected db
}
```

### Benefits

1. **AI-friendly**: Small, focused modules are easier to analyze and debug
2. **Maintainability**: Changes isolated to specific modules
3. **Testing**: Each module can be unit tested independently
4. **Performance**: Lazy loading potential for unused modules

See [js/core/EXTRACTION_LOG.md](./js/core/EXTRACTION_LOG.md) for complete extraction history.

---

## Production Architecture

> **IMPORTANT: This is production code. All operations execute real blockchain transactions.**

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                 PRODUCTION ARCHITECTURE (Polygon)                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    MARKETPLACE UI                         │   │
│  │  lib/marketplace/js/ (modular, lazy-loaded)              │   │
│  │  - Wizards (buy, sell, edit, offer, auction, bundle)     │   │
│  └────────────────────────┬─────────────────────────────────┘   │
│                           │                                      │
│  ┌────────────────────────▼─────────────────────────────────┐   │
│  │              BLOCKCHAIN SERVICE                           │   │
│  │  js/services/blockchain.js                               │   │
│  │  - executeTx() → real TX via BlockchainManager            │   │
│  │  - No simulation, no mocks, no local-only shortcuts      │   │
│  └────────────────────────┬─────────────────────────────────┘   │
│                           │                                      │
│  ┌────────────────────────▼─────────────────────────────────┐   │
│  │              BLOCKCHAIN MANAGER                           │   │
│  │  lib/blockchain/BlockchainManager.js                     │   │
│  │  - ethers.js for contract interaction                    │   │
│  │  - Signer management (wallet connection)                 │   │
│  │  - MarketplaceCache (TTL-based)                          │   │
│  │  - Multicall3 batch optimization                         │   │
│  └────────────────────────┬─────────────────────────────────┘   │
│                           │                                      │
│  ┌────────────────────────▼─────────────────────────────────┐   │
│  │           SMART CONTRACTS (UUPS Upgradeable)             │   │
│  │                                                           │   │
│  │  OVGMarketplace ─── Listings, Auctions, Bids, Bundles    │   │
│  │  OVGAssets ──────── ERC-1155 NFTs with royalties         │   │
│  │  OVGToken ───────── ERC-20 native token (OVG)            │   │
│  │  OVGMetadata ────── On-chain metadata (v2.4.0)           │   │
│  │  OVGForwarder ───── Meta-transactions (ERC-2771)         │   │
│  │  OVGPaymaster ───── Gas sponsoring                       │   │
│  │  OVGLandClaim ───── Land claiming system                 │   │
│  └────────────────────────┬─────────────────────────────────┘   │
│                           │                                      │
│  ┌────────────────────────▼─────────────────────────────────┐   │
│  │              POLYGON BLOCKCHAIN                           │   │
│  │  - Amoy Testnet (Chain ID: 80002)                        │   │
│  │  - Mainnet (Chain ID: 137)                               │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              GENOSDB (Local Cache + P2P Sync)             │   │
│  │  - IndexedDB persistence (survives refresh)              │   │
│  │  - P2P sync via GenosRTC (multi-tab/device)              │   │
│  │  - Real-time subscriptions (db.map with callback)        │   │
│  │  - Populated by blockchain sync, NOT source of truth     │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

> See [POLYGON_IMPLEMENTATION.md](./POLYGON_IMPLEMENTATION.md#contract-addresses) for all contract addresses (Mainnet + Testnet).

### GenosDB Role in Production

GenosDB serves as a **local read cache** and **P2P sync layer**, NOT as a source of truth:

```
READ PATH (instant):
UI ────▶ GenosDB ────▶ Render (<500ms)

WRITE PATH (blockchain-first):
UI ────▶ executeTx() ────▶ BlockchainManager ────▶ Polygon TX
   ────▶ Success ────▶ GenosDB ────▶ UI

SYNC:
Blockchain Events ────▶ GenosDB Update ────▶ UI Reactivity
P2P (GenosRTC) ────▶ GenosDB Merge ────▶ UI Reactivity

REFRESH:
[Refresh Button] ────▶ Blockchain Query ────▶ Overwrite Local
```

### Toast Notification Flow

All operations use `executeTx()` which calls `BlockchainManager` directly:

```
┌─────────────────────────────────────────────────────────────────┐
│                    TOAST NOTIFICATION FLOW                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  User Action (e.g., "Buy Now")                                  │
│         │                                                        │
│         ▼                                                        │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  executeTx() in blockchain.js                            │    │
│  │                                                           │    │
│  │  STEP 1: showToast('info', 'Processing',                 │    │
│  │                    'Saving to blockchain...')             │    │
│  │         │                                                 │    │
│  │         ▼                                                 │    │
│  │  BlockchainManager.method() → real Polygon TX             │    │
│  │         │                                                 │    │
│  │         ├── SUCCESS ────────────────────┐                │    │
│  │         │                               │                 │    │
│  │         │   STEP 2: showToast('info',   │                 │    │
│  │         │   'Processing',               │                 │    │
│  │         │   'Saving local data...')     │                 │    │
│  │         │         │                     │                 │    │
│  │         │         ▼                     │                 │    │
│  │         │   onSuccess(result, params)   │                 │    │
│  │         │   → db.put() to GenosDB       │                 │    │
│  │         │         │                     │                 │    │
│  │         │         ▼                     │                 │    │
│  │         │   STEP 3: showToast('success',│                 │    │
│  │         │   'Complete', successMsg)     │                 │    │
│  │         │                               │                 │    │
│  │         └── FAILURE ────────────────────┤                │    │
│  │                                         │                 │    │
│  │                     showToast('error',  │                 │    │
│  │                     'Error', errorMsg)  │                 │    │
│  │                     → No db.put()       │                 │    │
│  │                                         │                 │    │
│  └─────────────────────────────────────────┘                 │    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### executeTx() Implementation

```javascript
// js/services/blockchain.js

export async function executeTx(action, params = {}, options = {}, onSuccess = null) {
  const { successMsg = 'Transaction successful!' } = options

  const overlay = document.getElementById('loadingOverlay')
  overlay?.classList.add('active')

  try {
    // STEP 1: Blockchain operation (real TX via BlockchainManager)
    showToast('info', 'Processing', 'Saving to blockchain...')
    const bm = await getBlockchainManager()
    const method = methods[action]  // Maps to bm.purchaseAsset(), bm.createListing(), etc.
    const receipt = await method()
    const result = { success: true, txHash: receipt?.hash, action, params, receipt }

    // STEP 2: GenosDB local write (ONLY if blockchain succeeded)
    if (onSuccess && typeof onSuccess === 'function') {
      showToast('info', 'Processing', 'Saving local data...')
      await onSuccess(result, params)
    }

    // STEP 3: Complete
    overlay?.classList.remove('active')
    showToast('success', 'Complete', successMsg)
    window.refreshCurrentView?.()

    return result
  } catch (error) {
    overlay?.classList.remove('active')
    showToast('error', 'Error', parseBlockchainError(error))
    throw error
  }
}
```

### Wizard Pattern (Correct Implementation)

All wizards follow this pattern to ensure proper toast flow:

```javascript
// Example: buyWizard.js

export async function submit() {
  // Validation...

  // Two-step confirmation: first click shows "Confirm", second executes
  if (!confirmMode) {
    confirmMode = true
    btn.textContent = 'Confirm'
    btn.classList.add('mp-btn-warning')
    return
  }

  // Close modal BEFORE blockchain call
  resetConfirmState()
  closeModal(MODAL_ID)

  // Let executeTx handle all toasts
  try {
    await blockchain.buy(currentListing.id, currentListing.price)
  } catch (error) {
    // Error toast shown by blockchain.js - no action needed here
  }
}
```

#### What NOT to do:

```javascript
// ❌ WRONG - Don't call processBlockchainTx (removed)
processBlockchainTx(MODAL_ID, 'Success!', 'Message')

// ❌ WRONG - Don't manually show toasts in wizards
showToast('success', 'Done', 'Purchase complete')
await blockchain.buy(...)  // This already shows toasts!

// ❌ WRONG - Don't keep modal open during blockchain call
await blockchain.buy(...)
closeModal(MODAL_ID)  // Too late, toasts overlap with modal
```

## Unified Status Model

> **Core Architecture Decision:** Single `status` field replaces dual-state tracking (`listed`/`listingType`).

### Why Unified Status?

Previously, the system used multiple fields to track item state:
```javascript
// OLD - Problematic dual-state model
{
  listed: true,           // Boolean
  listingType: 'sale',    // String when listed
  status: 'active'        // Separate status field
}
```

This caused issues:
- Ambiguous states (`listed: true` but `listingType: null`)
- Complex filtering logic
- Real-time sync inconsistencies
- Duplicate state tracking

### New Unified Model

```javascript
// NEW - Single status field
{
  status: 'sale'  // One field captures everything
}
```

### Status Values

| Status | Description | Explore View | Inventory View |
|--------|-------------|--------------|----------------|
| `unlisted` | Not on market | Hidden | Visible (normal) |
| `sale` | Direct sale listing | Visible | Visible (translucent + Edit) |
| `rent` | Rental listing | Visible | Visible (translucent + Edit) |
| `auction` | Timed auction | Visible | Visible (translucent + Edit) |
| `bundle` | Part of bundle | Visible | Visible (translucent + Edit) |
| `rented-in` | Rented from another user | Hidden | Visible (special badge) |

### Data Structure Example

```javascript
// Complete asset with unified status (simplified model - no dataType needed)
{
  status: 'sale',           // ← Single source of truth for assets
  title: 'Genesis Land #42',
  collection: 'Genesis Plaza',
  price: '1.5 OVG',
  priceNum: 1.5,
  owner: '0x7a3d...8f2e',
  seller: '0x7a3d...8f2e',
  category: 'land',
  rarity: 'rare',
  image: 'https://...',
  listedAt: 1706400000000,
  timestamp: 1706400000000
}
```

### Status Transitions

```
┌──────────────────────────────────────────────────────────────┐
│                    STATUS TRANSITIONS                         │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  unlisted ──────┬──────▶ sale ──────▶ unlisted (sold/cancel) │
│                 │                                             │
│                 ├──────▶ rent ──────▶ unlisted (ended/cancel)│
│                 │                                             │
│                 ├──────▶ auction ──▶ unlisted (ended/cancel) │
│                 │                                             │
│                 └──────▶ bundle ───▶ unlisted (sold/cancel)  │
│                                                               │
│  External: ─────────────▶ rented-in ▶ (expires automatically)│
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

### Backward Compatibility

For existing data without the `status` field:

```javascript
// Compatibility layer in app-core.js
const normalizeStatus = (data) => {
  // Already has unified status
  if (data.status) return data.status

  // Migrate from old schema
  if (data.isBundle) return 'bundle'
  if (data.listed === true) return data.listingType || 'sale'
  return 'unlisted'
}
```

---

## Filter Flow: Explore vs Inventory

> **Design Principle:** Both views use the same data source, only filtered differently by `status` and `owner`.

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    SINGLE DATA SOURCE                        │
│            Assets identified by 'status' field               │
│                   owner: CURRENT_USER                        │
├─────────────────────────────────────────────────────────────┤
│                           │                                  │
│           ┌───────────────┴───────────────┐                 │
│           │                               │                  │
│           ▼                               ▼                  │
│    ┌──────────────┐              ┌──────────────┐           │
│    │   EXPLORE    │              │  INVENTORY   │           │
│    │    VIEW      │              │    VIEW      │           │
│    ├──────────────┤              ├──────────────┤           │
│    │ Filter:      │              │ Filter:      │           │
│    │ status !==   │              │ owner ===    │           │
│    │ 'unlisted'   │              │ CURRENT_USER │           │
│    └──────────────┘              └──────────────┘           │
│           │                               │                  │
│           ▼                               ▼                  │
│    Shows: sale,                  Shows: ALL items            │
│    rent, auction,                (listed = translucent)      │
│    bundle items                                              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Query Construction

```javascript
// Simplified model - no dataType needed, filter by status/owner

function buildFilterQuery(view) {
  if (view === 'inventory') {
    return { owner: CURRENT_USER }
  }
  // Explore: query all, filter client-side by status
  return {}
}
```

### Why Client-Side Filtering?

For real-time sync to work correctly when status changes, we filter client-side:

```javascript
// Single subscription for all data, filter client-side
db.map({ query: {} }, ({ id, value, action }) => {
  // Skip non-asset records (activities have 'type' field)
  if (value?.type) return

  // Filter by status for different views
  const isListed = value?.status && value.status !== 'unlisted'

  if (currentView === 'explore' && !isListed) {
    removeCard(id)
  } else {
    updateCard(id, value)
  }
})
```

### Filter Implementation

```javascript
// app-core.js - Real-time subscription with client-side filtering

async function setupRealtimeSync() {
  await db.map(
    { query: {}, field: 'timestamp', order: 'desc' },
    ({ id, value, action }) => {
      // Skip non-asset records (activities have 'type' field)
      if (value?.type) return

      const isListed = value?.status && value.status !== 'unlisted'

      if (action === 'removed') {
        removeCardFromAllViews(id)
        return
      }

      // Explore view: only listed items
      if (currentView === 'explore') {
        if (isListed) {
          updateOrAddCard(id, value)
        } else {
          removeCard(id)
        }
      }

      // Inventory view: user's items only
      if (currentView === 'inventory' && value.owner === CURRENT_USER) {
        updateOrAddCard(id, value)
        if (isListed) markAsListed(id)
      }
    }
  )
}
```

### Visual Differentiation

```css
/* Inventory: Listed items appear translucent */
.mp-card.listed {
  opacity: 0.7;
}

/* Inventory: Listed items show Edit instead of List */
.mp-card.listed .mp-card-list-btn { display: none; }
.mp-card.listed .mp-card-edit-btn { display: flex; }
```

---

## Real-Time Updates with Client-Side Filtering

> **Core Pattern:** Query broadly, filter narrowly, let `db.map()` handle state changes.

### The Problem

When using status-based queries, items that change status "disappear" from subscriptions:

```javascript
// Subscription with status filter
db.map({ status: 'sale' }, callback)

// User cancels listing → status changes to 'unlisted'
// db.map() STOPS tracking this item
// No 'removed' action fired - item just vanishes
```

### The Solution

Query all data, handle filtering in the callback:

```javascript
// realtime.js

export async function subscribeToListings(db, onUpdate) {
  // Query ALL data, filter client-side
  await db.map(
    { query: {} },
    ({ id, value, action }) => {
      // Skip activities (have 'type' field)
      if (value?.type) return

      // Client-side filter: is this item listed?
      const isListed = value?.status && value.status !== 'unlisted'

      if (action === 'initial' || action === 'added') {
        if (isListed) onUpdate('add', id, value)
      }
      else if (action === 'updated') {
        if (isListed) {
          onUpdate('update', id, value)
        } else {
          onUpdate('remove', id, value)
        }
      }
      else if (action === 'removed') {
        onUpdate('remove', id, value)
      }
    }
  )
}
```

### Action Types Explained

| Action | When Fired | Use Case |
|--------|------------|----------|
| `initial` | First load, existing data | Populate initial view |
| `added` | New item created | Add card to grid |
| `updated` | Existing item modified | Update card or remove if status changed |
| `removed` | Item deleted from DB | Remove card |

### Important: Handling `removed` Action

When `db.remove(id)` is called, the callback receives `action: 'removed'` but **`value` may be null or undefined** because the item no longer exists. This requires special handling:

```javascript
// WRONG - value check before handling removed will skip deletions
db.map({ query: {} }, ({ id, value, action }) => {
  if (!value || !isValidRecord(value)) return  // ❌ Skips removed items!
  // Never reaches removal handling!
})

// CORRECT - Handle removed FIRST, before any value checks
db.map({ query: {} }, ({ id, value, action }) => {
  // Handle removal first (value may be null/undefined)
  if (action === 'removed') {
    triggerReRender()  // Re-query GenosDB and re-render
    return
  }

  // Now safe to check value for other actions
  if (!value || !isValidRecord(value)) return

  // Handle initial, added, updated - trigger re-render
  if (action !== 'initial') {
    triggerReRender()
  }
})
```

This pattern ensures that `db.remove()` calls properly update the UI in real-time.

### No Local Cache Pattern (Todo-List Style)

Following the pattern from `advanced-todolist.html`, the marketplace does NOT maintain a local cache. Instead:

1. **Single persistent subscription** for realtime change detection
2. **Query GenosDB directly** when rendering views (no intermediate cache)
3. **Re-render on changes** - when subscription detects changes, re-query and re-render

```javascript
// Get all assets directly from GenosDB (no cache)
async function getAllAssets() {
  const { results } = await db.map({ query: {}, field: 'timestamp', order: 'desc' })
  return results.filter(r => isAssetRecord(r.value)).map(r => ({ id: r.id, value: r.value }))
}

// Apply filters by querying GenosDB directly
async function applyExploreFilters() {
  const allItems = await getAllAssets()
  const filteredItems = allItems.filter(itemPassesExploreFilters)
  // ... sort, paginate, render
}

// Subscription only triggers re-renders, doesn't maintain cache
await db.map(
  { query: {}, field: 'timestamp', order: 'desc' },
  ({ id, value, action }) => {
    if (action === 'removed') {
      triggerReRender()
      return
    }
    if (!isAssetRecord(value)) return
    if (action !== 'initial') {
      triggerReRender()
    }
  }
)
```

Benefits of this pattern:
- **Simpler code** - no cache synchronization logic needed
- **Always fresh data** - queries return current state from GenosDB
- **No stale data bugs** - cache can't get out of sync
- **GenosDB handles persistence** - data survives page refresh automatically

### Complete Real-Time Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    REAL-TIME UPDATE FLOW                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. User clicks "Cancel Listing" on item                    │
│                    │                                         │
│                    ▼                                         │
│  2. blockchain.cancelListing(itemId)                        │
│     → db.put({ ...asset, status: 'unlisted' }, itemId)      │
│                    │                                         │
│                    ▼                                         │
│  3. GenosDB fires db.map() callback                         │
│     → action: 'updated'                                      │
│     → value.status: 'unlisted'                              │
│                    │                                         │
│                    ▼                                         │
│  4. Client-side filter checks: isListed = false             │
│                    │                                         │
│           ┌───────┴───────┐                                 │
│           │               │                                  │
│           ▼               ▼                                  │
│     Explore View    Inventory View                          │
│     removeCard(id)  updateCard(id)                          │
│     (item gone)     (remove translucent)                    │
│                                                              │
│  5. P2P sync broadcasts change to other tabs/devices        │
│     → Same flow repeats on all connected clients            │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Example: List Asset Flow

```javascript
// blockchain.js - List an asset for sale

export async function list(itemData, params) {
  const db = getDb()
  const assetId = itemData.id  // Hash from data-item-id

  // 1. Get current asset state
  const asset = await getNodeValue(assetId)
  if (!asset) throw new Error('Asset not found')

  // 2. Update asset directly with listing info (simplified - no separate listing record)
  await db.put({
    ...asset,
    status: params.type,        // 'sale', 'rent', 'auction'
    price: `${params.price} OVG`,
    priceNum: parseFloat(params.price),
    seller: getCurrentUser(),
    listedAt: Date.now()
  }, assetId)

  // 3. db.map() automatically fires:
  //    - Explore view: adds card (status !== 'unlisted')
  //    - Inventory view: updates card (adds translucent style)
  //    - Other tabs: receive update via P2P

  return { success: true }
}
```

### Example: Cancel Listing Flow

```javascript
// blockchain.js - Cancel a listing

export async function cancelListing(itemData) {
  const db = getDb()
  const assetId = itemData.id  // Hash from data-item-id

  // 1. Get current asset state
  const asset = await getNodeValue(assetId)
  if (!asset) throw new Error('Asset not found')

  // 2. Update asset - set status to 'unlisted' (simplified - no separate listing)
  await db.put({
    ...asset,
    status: 'unlisted',
    price: null,
    priceNum: null,
    seller: null
  }, assetId)

  // 3. db.map() automatically fires:
  //    - Explore view: removes card (status === 'unlisted')
  //    - Inventory view: updates card (removes translucent style)

  return { success: true }
}
```

---

## Hybrid Pagination

> **Reference:** See `pagination-example.html` in `/docs/genosdb/` for the canonical implementation pattern.

The Marketplace uses a **hybrid pagination** system that combines:
1. **Infinite scroll** - Appends items as user scrolls down
2. **Page buttons** - Direct navigation to specific pages
3. **Cursor-based queries** - GenosDB `$after` parameter for efficient loading

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    HYBRID PAGINATION                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                    loadItems()                        │   │
│  │           Single function handles ALL cases           │   │
│  └──────────────────────────────────────────────────────┘   │
│         │                    │                    │          │
│         ▼                    ▼                    ▼          │
│    ┌─────────┐         ┌─────────┐         ┌─────────┐      │
│    │ Normal  │         │ Append  │         │ Prepend │      │
│    │  Load   │         │ (scroll │         │ (scroll │      │
│    │         │         │  down)  │         │   up)   │      │
│    └─────────┘         └─────────┘         └─────────┘      │
│         │                    │                    │          │
│         ▼                    ▼                    ▼          │
│    Clear grid          Add to end          Add to start     │
│    + observers         of grid             of grid          │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              IntersectionObserver                     │   │
│  │    Tracks visible items → Updates currentPage         │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Core Pattern: Single Load Function

Following the `pagination-example.html` pattern, ALL load operations use a single unified function:

```javascript
/**
 * Unified item loader - handles normal, append, and prepend operations
 * @param {object} options - Load options
 * @param {number} options.pageToLoad - Page number to load
 * @param {boolean} options.append - Append to end (scroll down)
 * @param {boolean} options.prepend - Prepend to start (scroll up)
 * @param {number} options.restoreScrollTop - Scroll position to restore after prepend
 */
async function loadItems({ pageToLoad, append = false, prepend = false, restoreScrollTop = 0 }) {
  if (isLoading) return

  // Prevent duplicate page loads
  const isAlreadyLoaded = [...elements.gridContainer.children]
    .some(el => parseInt(el.dataset.page) === pageToLoad)
  if ((append || prepend) && isAlreadyLoaded) return

  isLoading = true
  lastBatchResultCount = 0

  // Reset noMoreItems flag only for fresh loads
  if (!append && !prepend) {
    noMoreItemsToLoad = false
  }

  // Cursor verification: page N requires cursor from page N-1
  if (pageToLoad > 1) {
    const cursor = pageLastItemCursors[pageToLoad - 1]
    if (!cursor) {
      // Handle missing cursor - reset to page 1 if needed
      if (!append && !prepend && currentPage > 1 && Object.keys(pageLastItemCursors).length === 0) {
        pageToLoad = 1
      } else {
        isLoading = false
        if (append) noMoreItemsToLoad = true
        updatePaginationControls()
        return
      }
    }
  }

  // Build GenosDB query with cursor pagination
  const queryOptions = {
    query: buildViewQuery('explore'),
    field: filters.sortField,
    order: filters.sortOrder,
    $limit: ITEMS_PER_PAGE,
    $after: pageToLoad > 1 ? pageLastItemCursors[pageToLoad - 1] : null
  }

  try {
    const { results } = await db.map(queryOptions)
    lastBatchResultCount = results.length

    // CRITICAL: Clear tracking maps for fresh loads
    if (!append && !prepend) {
      elements.gridContainer.innerHTML = ''
      renderedItems.explore.clear()
      itemsCurrentlyInView.clear()
      visibleItemsMap.clear()  // Prevents stale observer data
    }

    // Render items with page marker
    results.forEach((item, index) => {
      const card = createCard(item.id, item.value)
      card.dataset.page = pageToLoad

      if (prepend) {
        elements.gridContainer.insertBefore(card, elements.gridContainer.firstChild)
      } else {
        elements.gridContainer.appendChild(card)
      }

      // Save cursor for last item of each page
      if (index === results.length - 1) {
        pageLastItemCursors[pageToLoad] = item.id
      }
    })

    // Update state
    currentPage = pageToLoad
    if (pageToLoad > maxKnownPage) maxKnownPage = pageToLoad

    // Setup observers for infinite scroll
    setupIntersectionObservers()

  } finally {
    isLoading = false
    updatePaginationControls()

    if (restoreScrollTop > 0 && elements.scrollContainer) {
      elements.scrollContainer.scrollTop = restoreScrollTop
    }
  }
}
```

### Key Implementation Details

#### 1. Cursor Storage

Each page's last item cursor is stored for forward/backward navigation:

```javascript
// Store cursors by page number
const pageLastItemCursors = {}  // { 1: 'hash1', 2: 'hash2', ... }

// Save cursor when rendering last item of page
if (index === results.length - 1) {
  pageLastItemCursors[pageToLoad] = item.id
}

// Use cursor for next page query
$after: pageToLoad > 1 ? pageLastItemCursors[pageToLoad - 1] : null
```

#### 2. IntersectionObserver for Visible Page Tracking

Tracks which items are visible to update `currentPage`:

```javascript
const visibleItemsMap = new Map()  // id → page number

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    const id = entry.target.dataset.itemId
    const page = parseInt(entry.target.dataset.page)

    if (entry.isIntersecting) {
      visibleItemsMap.set(id, page)
    } else {
      visibleItemsMap.delete(id)
    }
  })

  // Update currentPage based on most common visible page
  if (visibleItemsMap.size > 0) {
    const pages = [...visibleItemsMap.values()]
    const mostCommonPage = mode(pages)
    if (mostCommonPage !== currentPage) {
      currentPage = mostCommonPage
      updatePaginationControls()
    }
  }
}, { threshold: 0.1 })
```

#### 3. Critical: Clear visibleItemsMap on Fresh Loads

When loading a new page (not append/prepend), clear all tracking maps:

```javascript
if (!append && !prepend) {
  elements.gridContainer.innerHTML = ''
  renderedItems.explore.clear()
  itemsCurrentlyInView.clear()
  visibleItemsMap.clear()  // CRITICAL: prevents stale observer data
}
```

**Why?** Without clearing `visibleItemsMap`, clicking "Page 6" while on page 5 would:
1. Load page 6 correctly
2. But observer still has stale entries from pages 1-5
3. `mode()` calculation returns wrong page number
4. UI shows incorrect current page

#### 4. Scroll Triggers

```javascript
// Scroll down → append next page
function handleScrollDown() {
  if (noMoreItemsToLoad) return
  const nextPage = maxKnownPage + 1
  loadItems({ pageToLoad: nextPage, append: true })
}

// Scroll up → prepend previous page
function handleScrollUp() {
  const firstCard = elements.gridContainer.querySelector('[data-page]')
  const firstPage = parseInt(firstCard?.dataset.page) || 1
  if (firstPage <= 1) return

  const scrollTop = elements.scrollContainer.scrollTop
  loadItems({ pageToLoad: firstPage - 1, prepend: true, restoreScrollTop: scrollTop })
}

// Page button click → fresh load
function handlePageClick(page) {
  loadItems({ pageToLoad: page })  // No append/prepend = fresh load
}
```

### Pagination State Per View

Each view maintains independent pagination state:

```javascript
const viewPagination = {
  explore: { currentPage: 1, maxKnownPage: 1, cursors: {} },
  inventory: { currentPage: 1, maxKnownPage: 1, cursors: {} },
  offers: { currentPage: 1, maxKnownPage: 1, cursors: {} },
  activity: { currentPage: 1, maxKnownPage: 1, cursors: {} }
}

function saveViewPaginationState(view) {
  viewPagination[view] = {
    currentPage,
    maxKnownPage,
    cursors: { ...pageLastItemCursors }
  }
}

function loadViewPaginationState(view) {
  const state = viewPagination[view]
  currentPage = state.currentPage
  maxKnownPage = state.maxKnownPage
  Object.assign(pageLastItemCursors, state.cursors)
}
```

### Filter Integration

When filters change, reset pagination and reload:

```javascript
function onFilterChange() {
  // Reset pagination state
  currentPage = 1
  maxKnownPage = 1
  Object.keys(pageLastItemCursors).forEach(k => delete pageLastItemCursors[k])

  // Fresh load with new filters
  loadItems({ pageToLoad: 1 })
}
```

### GenosDB Query Parameters

| Parameter | Description | Example |
|-----------|-------------|---------|
| `$limit` | Items per page | `20` |
| `$after` | Cursor for next page | `'hash123...'` |
| `field` | Sort field | `'timestamp'` |
| `order` | Sort direction | `'desc'` |
| `query` | Filter conditions | `{ status: { $in: ['sale', 'rent'] } }` |

### Common Issues and Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| Page jumps to wrong number | Stale `visibleItemsMap` | Clear `visibleItemsMap` on fresh loads |
| Can't go back after refresh | Missing cursors | Reset to page 1 if cursors empty |
| Duplicate items in grid | Same page loaded twice | Check `isAlreadyLoaded` before append/prepend |
| Observer triggers wrong page | Multiple pages visible | Use `mode()` to find most common page |

---

## Code Patterns

### Write Operations Flow (Critical Rule)

> **IMPORTANT:** All write operations MUST follow this exact flow. No exceptions.

```
┌─────────────────────────────────────────────────────────────┐
│                    WRITE OPERATIONS FLOW                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. User Action (click button)                              │
│         │                                                    │
│         ▼                                                    │
│  2. Connect to Blockchain                                   │
│     └── executeTx() → BlockchainManager → Polygon TX        │
│         │                                                    │
│         ├── SUCCESS ────────────────┐                       │
│         │                           │                        │
│         │                           ▼                        │
│         │                  3. db.put() to GenosDB            │
│         │                     └── Write to local database   │
│         │                           │                        │
│         │                           ▼                        │
│         │                  4. db.map() reacts                │
│         │                     └── UI updates automatically  │
│         │                                                    │
│         └── FAILURE ────────────────┐                       │
│                                     │                        │
│                                     ▼                        │
│                            Show error TOAST                  │
│                            └── No db.put(), no UI change    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

#### Rules:

1. **Blockchain first** - Always connect to blockchain before writing to GenosDB
2. **Success → db.put()** - Only write to GenosDB if blockchain transaction succeeds
3. **Failure → TOAST only** - Show error notification, do nothing else
4. **db.map() handles UI** - Never manually update DOM after db.put()
5. **No console.log** - Keep operations silent (errors only)

#### Example: Accept Offer

```javascript
// handlers/offers.js - User clicks "Accept"
export async function acceptOffer(offerElement, offerId) {
  try {
    await blockchain.acceptOffer(offerId, bidder)
    // SUCCESS: db.put() happened inside, db.map() updates UI
  } catch (error) {
    // FAILURE: Show toast, nothing else
    showToast('error', 'Error', error.message)
  }
}

// services/blockchain.js
async acceptOffer(offerId, bidder) {
  return executeTx('acceptOffer', { offerId, bidder }, {
    loadingMsg: 'Connecting to blockchain...',
    successMsg: 'Offer accepted!'
  }, async () => {
    // This callback ONLY runs if blockchain tx succeeds
    const { result: offer } = await db.get(offerId)
    await db.put({ ...offer, status: 'accepted' }, offerId)
  })
}

// app-core.js - db.map() subscription
await db.map(queryOptions, ({ id, value, action }) => {
  if (action === 'updated') {
    // UI updates here automatically
    existingEl.replaceWith(createOfferTableRow(id, value))
  }
})
```

#### Anti-Patterns (DO NOT DO):

```javascript
// WRONG - Write to GenosDB before blockchain confirms
async function acceptOffer(id) {
  await db.put({ ...offer, status: 'accepted' }, id)  // NO! Blockchain first
  await blockchain.sendTx()
}

// WRONG - Manual UI update
async function acceptOffer(id) {
  await blockchain.acceptOffer(id)
  document.querySelector(`[data-item-id="${id}"]`).remove()  // NO! db.map() handles this
}

// WRONG - Console.log noise
async function acceptOffer(id) {
  console.log('Accepting...')  // NO!
  await blockchain.acceptOffer(id)
}
```

#### Example: Pending Offer Detection (In-Memory Set Pattern)

When a user places an offer, the UI must immediately reflect "Offer Pending" without waiting for a blockchain sync. This uses an in-memory `Set` that tracks assets with pending offers.

**Architecture:**

```
┌──────────────────────────────────────────────────────────────┐
│                 PENDING OFFER DETECTION                       │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│   window.pendingOfferAssets = Set<string>                    │
│        │                                                     │
│   Populated by:                                              │
│   1. placeOffer success → Set.add(tokenId)                  │
│   2. Refresh Sync → rebuilt from getUserGlobalBids()        │
│        │                                                     │
│   Cleared by:                                                │
│   1. withdrawOffer success → Set.delete(tokenId)            │
│        │                                                     │
│   Consumed by:                                               │
│   1. buyWizard.open() → Set.has(tokenId) → disable button   │
│   2. offerWizard.open() → Set.has(tokenId) → disable form   │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Key files:**

| File | Role |
|------|------|
| `services/blockchain.js` | Initialize Set, add on placeOffer, delete on withdrawOffer |
| `core/blockchain/sync.js` | Rebuild Set from `getUserGlobalBids()` during sync |
| `wizards/buyWizard.js` | Check Set to show "Offer Pending" / "Make Offer" |
| `wizards/offerWizard.js` | Check Set to disable form if pending offer exists |

**Implementation:**

```javascript
// services/blockchain.js - Initialize global Set
window.pendingOfferAssets = window.pendingOfferAssets ?? new Set()

// services/blockchain.js - placeOffer success callback
window.pendingOfferAssets?.add(String(tokenId))

// services/blockchain.js - withdrawOffer success callback
window.pendingOfferAssets?.delete(String(targetAssetId))

// core/blockchain/sync.js - Rebuild from blockchain during sync
const sentOffers = await bm.getUserGlobalBids(userAddress).catch(() => [])
window.pendingOfferAssets = new Set(sentOffers.map(o => String(o.assetId)))

// wizards/buyWizard.js & offerWizard.js - Check before showing button
// tokenId is guaranteed by producer (see Rule 8)
const hasPendingOffer = window.pendingOfferAssets?.has(listing.tokenId) ?? false
```

**⚠️ Critical: tokenId Type Boundary (Rule 8)**

Since the 2026-02-05 refactoring, all listing objects include a `tokenId` field as a **string** (guaranteed by `String()` wrapper in producers and sync). Consumers use `listing.tokenId` directly:

```javascript
// ✅ CORRECT - tokenId is always a string, Set contains strings
window.pendingOfferAssets.has(listing.tokenId)  // Set.has("1770259037734") → true

// ❌ WRONG - Without String() at producer, tokenId could be a Number from BlockchainManager
// Set.has(1770259037734) → false (Number ≠ String in Set strict equality)
```

**Why not `db.get()` or `db.map()` for this?**
- `db.get()` is async — adds unnecessary overhead for a simple boolean check
- `db.map()` subscriptions in modals create lifecycle complexity (subscribe/unsubscribe)
- The in-memory Set provides **O(1) synchronous lookups**, ideal for modal open/close
- The Set is rebuilt from blockchain truth on every sync, ensuring consistency

---

### Hash-Based Operations Pattern (Core Design)

> **Reference:** See `advanced-todolist.html` in the marketplace examples folder for the canonical implementation of this pattern.

GenosDB uses content-addressable hashes as unique identifiers. When using `db.map()`, each item receives an `id` (hash) that must be used for all subsequent operations on that item.

#### Principle 1: Store Hash in HTML Elements

```javascript
// In db.map() callback, store the hash in data-item-id
await db.map(
  { query: {} },
  ({ id, value, action }) => {
    // Skip non-assets (activities have 'type' field)
    if (value?.type) return

    // id = hash generated by GenosDB
    const card = document.createElement('div')
    card.dataset.itemId = id  // Store hash for future operations
    card.dataset.status = value.status
    // ... render card
  }
)
```

**Important:** Use `data-item-id` (not `data-id`) for consistency across the codebase. This maps to `element.dataset.itemId` in JavaScript.

#### Principle 2: Simple CRUD with Hash

All operations follow the same pattern: **get by hash → modify → put with hash**

```javascript
// READ - Get current state
const { result: item } = await db.get(id)

// UPDATE - Modify and save with same hash
await db.put({ ...item, completed: true }, id)

// DELETE - Remove by hash
await db.remove(id)
```

#### Principle 3: Let db.map() Handle UI Updates

Never manually update the UI after `db.put()`. The reactive subscription handles it automatically:

```javascript
// WRONG - Manual UI update
async function toggleComplete(id, item) {
  await db.put({ ...item, completed: !item.completed }, id)
  updateCardUI(id)  // DON'T DO THIS
}

// CORRECT - Let db.map() react
async function toggleComplete(id, item) {
  await db.put({ ...item, completed: !item.completed }, id)
  // db.map() callback will fire automatically with action: "updated"
}
```

#### Principle 4: Extract Hash from UI Elements

When user interacts with a card/row, extract the hash from `data-item-id`:

```javascript
function handleEditClick(btn) {
  const card = btn.closest('.mp-card')
  const id = card.dataset.itemId  // Hash from db.map()

  // Pass hash to wizard/modal
  openEditModal({
    id,  // Hash for GenosDB operations
    status: card.dataset.status,
    // ... other data from dataset
  })
}

// app-ui.js example
export function openEditFromCard(btn) {
  const card = btn.closest('.mp-card')
  if (!card) return
  const d = card.dataset
  const type = d.status  // Use unified status field
  openEditModal(type, {
    id: d.itemId,        // GenosDB hash
    name: d.title,
    price: d.price,
    status: d.status
  })
}
```

### Unified Status Model (Quick Reference)

> **See [Unified Status Model](#unified-status-model) section above for full documentation.**

Key points:
- Single `status` field: `unlisted`, `sale`, `rent`, `auction`, `bundle`, `rented-in`
- Client-side filtering for real-time reactivity
- `data-item-id` attribute stores GenosDB hash

```javascript
// Status check pattern
const isListed = item.status && item.status !== 'unlisted'

// Cancel listing pattern
await db.put({ ...asset, status: 'unlisted', price: null }, assetId)
```

#### db.map() Action Types

```javascript
await db.map(query, ({ id, value, action }) => {
  switch (action) {
    case 'initial':
      // First load - render all existing items
      renderCard(id, value)
      break
    case 'added':
      // New item created
      appendCard(id, value)
      break
    case 'updated':
      // Existing item modified - update or re-render
      updateCard(id, value)
      break
    case 'removed':
      // Item deleted
      removeCard(id)
      break
  }
})
```

## Quick Reference Cheatsheet

### Status Operations

```javascript
// Check if item is listed
const isListed = item.status && item.status !== 'unlisted'

// List an item
await db.put({ ...asset, status: 'sale', price, seller: CURRENT_USER }, assetId)

// Cancel listing
await db.put({ ...asset, status: 'unlisted', price: null }, assetId)

// Change listing type
await db.put({ ...asset, status: 'auction' }, assetId)
```

### HTML Data Attributes

```html
<!-- Card with hash stored in data-item-id -->
<div class="mp-card"
     data-item-id="abc123..."
     data-status="sale"
     data-title="Genesis Land #42"
     data-price="1.5 OVG">
</div>
```

```javascript
// Extract hash from card
const card = btn.closest('.mp-card')
const hash = card.dataset.itemId
const status = card.dataset.status
```

### Filter Patterns

```javascript
// Explore: only listed items (client-side filter)
if (value.status && value.status !== 'unlisted') {
  showInExplore(id, value)
}

// Inventory: all items, style listed differently
showInInventory(id, value)
if (value.status !== 'unlisted') {
  markAsListed(id)
}
```

### Real-Time Subscription

```javascript
// Single subscription for all data, filter client-side
await db.map(
  { query: {} },
  ({ id, value, action }) => {
    // Skip non-assets (activities have 'type' field)
    if (value?.type) return

    const isListed = value?.status !== 'unlisted'

    if (currentView === 'explore') {
      isListed ? updateCard(id, value) : removeCard(id)
    } else if (value.owner === CURRENT_USER) {
      updateCard(id, value)  // Inventory shows user's items
    }
  }
)
```

---

## Cache Management

### Clear All Cache (Settings → Admin)

The Clear Cache function clears both GenosDB and the in-memory MarketplaceCache:

```javascript
async function clearCache() {
  // 1. Clear in-memory MarketplaceCache (balances, listings, metadata)
  try {
    const { MarketplaceCache } = await import('/lib/blockchain/MarketplaceCache.js')
    MarketplaceCache.clear()
    console.log('[Settings] MarketplaceCache cleared')
  } catch (e) {
    console.warn('[Settings] MarketplaceCache not available:', e.message)
  }

  // 2. Clear GenosDB (all collections)
  const db = await getDb()
  if (db) {
    await db.clear()
    console.log('[Settings] GenosDB cleared')
  }

  // 3. Refresh view to reload from blockchain
  window.refreshCurrentView?.()
  showToast('success', 'Cache Cleared', 'Local data cleared. Refreshing from blockchain...')
}
```

### MarketplaceCache vs GenosDB

| Cache | Type | Data Stored | Persistence |
|-------|------|-------------|-------------|
| **MarketplaceCache** | In-memory (Map) | Balances, active listings, metadata | Session only |
| **GenosDB** | IndexedDB | Assets, activities, settings | Persistent |

Both must be cleared to ensure a clean state.

---

## Author

Esteban Fuster Pozzi (@estebanrfp) — Full Stack JavaScript Developer
