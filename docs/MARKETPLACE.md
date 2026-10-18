# Marketplace Documentation

## Overview

The world's marketplace is a fully-featured NFT trading platform built on Polygon, designed specifically for metaverse assets. It supports direct sales, rentals, bundles, bidding systems, and creator royalties.

**Contract Version:** 2.2.0 (Smart Contracts) / 2.1.0 (Frontend)
**Network:** Polygon Mainnet + Amoy (Testnet)
**Pattern:** UUPS Upgradeable (OpenZeppelin)
**Tests:** 194 contract + 251 frontend (72.90% coverage)
**Modularization:** app-core.js reduced from 4,716 to 237 lines (~95%)

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      FRONTEND UI                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ Views       │  │ Tabs        │  │ Wizards (lazy)      │ │
│  │ - Inventory │  │ - Activity  │  │ - Sell, Buy, Rent   │ │
│  │ - Explore   │  │ - Offers    │  │ - Bid, Gift, Bundle │ │
│  │ - Detail    │  │ - Stats     │  │ - Royalty, Rename   │ │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘ │
│         └────────────────┼────────────────────┘            │
│                          ▼                                  │
│              ┌───────────────────────┐                     │
│              │ MarketplaceController │                     │
│              │     (index.js)        │                     │
│              └───────────┬───────────┘                     │
└──────────────────────────┼──────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                  BLOCKCHAIN LAYER                           │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              BlockchainManager.js                    │   │
│  │  - Contract instances (token, assets, marketplace)   │   │
│  │  - Transaction handling with signer                  │   │
│  │  - Event querying and caching                        │   │
│  └──────────────────────┬──────────────────────────────┘   │
│                         │                                   │
│  ┌──────────────────────┴──────────────────────────────┐   │
│  │              MarketplaceCache.js                     │   │
│  │  - TTL-based caching for RPC optimization            │   │
│  └─────────────────────────────────────────────────────┘   │
└──────────────────────────┼──────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    SMART CONTRACTS                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ OVGToken    │  │ OVGAssets   │  │ OVGMarketplace      │ │
│  │ (ERC-20)    │  │ (ERC-1155)  │  │ (UUPS Upgradeable)  │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
│                                                             │
│                    Polygon Amoy Testnet                     │
└─────────────────────────────────────────────────────────────┘
```

## Smart Contract Features

### Core Trading

| Function | Description |
|----------|-------------|
| `listAssetWithToken(assetId, amount, price, isRental, duration, paymentToken)` | List NFT for sale/rent |
| `purchase(listingId)` | Buy listed asset (includes royalties + marketplace fee) |
| `rent(listingId)` | Rent an asset for the specified duration |
| `extendRental(listingId)` | Extend active rental period |
| `cancelListing(listingId)` | Cancel and delist asset |

### Multi-Token Payments (v1.3.0)

| Function | Description |
|----------|-------------|
| `setAllowedToken(token, allowed)` | Whitelist payment token (owner only) |
| `isTokenAllowed(token)` | Check if token is whitelisted |
| `getAccumulatedFees(token)` | Get fees by token |
| `withdrawFeesByToken(token)` | Withdraw fees by token |

**Supported tokens:** OVG, USDC, USDT

### Batch Operations (v1.4.0)

| Function | Description |
|----------|-------------|
| `batchListAssets(...)` | List up to 15 assets in one TX |
| `batchPurchase(listingIds[])` | Purchase up to 15 listings in one TX |

### Timed Auctions (v1.5.0)

| Function | Description |
|----------|-------------|
| `createAuction(assetId, amount, minBid, duration, paymentToken)` | Create timed auction |
| `placeBidOnAuction(auctionId, bidAmount)` | Bid on auction (1% min increment) |
| `settleAuction(auctionId)` | Settle ended auction |
| `cancelAuction(auctionId)` | Cancel auction (no bids, seller only) |

### Bundles

| Function | Description |
|----------|-------------|
| `listBundleWithToken(assetIds[], amounts[], price, name, paymentToken)` | Create bundle |
| `purchaseBundle(bundleId)` | Buy entire bundle |
| `cancelBundle(bundleId)` | Cancel bundle listing |
| `setBundleName(bundleId, name)` | Rename bundle (seller only, max 32 chars) |

### Bidding System

| Function | Description |
|----------|-------------|
| `placeBid(listingId, price)` | Place bid with escrow |
| `placeGlobalBidWithToken(assetId, price, paymentToken)` | Offer on unlisted NFT |
| `acceptBid(listingId, bidder)` | Accept bid (seller) |
| `acceptGlobalBid(assetId, bidder)` | Accept global offer |
| `withdrawBid(listingId)` | Withdraw bid and reclaim escrow |
| `withdrawGlobalBid(assetId)` | Withdraw global offer |

### Admin Functions

| Function | Description |
|----------|-------------|
| `setMarketplaceFee(newFee)` | Set fee percentage (max 10%, owner only) |
| `setFeeRecipient(newRecipient)` | Set fee recipient address |
| `withdrawFees()` | Withdraw accumulated fees |
| `pause()` | Emergency pause all trading |
| `unpause()` | Resume trading |

## Fee Structure

| Fee Type | Percentage | Recipient |
|----------|------------|-----------|
| **Marketplace Fee** | 2.5% | Platform (configurable 0-10%) |
| **Creator Royalty** | 0-25% | Original creator |
| **Seller Receives** | Remainder | Asset seller |

**Example:** 100 OVG sale with 2.5% marketplace fee and 5% royalty:
- Marketplace: 2.5 OVG
- Creator: 5 OVG
- Seller: 92.5 OVG

## Events

```solidity
// Listings
Listed(listingId, seller, assetId, price)
BundleListed(bundleId, seller, assetIds[], price)
Purchased(listingId, buyer, price, royalty)
BundlePurchased(bundleId, buyer, price)
Cancelled(listingId, seller)
BundleCancelled(bundleId, seller)

// Rentals
Rented(listingId, renter, expiresAt)
RentalExtended(listingId, renter, newExpiresAt)

// Bids
BidPlaced(listingId, bidder, price)
BidAccepted(listingId, seller, bidder, price, royalty)
BidWithdrawn(listingId, bidder)
GlobalBidPlaced(assetId, bidder, price)
GlobalBidAccepted(assetId, seller, bidder, price, royalty)
GlobalBidWithdrawn(assetId, bidder)

// Bundles
BundleRenamed(bundleId, seller, name)

// Admin
MarketplaceFeeUpdated(oldFee, newFee)
FeeRecipientUpdated(oldRecipient, newRecipient)
FeesWithdrawn(recipient, amount)
Paused(account)
Unpaused(account)
```

## Frontend UI Structure

```
lib/marketplace/js/
├── app-core.js              # Orchestrator (237 LOC, ~95% reduction from 4,716)
├── app-ui.js                # UI interactions
├── main.js                  # Entry point
├── store/
│   └── appState.js          # Centralized state container
├── services/
│   └── blockchain.js        # TX execution, pendingOfferAssets Set
├── core/                    # 35+ utility modules
│   ├── constants.js         # DB_NAME, ITEMS_PER_PAGE, etc.
│   ├── database.js          # GenosDB initialization
│   ├── user.js              # CURRENT_USER management
│   ├── time.js              # formatTimeRemaining, countdown
│   ├── subscriptions.js     # View subscription management
│   ├── cache.js             # clearAllCache
│   ├── pagination/          # Pagination system (state, persistence, handlers)
│   ├── filters/             # Filter system (state, query, counts, ui, listeners)
│   ├── rendering/           # Rendering utilities (utils, headers)
│   ├── analytics/           # Analytics modal (activity, stats, chart)
│   ├── blockchain/          # Blockchain sync (sync.js — 5-step process)
│   └── init/                # Initialization (appInitializer, inventoryNavigation, viewDispatcher)
├── modules/                 # 28+ UI rendering modules
│   ├── explore/             # Explore view (persistence, viewMode, reset, rendering, loading)
│   ├── views/               # View loaders (pagination, loaders, subscriptions)
│   ├── inventory/           # Inventory view (viewMode, grouping, rendering)
│   ├── collections/         # Collections (viewMode, rendering)
│   ├── offers/              # Offers (rendering)
│   ├── stats/               # Stats (rendering)
│   └── batch/               # Batch mode operations
└── wizards/                 # Lazy-loaded transaction wizards
    ├── sellWizard.js, buyWizard.js, rentWizard.js
    ├── bidWizard.js, giftWizard.js, bundleWizard.js
    ├── auctionWizard.js, offerWizard.js
    ├── editSaleWizard.js, editRentalWizard.js, editAuctionWizard.js
    └── batchListWizard.js, batchBuyWizard.js
```

## UI Tabs

| Tab | Icon | Description |
|-----|------|-------------|
| **Inventory** | 📦 | View owned NFTs, listed items, bundles, rented assets |
| **Explore** | 🛒 | Browse active listings, auctions for purchase/rent |
| **Offers** | 🤝 | Manage received and sent bids (includes global + auction bids) |
| **Activity** | 📜 | Transaction history with Global/Personal filter |
| **Stats** | 📊 | Trading statistics, price history, floor prices |
| **Admin** | ⚙️ | Admin controls (owner only): fees, recipient, pause, network |

## Security Features

- **Pausable:** Emergency stop for all trading operations
- **ReentrancyGuard:** Protection against reentrancy attacks
- **UUPS Upgradeable:** Allows bug fixes without migration
- **Fee Limits:** Maximum 10% marketplace fee cap
- **Escrow System:** Bids held in contract until accepted/withdrawn

## Contract Addresses

### Polygon Mainnet (Production)

| Contract | Proxy Address |
|----------|---------------|
| OVGToken | `0x0fB62F6ea4A58A610b3cF19DB401778B4126d28E` |
| OVGAssets | `0x79f547F3E8a344D87064C15aA572a98E8d4A5c71` |
| OVGMarketplace | `0x5c721aCC1535b2eD3a96Ba1C5768c0A97Dfa77DA` |
| OVGLandClaim | `0xb11D83816c8645034099F09A011F30E1685cb7e8` |
| OVGMetadata | `0x8eDB11F435918371E28AC538c95Cf1b7b6505a10` |

### Polygon Amoy (Testnet)

| Contract | Proxy Address |
|----------|---------------|
| OVGToken | `0x564f99BAD84cE3fD36D5597874633eddBB304b8f` |
| OVGAssets | `0xD55d5049e597BA431d5C2b5c1f286532f0E0C195` |
| OVGMarketplace | `0x9982f5e65A342D7b8CAd1Ab3C83585916D98542a` |

## Usage Examples

### List an Asset for Sale

```javascript
const bm = await getBlockchainManager()
await bm.createListing(assetId, "10.0") // 10 OVG
```

### Create a Bundle

```javascript
await bm.listBundle([1, 2, 3], [1, 1, 1], "25.0", "My Bundle")
```

### Place a Bid

```javascript
await bm.placeBid(listingId, "8.0") // 8 OVG offer
```

### Accept a Bid

```javascript
await bm.acceptBid(listingId, bidderAddress)
```

## Performance Optimizations

- **Lazy Loading:** Wizards and tabs load on-demand
- **Caching:** TTL-based cache for RPC calls (60s default)
- **Batch Queries:** Parallel event fetching
- **Debounced Search:** 300ms debounce on input
- **Optimistic UI:** Immediate feedback before tx confirmation

## Testing

### Smart Contract Tests (194 tests)

```bash
cd blockchain && npx hardhat test
```

### Frontend Tests (251 tests)

```bash
# Run all tests
bun test

# With coverage (72.90%)
bun test --coverage

# Watch mode
bun test --watch
```

| Test File | Tests | Coverage |
|-----------|-------|----------|
| `withRetry.test.js` | 14 | 97.62% |
| `ErrorLogger.test.js` | 14 | 78.57% |
| `state.test.js` | 43 | 81.98% |
| `utils.test.js` | 64 | 64.29% |
| `calculations.test.js` | 42 | - |
| `validation.test.js` | 53 | - |
| `dataLoader.test.js` | 21 | - |

## Implemented Features (v2.0.0+)

- ✅ **On-chain metadata** (V2.0.0) - title, description, imageUrl, assetUrl stored on Polygon
- ✅ Timed auctions (English auction style)
- ✅ Multi-token payments (OVG, USDC, USDT)
- ✅ Batch operations (list/buy up to 15 items)
- ✅ Favorites/Watchlist (IndexedDB persistence)
- ✅ Frontend unit tests (251 tests, 72.90% coverage)
- ✅ Error logging with buffer (ErrorLogger)
- ✅ Transaction timeouts (withTimeout 60s)

### On-Chain Metadata (V2.0.0)

Listings, bundles, and auctions can store metadata directly on Polygon:

| Field | Max Length | Description |
|-------|------------|-------------|
| title | 64 chars | Display name |
| description | 160 chars | Short description |
| imageUrl | 128 chars | Preview image URL |
| assetUrl | 128 chars | 3D model or asset URL |

**Cost:** ~0.015 MATIC (~$0.01 USD) per metadata write

**Note:** Metadata is stored in a separate `OVGMetadata` contract due to EVM's 24KB code size limit.

## Completed Features (formerly Future Considerations)

- **Visual land map integration** — Implemented (Feb 2026). WebGPU cube sphere visualization with parcel overlays, GPU billboard tooltips, and blockchain land claims.
- **3D asset preview (WebGPU)** — Implemented (Feb 2026). Terrain parcel preview baker (64x64) in `lib/terrain/parcel-preview.js`.
- **GenosDB indexer** — Active. P2P + offline-first, replaces The Graph.

## Remaining Future Considerations

- Push notifications
- Seaport (OpenSea) hybrid listing integration

## Author

Esteban Fuster Pozzi (@estebanrfp) — Full Stack JavaScript Developer
