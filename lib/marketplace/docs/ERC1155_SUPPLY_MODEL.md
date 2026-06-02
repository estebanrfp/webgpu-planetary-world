# ERC-1155 Supply Management Model

> Supply management, inventory grouping, and batch operations for the OVGrid Marketplace.

## Related Documents

- [GENOSDB_INTEGRATION.md](./GENOSDB_INTEGRATION.md) — Data layer, AI rules, GenosDB patterns, pagination
- [POLYGON_IMPLEMENTATION.md](./POLYGON_IMPLEMENTATION.md) — Blockchain contracts, addresses, scripts, Multicall3

---

## Core Concepts

### Supply Field

Each asset record has a `supply` field representing the quantity of that specific record:

- **Unlisted assets**: `supply` = available copies the owner can list or transfer
- **Listed assets**: `supply` = copies available for purchase

### Record Splitting on Partial Listing

When an owner lists only part of their supply, the system creates **two separate records**:

```
BEFORE: Asset A (supply: 5, status: unlisted)

ACTION: List 2 copies for sale at 1.5 OVG

AFTER:
  - Asset A (supply: 3, status: unlisted)     → remaining inventory
  - Listing B (supply: 2, status: sale)       → for sale in marketplace
```

This ensures the inventory view always shows accurate available quantities.

## Operations

### Minting

Creates a new asset with the specified supply. A unique `tokenId` is generated that identifies ALL copies of this asset type (ERC-1155 standard):

```javascript
blockchain.mint({
  name: 'My NFT',
  description: 'A cool asset',
  collection: 'My Collection',
  royalty: 5,      // 0-25%, immutable after mint
  supply: 10,      // number of copies
  image: 'base64...'
})
```

**Result**: Single record with `tokenId: 1234567890, supply: 10, status: 'unlisted'`

#### tokenId Source

The `tokenId` is provided by the **OVGAssets.sol** smart contract after the mint transaction is confirmed. The contract's `mint(address account, uint256 id, uint256 amount, bytes data)` function uses `id` as the ERC-1155 token identifier that is stored as `tokenId` in GenosDB. If no tokenId is provided to the mint wizard, `Date.now()` is used as a fallback.

### Listing (Full)

When listing the entire supply:

```javascript
blockchain.list(assetId, 1.5, 'sale', { amount: 5 }) // amount = total supply
```

**Result**: Original record updated to `status: 'sale', supply: 5`

### Listing (Partial)

When listing only part of the supply:

```javascript
blockchain.list(assetId, 1.5, 'sale', { amount: 2 }) // amount < total supply
```

**Result**:
1. Original record: `supply: 3, status: 'unlisted'` (remaining)
2. New listing: `supply: 2, status: 'sale', originalAssetId: <original>` (for sale)

### Buying (Full)

When buying all available copies from a listing:

```javascript
blockchain.buy(listingId, price, 2) // amount = listing supply
```

**Result**:
1. Listing record: **removed**
2. Buyer record: `asset_${tokenId}_${buyer}` created or updated with `supply += buyAmount`

If buyer already owns copies of this tokenId, they are consolidated:
```
BEFORE:
  - Listing A (tokenId: 123, supply: 2, status: sale)
  - Buyer owns: asset_123_0xbuyer (supply: 3)

AFTER:
  - Listing A → removed
  - Buyer owns: asset_123_0xbuyer (supply: 5)  ← consolidated
```

### Buying (Partial)

When buying only some copies:

```javascript
blockchain.buy(listingId, price, 1) // amount < listing supply
```

**Result**:
1. Listing: `supply -= buyAmount` (remaining for sale)
2. Buyer record: `asset_${tokenId}_${buyer}` created or updated with `supply += buyAmount`

Same consolidation logic applies - buyer's existing holdings are updated, not duplicated.

### Canceling a Listing

When canceling a listing, supply returns to the original asset. The blockchain `listingId` is required.

```javascript
blockchain.cancelListing(genosDbId)
// Internally extracts listingId from stored record or blockchain lookup
```

**Process**:
1. Get `listingId` from GenosDB record (stored when listing was created)
2. If not stored, lookup active listing on blockchain by `tokenId`
3. Execute blockchain `cancelListing(listingId)`
4. Update GenosDB

**If listing has `originalAssetId`**:
1. Original asset: `supply += listing.supply`
2. Listing record: removed

**If full listing (no `originalAssetId`)**:
- Listing updated to `status: 'unlisted'`

### Batch Listing

List multiple items at once with a single gas payment. Each selected unit becomes an **individual listing** (supply=1) that can be edited or canceled independently.

```javascript
blockchain.batchList([
  { id: 'asset_123', price: 1.5 },
  { id: 'asset_123', price: 1.5 },  // Same asset, 2 units selected
  { id: 'asset_456', price: 2.0 }
])
```

**Process**:
1. Count units used per asset
2. Reduce supply of each source asset
3. Create individual listings (each with `supply: 1, originalAssetId`)

**Example - Batch List 2 units from asset with supply 5**:
```
BEFORE: Asset A (supply: 5, status: unlisted)

ACTION: Batch list 2 units at 1.5 OVG each

AFTER:
  - Asset A (supply: 3, status: unlisted)           → remaining inventory
  - Listing B (supply: 1, status: sale, price: 1.5) → individual listing
  - Listing C (supply: 1, status: sale, price: 1.5) → individual listing
```

> **Why individual listings?** Each listing can be edited or canceled independently. Grouping would force editing/canceling all units together.

### Creating a Bundle

Bundles combine multiple items into a single purchasable unit. Supply is managed correctly when bundling.

```javascript
blockchain.createBundle(assetIds, name, price, description)
// assetIds can include the same asset multiple times for multiple units
```

**Process**:
1. Execute blockchain transaction → get `bundleId` from `BundleListed` event
2. Count units used per asset (same asset can appear multiple times)
3. Reduce supply of each source asset
4. If all units used, mark asset as `status: 'bundled'`
5. Create bundle record with nodeId: `bundle_${bundleId}`

**Example - Bundle 2 units from asset with supply 5**:
```
BEFORE: Asset A (supply: 5, status: unlisted)

ACTION: Create bundle with 2 units of Asset A

AFTER:
  - Asset A (supply: 3, status: unlisted)  → remaining inventory
  - Bundle X (assetIds: [A, A], status: sale, price: 10)
```

**Example - Bundle all 5 units**:
```
BEFORE: Asset A (supply: 5, status: unlisted)

ACTION: Create bundle with 5 units of Asset A

AFTER:
  - Asset A (supply: 0, status: bundled, bundleId: X)  → fully bundled
  - Bundle X (assetIds: [A, A, A, A, A], status: sale)
```

### Canceling a Bundle

When canceling a bundle, supply is restored to original assets.

```javascript
blockchain.cancelBundle(bundleId)
```

**Process**:
1. Count units per asset in bundle's `assetIds`
2. Add bundled units back to each asset's supply
3. Reset asset status to `'unlisted'`
4. Remove bundle record

**Example**:
```
BEFORE:
  - Asset A (supply: 3, status: unlisted)
  - Bundle X (assetIds: [A, A], status: sale)

ACTION: Cancel Bundle X

AFTER:
  - Asset A (supply: 5, status: unlisted)  → supply restored
  - Bundle X → removed
```

## Identifier Model (Source of Truth)

The blockchain is always the **source of truth** for identifiers. GenosDB IDs are derived from blockchain IDs.

### Identifier Hierarchy

| ID Type | Source | Format | Purpose |
|---------|--------|--------|---------|
| `tokenId` | Blockchain (ERC-1155) | `1234567890` (numeric) | Identifies asset type |
| `listingId` | Blockchain (Marketplace) | `42` (numeric) | Identifies a sale/rent/auction |
| `bundleId` | Blockchain (Marketplace) | `7` (numeric) | Identifies a bundle |
| GenosDB nodeId | Derived | `asset_${tokenId}_${owner}` | Local cache record |

### GenosDB Node ID Formats

```javascript
// Owned assets (one record per tokenId - GenosDB is local to each user)
asset_${tokenId}                  // e.g., asset_1234567890

// Listings (derived from blockchain listingId)
listing_${listingId}              // e.g., listing_42

// Bundles (derived from blockchain bundleId)
bundle_${bundleId}                // e.g., bundle_7
```

> **Note:** GenosDB is local to each user, so there's no conflict between owners. Each user only sees their own data.

### Ownership Consolidation (ERC-1155 Compliant)

In ERC-1155, each user has **one balance per tokenId**. GenosDB follows the same model:

```
WRONG (multiple records with timestamps):
  asset_123_1706123456789  →  { supply: 2 }
  asset_123_1706123456999  →  { supply: 3 }

CORRECT (one record per tokenId):
  asset_123  →  { supply: 5 }
```

When a user purchases additional copies of the same tokenId, the supply is **added** to their existing record, not created as a new record.

### Blockchain ID Extraction

When creating listings or bundles, the blockchain ID is extracted from the transaction receipt:

```javascript
// Extract listingId from Listed event
const listedEvent = receipt.logs.find(log => {
  const parsed = marketplace.interface.parseLog(log)
  return parsed?.name === 'Listed'
})
const listingId = Number(parsed.args.listingId)

// Extract bundleId from BundleListed event
const bundleEvent = receipt.logs.find(log => {
  const parsed = marketplace.interface.parseLog(log)
  return parsed?.name === 'BundleListed'
})
const bundleId = Number(parsed.args.bundleId)
```

## Data Model

### Asset/Listing Record

```javascript
{
  // Identity
  id: 'asset_1234567890_0xabc...123',    // GenosDB nodeId: asset_${tokenId}_${owner}
  tokenId: 1234567890,                   // ERC-1155 token ID - identifies ALL copies of this asset type
  listingId: 42,                         // Blockchain listing ID (only when listed)
  originalAssetId: 'parent-asset-id',    // Only for split listings (reference to parent record)

  // Ownership
  owner: '0x1234...5678',
  creator: '0x1234...5678',              // original minter

  // Supply
  supply: 5,                              // quantity in this record

  // Listing info (when status != 'unlisted')
  status: 'sale' | 'auction' | 'rent' | 'unlisted',
  price: '1.5 OVG',
  priceNum: 1.5,
  seller: '0x1234...5678',
  listedAt: 1234567890000,

  // Metadata
  title: 'Cool NFT',
  description: 'Description here',
  collection: 'My Collection',
  category: 'objects',
  rarity: 'common',
  image: 'https://...',

  // Royalty (immutable after mint)
  royalty: '5%',
  royaltyPct: 5
}
```

## Inventory Display

The inventory view shows all records owned by the user with **visual grouping** of identical assets.

### Visual Grouping System

Items are grouped in the frontend by `tokenId` (ERC-1155 standard). This ensures ALL copies of the same asset type are grouped together, regardless of how they were acquired:

```javascript
function getGroupKey(id, data) {
  // Prefer tokenId (ERC-1155) - identifies ALL copies of same asset
  if (data.tokenId) {
    return `token::${data.tokenId}`
  }
  // Fallback for legacy data: group by title + collection
  const title = (data.title || data.name || '').toLowerCase().trim()
  const collection = (data.collection || '').toLowerCase().trim()
  return `legacy::${title}::${collection}`
}
```

**Example - Before Grouping:**
| Asset | Supply | Status |
|-------|--------|--------|
| Cool NFT | x3 | Unlisted |
| Cool NFT | x2 | Sale |
| Another NFT | x1 | Unlisted |

**Example - After Grouping:**
| Asset | Supply | Status | Action |
|-------|--------|--------|--------|
| Cool NFT | x5 (2 records) | Mixed | **Expand** |
| Another NFT | x1 | Unlisted | List |

### Expand/Collapse Behavior

The inventory supports **multi-level navigation** with a stack-based system:

1. **Level 0 - Grouped View (default)**: Items with same `tokenId` show as one row with total supply and "Expand" button
2. **Level 1 - Filtered View**: Shows all records for a tokenId, grouped by status (unlisted grouped, listed individually)
3. **Level 2 - Expanded View**: Shows individual virtual items for the selected status group
4. **Back Button (←)**: Returns to previous level (stack-based navigation)

### Key Variables

```javascript
let expandedGroupKey = null        // Current expanded group key
let expandedGroupItems = []        // Items in current expanded group
let disableGrouping = false        // Flag to disable grouping in expanded view
let navigationStack = []           // Stack for multi-level navigation
let inventoryGroupsCache = Map()   // Cache of grouped items for expand
let inventoryGroupFilter = null    // Filter by tokenId (level 1)
```

### Multi-Level Navigation Flow

```
Level 0 (Main Inventory)
   │
   ├─ Click "Expand" on group with MIXED statuses
   │  └─ filterInventoryByGroup(groupId) → Level 1
   │
   ├─ Click "Expand" on group with SAME status (all unlisted, all sale, etc.)
   │  └─ expandAsset(groupKey, items) → Level 2 (skips Level 1)
   │
Level 1 (Filtered by tokenId, grouped by status) - ONLY for mixed statuses
   │  Shows: [Unlisted x48 - Expand] [For Sale - Edit] [For Sale - Edit]
   │
   ├─ Click "Expand" on unlisted group
   │  └─ expandAsset(groupKey, items) → Level 2
   │     └─ Pushes Level 1 state to navigationStack
   │
Level 2 (Individual virtual items)
   │  Shows: #1/50, #2/50, #3/50... with List button each
   │
   ├─ Click Back (←)
   │  └─ clearExpandedAsset()
   │     └─ Pops from navigationStack → Level 1 (or Level 0 if skipped)
   │
Level 0
```

### Intelligent Level Skipping

The system automatically skips Level 1 when it's not needed:

| Group Status | Expand Behavior |
|--------------|-----------------|
| All same status (e.g., all unlisted) | **Skip to Level 2** - show virtual units directly |
| Mixed statuses (unlisted + sale) | **Go to Level 1** - show status breakdown first |
| Single record with supply > 1 | **Skip to Level 2** - no breakdown needed |

This optimization reduces navigation clicks when there's no status breakdown to show.

### Expand Functions

```javascript
// Level 1: Filter by tokenId with grouping enabled
window.filterInventoryByGroup(groupId, title)

// Level 2: Expand to virtual items, grouping disabled
window.expandAsset(groupKey, items)
  // Pushes current state to navigationStack if already expanded

// Back: Pop from stack or return to main view
window.clearExpandedAsset()
  // If navigationStack.length > 0: restore previous state
  // Else: return to Level 0

window.clearInventoryGroupFilter()
  // Routes to clearExpandedAsset() or clears inventoryGroupFilter
```

### Grouping with Filters

Sidebar filters (status, category, rarity) work in parallel with grouping:
- Filters determine which items load from database
- Filtered items are then grouped visually
- Expand shows only items that passed the filter

Users can:
- List more copies from unlisted records
- Edit or cancel active listings
- See accurate counts at all times
- Expand groups to manage individual records

## Select Mode (Batch Operations)

The inventory supports a **Select Mode** for batch operations like creating bundles or batch listing. When active, the UI behavior changes to allow selecting individual units.

### Select Mode Behavior

| Element | Normal Mode | Select Mode |
|---------|-------------|-------------|
| Group (supply > 1) | Click → Asset Details | Click → **Expand** to show units |
| Expanded Unit | Click → Asset Details | Click → **Toggle Selection** |
| Individual Item (supply = 1) | Click → Asset Details | Click → **Toggle Selection** |

### Virtual Item IDs

In expanded view (Level 2), each unit gets a unique virtual ID for selection:

```javascript
// Virtual ID format: {assetId}:unit:{index}
const virtualId = `${assetId}:unit:${index}`

// Example: asset_123 with supply 3 creates:
// - asset_123:unit:1
// - asset_123:unit:2
// - asset_123:unit:3
```

### Selection Data Attributes

Expanded cards and rows include these datasets for selection:

```javascript
element.dataset.itemId = virtualId      // Unique selection key
element.dataset.realAssetId = assetId   // Original asset ID
element.dataset.title = title
element.dataset.collection = collection
element.dataset.image = image
element.dataset.unitIndex = index       // Unit number (1-based)
```

### CSS Classes for Selection

```css
.batch-mode        /* Applied when Select Mode is active */
.batch-selected    /* Applied when item is selected */
.mp-batch-checkbox /* Visual checkbox indicator */
```

### Key Variables

```javascript
let inventorySelectMode = false           // Select Mode toggle
let selectedInventoryItems = new Map()    // Selected items map
```

### Batch Operation Flow

```
1. User clicks "Select" button
   └─ inventorySelectMode = true
   └─ Items get .batch-mode class (dimmed)

2. User clicks on group with supply > 1
   └─ Group expands to show individual units
   └─ Units can be selected individually

3. User clicks on individual units
   └─ toggleBatchSelection(element)
   └─ Unit gets .batch-selected class (highlighted)
   └─ virtualId added to selectedInventoryItems

4. User clicks action button:
   ├─ "Create Bundle" → bundleWizard.open(selectedItems)
   │     └─ Creates bundle with realAssetIds
   │     └─ Reduces supply from source assets
   │
   └─ "Batch List" → batchSellWizard.open(selectedItems)
         └─ Creates individual listings (supply=1 each)
         └─ Reduces supply from source assets

5. On success → window.disableInventorySelectMode()
   └─ Exits Select Mode automatically
```

## Marketplace Display

The explore/browse view shows only listed assets:

| Asset | Available | Price |
|-------|-----------|-------|
| Cool NFT | x2 | 1.5 OVG |

Buyers can:
- See how many copies are available
- Choose quantity to purchase (1 to max available)
- View total cost with fees

## Fee Structure

When selling:
- **Service fee**: 2.5% (platform)
- **Creator royalty**: 0-25% (set at mint, immutable)

Example for 1.5 OVG sale with 5% royalty:
```
Listing price:    1.5000 OVG
Service fee:     -0.0375 OVG (2.5%)
Creator royalty: -0.0750 OVG (5%)
Seller receives:  1.3875 OVG
```

## Implementation Files

- `js/services/blockchain.js` - Core transaction logic (mint, list, buy, cancel, batchList, createBundle, cancelBundle)
- `js/wizards/sellWizard.js` - Listing UI with quantity selector
- `js/wizards/buyWizard.js` - Purchase UI with quantity selector
- `js/wizards/mintWizard.js` - Minting UI with supply input
- `js/wizards/listWizard.js` - Choose Action modal (sell, rent, auction)
- `js/wizards/batchSellWizard.js` - Batch listing multiple items with individual prices
- `js/wizards/bundleWizard.js` - Bundle creation from selected inventory items
- `js/app-core.js` - Inventory rendering and grouping system:
  - `getGroupKey()` - Generates grouping key from tokenId (ERC-1155) or title+collection (legacy)
  - `groupInventoryItems()` - Groups items by key
  - `buildViewQuery()` - Builds GenosDB query with tokenId filter support
  - `createInventoryGroup()` - Creates grouped card (grid mode, shows supply badge)
  - `createInventoryGroupRow()` - Creates grouped row (table mode, no supply badge)
  - `createExpandedCard()` - Creates individual item card in expanded view
  - `createExpandedTableRow()` - Creates individual item row in expanded view
  - `renderExpandedAsset()` - Renders expanded view without grouping
  - `filterInventoryByGroup()` - Level 1: Filter by tokenId with grouping
  - `expandAsset()` - Level 2: Expand to virtual items (uses navigationStack)
  - `clearExpandedAsset()` - Back: Pop from stack or return to main view
  - `clearInventoryGroupFilter()` - Routes back navigation
- `css/views/view-specific-layouts.css` - Grouping and expand styles

## Author

Esteban Fuster Pozzi (@estebanrfp) — Full Stack JavaScript Developer
