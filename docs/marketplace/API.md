# OVGrid Marketplace - API Reference

> **Version:** 2.0.0
> **Last Updated:** 2026-02-03

---

## Table of Contents

- [Getting Started](#getting-started)
- [Core Methods](#core-methods)
- [Listings](#listings)
- [On-Chain Metadata (V2.0.0)](#on-chain-metadata-v200)
- [Purchases](#purchases)
- [Bidding System](#bidding-system)
- [Global Bids](#global-bids)
- [Bundles](#bundles)
- [Rentals](#rentals)
- [Timed Auctions](#timed-auctions)
- [Batch Operations](#batch-operations)
- [Multi-Token Support](#multi-token-support)
- [Admin Functions](#admin-functions)
- [Statistics & Activity](#statistics--activity)
- [Land Claims](#land-claims)

---

## Getting Started

### Initialization

```javascript
import { getBlockchainManager } from './lib/blockchain/BlockchainManager.js'

// Initialize (singleton pattern)
const bm = await getBlockchainManager()

// Check connection
const balance = await bm.getOVGBalance()
console.log('OVG Balance:', balance)
```

### Reset Connection

```javascript
import { resetBlockchainManager } from './lib/blockchain/BlockchainManager.js'

// Reset on network change
await resetBlockchainManager()
const bm = await getBlockchainManager()
```

---

## Core Methods

### `init()`
Initialize the blockchain connection and load contracts.

```javascript
await bm.init()
```

### `getSigner()`
Get the current ethers.js signer.

```javascript
const signer = await bm.getSigner()
const address = await signer.getAddress()
```

### `getOVGBalance()`
Get OVG token balance for connected wallet.

```javascript
const balance = await bm.getOVGBalance()
// Returns: "1234.56" (formatted string)
```

### `getNativeBalance()`
Get native POL/MATIC balance.

```javascript
const balance = await bm.getNativeBalance()
// Returns: "10.5" (formatted string)
```

### `sendOVG(to, amount)`
Transfer OVG tokens.

| Parameter | Type | Description |
|-----------|------|-------------|
| `to` | string | Recipient address |
| `amount` | string | Amount to send |

```javascript
await bm.sendOVG('0x...', '100')
```

### `sendPol(to, amount)`
Transfer native POL/MATIC.

```javascript
await bm.sendPol('0x...', '1.5')
```

---

## Listings

### `createListingWithToken(assetId, price, paymentToken, tokenDecimals)`
Create a sale listing with specified payment token.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `assetId` | number | - | NFT token ID |
| `price` | string | - | Price in token units |
| `paymentToken` | string | - | ERC20 token address |
| `tokenDecimals` | number | 18 | Token decimals |

```javascript
const OVG_ADDRESS = '0x0fB62F6ea4A58A610b3cF19DB401778B4126d28E'
await bm.createListingWithToken(1, '100', OVG_ADDRESS, 18)
```

### `getActiveListings(options)`
Get all active marketplace listings.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `forceRefresh` | boolean | false | Bypass cache |

```javascript
const listings = await bm.getActiveListings({ forceRefresh: true })
// Returns: [{ listingId, assetId, seller, price, paymentToken, isRental, ... }]
```

### `getActiveListingForAsset(assetId)`
Get active listing for a specific asset.

```javascript
const listing = await bm.getActiveListingForAsset(1)
// Returns: { listingId, price, seller, ... } or null
```

### `cancelListing(listingId)`
Cancel your own listing.

```javascript
await bm.cancelListing(5)
```

---

## On-Chain Metadata (V2.0.0)

Store listing metadata directly on Polygon blockchain. External contract (`OVGMetadata`) handles storage due to EVM size limits.

**Limits:**
- Title: 64 characters max
- Description: 160 characters max
- Image URL: 128 characters max
- Asset URL: 128 characters max

**Cost:** ~0.015 MATIC (~$0.01 USD) per metadata write

### `createListingWithMetadata(assetId, price, metadata, paymentToken)`
Create a listing with on-chain metadata.

| Parameter | Type | Description |
|-----------|------|-------------|
| `assetId` | number | NFT token ID |
| `price` | string | Price in tokens |
| `metadata` | object | `{ title, description, imageUrl, assetUrl }` |
| `paymentToken` | string | Payment token address (optional) |

```javascript
await bm.createListingWithMetadata(1, '100', {
  title: 'Epic Sword',
  description: 'Legendary weapon from the ancient realm',
  imageUrl: 'https://example.com/sword.png',
  assetUrl: 'https://example.com/model.glb'
})
```

### `setListingMetadata(listingId, metadata)`
Update metadata for an existing listing.

```javascript
await bm.setListingMetadata(5, {
  title: 'Updated Title',
  description: 'New description',
  imageUrl: 'https://example.com/new.png',
  assetUrl: ''
})
```

### `getListingMetadata(listingId)`
Get metadata for a listing.

```javascript
const meta = await bm.getListingMetadata(5)
// Returns: { title, description, imageUrl, assetUrl }
```

### `listBundleWithMetadata(assetIds, amounts, price, metadata, paymentToken)`
Create a bundle with on-chain metadata.

```javascript
await bm.listBundleWithMetadata(
  [1, 2, 3],
  [1, 1, 1],
  '250',
  {
    title: 'Starter Pack',
    description: 'Everything you need to begin',
    imageUrl: 'https://example.com/bundle.png',
    assetUrl: ''
  }
)
```

### `setBundleMetadata(bundleId, metadata)` / `getBundleMetadata(bundleId)`
Set or get bundle metadata.

```javascript
await bm.setBundleMetadata(1, { title: 'New Name', description: '...' })
const meta = await bm.getBundleMetadata(1)
```

### `createAuctionWithMetadata(assetId, amount, minBid, duration, paymentToken, metadata, tokenDecimals)`
Create an auction with on-chain metadata.

```javascript
await bm.createAuctionWithMetadata(1, 1, '100', 86400, OVG_ADDRESS, {
  title: 'Rare Collectible Auction',
  description: 'One-of-a-kind item',
  imageUrl: 'https://example.com/rare.png',
  assetUrl: ''
})
```

### `setAuctionMetadata(auctionId, metadata)` / `getAuctionMetadata(auctionId)`
Set or get auction metadata.

```javascript
await bm.setAuctionMetadata(1, { title: 'Updated Auction', description: '...' })
const meta = await bm.getAuctionMetadata(1)
```

---

## Purchases

### `purchaseAsset(listingId)`
Buy a listed asset. Handles approval automatically.

```javascript
const result = await bm.purchaseAsset(5)
// Returns: { receipt }
```

**Flow:**
1. Fetches listing details
2. Calculates royalty + marketplace fee
3. Approves payment token (if needed)
4. Executes purchase transaction
5. Invalidates cache

---

## Bidding System

### `placeBid(listingId, price)`
Place a bid on a listing.

```javascript
await bm.placeBid(5, '80') // Bid 80 tokens
```

### `acceptBid(listingId, bidder)`
Accept a bid (seller only).

```javascript
await bm.acceptBid(5, '0xBidderAddress...')
```

### `withdrawBid(listingId)`
Withdraw your bid.

```javascript
await bm.withdrawBid(5)
```

### `getUserBids(userAddress, options)`
Get bids placed by a user.

```javascript
const bids = await bm.getUserBids('0x...')
// Returns: [{ listingId, price, timestamp, ... }]
```

### `getReceivedBids(userAddress, options)`
Get bids received on user's listings.

```javascript
const bids = await bm.getReceivedBids('0x...')
```

---

## Global Bids

Bids on assets that are NOT currently listed.

### `placeGlobalBidWithToken(assetId, price, paymentToken, tokenDecimals)`
Place a global bid on any asset.

```javascript
await bm.placeGlobalBidWithToken(1, '50', OVG_ADDRESS, 18)
```

### `acceptGlobalBid(assetId, bidder)`
Accept a global bid (asset owner only).

```javascript
await bm.acceptGlobalBid(1, '0xBidderAddress...')
```

### `withdrawGlobalBid(assetId)`
Withdraw your global bid.

```javascript
await bm.withdrawGlobalBid(1)
```

### `getGlobalBidsForAsset(assetId)`
Get all global bids for an asset.

```javascript
const bids = await bm.getGlobalBidsForAsset(1)
// Returns: [{ bidder, price, paymentToken, timestamp }]
```

### `getUserGlobalBids(userAddress)`
Get global bids placed by a user.

```javascript
const bids = await bm.getUserGlobalBids('0x...')
```

### `getReceivedGlobalBids(userAddress, ownedAssets)`
Get global bids received on owned assets.

```javascript
const ownedIds = [1, 2, 3]
const bids = await bm.getReceivedGlobalBids('0x...', ownedIds)
```

---

## Bundles

### `listBundleWithToken(assetIds, amounts, price, paymentToken, name, tokenDecimals)`
Create a bundle listing.

| Parameter | Type | Description |
|-----------|------|-------------|
| `assetIds` | number[] | Array of NFT IDs |
| `amounts` | number[] | Amount of each (usually [1,1,1]) |
| `price` | string | Bundle price |
| `paymentToken` | string | Payment token address |
| `name` | string | Optional bundle name (max 32 chars) |

```javascript
await bm.listBundleWithToken(
  [1, 2, 3],
  [1, 1, 1],
  '250',
  OVG_ADDRESS,
  'My Bundle'
)
```

### `purchaseBundle(bundleId)`
Purchase a bundle.

```javascript
await bm.purchaseBundle(1)
```

### `cancelBundle(bundleId)`
Cancel your bundle listing.

```javascript
await bm.cancelBundle(1)
```

### `setBundleName(bundleId, name)`
Rename a bundle (max 32 characters).

```javascript
await bm.setBundleName(1, 'New Name')
```

### `getBundleName(bundleId)`
Get bundle name.

```javascript
const name = await bm.getBundleName(1)
// Returns: "My Bundle" or ""
```

---

## Rentals

### `createRentalListingWithToken(assetId, pricePerPeriod, durationSeconds, paymentToken, tokenDecimals)`
Create a rental listing.

| Parameter | Type | Description |
|-----------|------|-------------|
| `assetId` | number | NFT token ID |
| `pricePerPeriod` | string | Price per rental period |
| `durationSeconds` | number | Rental duration in seconds |
| `paymentToken` | string | Payment token address |

```javascript
const ONE_DAY = 86400
await bm.createRentalListingWithToken(1, '10', ONE_DAY * 7, OVG_ADDRESS) // 7 days
```

### `rentAsset(listingId)`
Rent an asset.

```javascript
await bm.rentAsset(5)
```

### `extendRental(listingId)`
Extend an active rental.

```javascript
await bm.extendRental(5)
```

---

## Timed Auctions

> **Version:** 1.5.0+

### `createAuction(assetId, amount, minBid, durationSeconds, paymentToken, tokenDecimals)`
Create a timed auction.

| Parameter | Type | Description |
|-----------|------|-------------|
| `assetId` | number | NFT token ID |
| `amount` | number | Amount to auction (usually 1) |
| `minBid` | string | Minimum starting bid |
| `durationSeconds` | number | Auction duration (300 - 2592000) |
| `paymentToken` | string | Payment token address |

```javascript
const ONE_HOUR = 3600
await bm.createAuction(1, 1, '100', ONE_HOUR * 24, OVG_ADDRESS) // 24h auction
```

**Constraints:**
- Minimum duration: 5 minutes (300 seconds)
- Maximum duration: 30 days (2592000 seconds)
- Minimum bid increment: 1%

### `placeBidOnAuction(auctionId, bidAmount, paymentToken, tokenDecimals)`
Place a bid on an auction.

```javascript
await bm.placeBidOnAuction(1, '150', OVG_ADDRESS, 18)
```

**Rules:**
- Bid must be > current highest bid
- Bid must be >= minBid
- Bid increment must be >= 1% over previous
- Previous highest bidder is auto-refunded

### `settleAuction(auctionId)`
Settle an ended auction. Can be called by anyone.

```javascript
await bm.settleAuction(1)
```

**Results:**
- If bids exist: Asset → winner, payment → seller (minus fees)
- If no bids: Asset returned to seller

### `cancelAuction(auctionId)`
Cancel auction (seller only, no bids placed).

```javascript
await bm.cancelAuction(1)
```

### `getAuction(auctionId)`
Get auction details.

```javascript
const auction = await bm.getAuction(1)
// Returns: { auctionId, seller, assetId, minBid, startTime, endTime,
//            highestBidder, highestBid, settled, paymentToken }
```

### `getActiveAuctions(options)`
Get all active auctions.

```javascript
const auctions = await bm.getActiveAuctions({ forceRefresh: true })
```

### `getAuctionBids(auctionId)`
Get bid history for an auction.

```javascript
const bids = await bm.getAuctionBids(1)
// Returns: [{ bidder, amount, timestamp }]
```

### `getUserAuctions(userAddress)`
Get auctions created by a user.

```javascript
const auctions = await bm.getUserAuctions('0x...')
```

### `getUserAuctionBids(userAddress)`
Get auctions where user has placed bids.

```javascript
const auctions = await bm.getUserAuctionBids('0x...')
```

---

## Batch Operations

> **Version:** 1.4.0+

### `batchListAssets(assetIds, amounts, prices, isRentals, durations, paymentToken, tokenDecimals)`
List multiple assets in one transaction.

| Parameter | Type | Description |
|-----------|------|-------------|
| `assetIds` | number[] | Array of NFT IDs (max 15) |
| `amounts` | number[] | Amount of each |
| `prices` | string[] | Price for each |
| `isRentals` | boolean[] | Is rental for each |
| `durations` | number[] | Duration for rentals |
| `paymentToken` | string | Payment token (same for all) |

```javascript
await bm.batchListAssets(
  [1, 2, 3],
  [1, 1, 1],
  ['100', '150', '200'],
  [false, false, false],
  [0, 0, 0],
  OVG_ADDRESS,
  18
)
```

**Limit:** Maximum 15 items per batch.

### `batchPurchase(listingIds)`
Purchase multiple listings in one transaction.

```javascript
await bm.batchPurchase([5, 6, 7])
```

**Requirements:**
- All listings must use the same payment token
- Maximum 15 items per batch

---

## Multi-Token Support

> **Version:** 1.3.0+

### `isTokenAllowed(tokenAddress)`
Check if a token is whitelisted.

```javascript
const allowed = await bm.isTokenAllowed(USDC_ADDRESS)
// Returns: true/false
```

### `setAllowedToken(tokenAddress, allowed)`
Whitelist/remove a token (owner only).

```javascript
await bm.setAllowedToken(NEW_TOKEN, true)
```

### `getListingPaymentToken(listingId)`
Get payment token for a listing.

```javascript
const token = await bm.getListingPaymentToken(5)
// Returns: "0x..." (token address)
```

### `getBundlePaymentToken(bundleId)`
Get payment token for a bundle.

```javascript
const token = await bm.getBundlePaymentToken(1)
```

### Supported Tokens (Polygon Mainnet)

| Token | Address | Decimals |
|-------|---------|----------|
| OVG | `0x0fB62F6ea4A58A610b3cF19DB401778B4126d28E` | 18 |
| USDC | `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359` | 6 |
| USDT | `0xc2132D05D31c914a87C6611C10748AEb04B58e8F` | 6 |

---

## Admin Functions

> **Requires:** Contract owner role

### `getMarketplaceFee()`
Get current marketplace fee in basis points.

```javascript
const fee = await bm.getMarketplaceFee()
// Returns: 250 (= 2.5%)
```

### `setMarketplaceFee(feeBasisPoints)`
Set marketplace fee (0-1000 basis points = 0-10%).

```javascript
await bm.setMarketplaceFee(300) // Set to 3%
```

### `getFeeRecipient()`
Get fee recipient address.

```javascript
const recipient = await bm.getFeeRecipient()
```

### `setFeeRecipient(recipientAddress)`
Set fee recipient.

```javascript
await bm.setFeeRecipient('0x...')
```

### `getAccumulatedFees()` / `getAccumulatedFeesByToken(tokenAddress)`
Get accumulated fees.

```javascript
const fees = await bm.getAccumulatedFees() // OVG
const usdcFees = await bm.getAccumulatedFeesByToken(USDC_ADDRESS)
```

### `withdrawMarketplaceFees()` / `withdrawFeesByToken(tokenAddress)`
Withdraw accumulated fees.

```javascript
await bm.withdrawMarketplaceFees() // OVG
await bm.withdrawFeesByToken(USDC_ADDRESS)
```

### `pauseMarketplace()` / `unpauseMarketplace()`
Emergency pause/unpause.

```javascript
await bm.pauseMarketplace()
// All transactions blocked except admin functions
await bm.unpauseMarketplace()
```

### `isMarketplacePaused()`
Check pause status.

```javascript
const paused = await bm.isMarketplacePaused()
```

---

## Statistics & Activity

### `getBasicStats(userAddress, options)`
Get user statistics.

```javascript
const stats = await bm.getBasicStats('0x...')
// Returns: { totalSales, totalVolume, totalPurchases, ... }
```

### `getMarketplaceActivity(options)`
Get recent marketplace activity.

| Option | Type | Description |
|--------|------|-------------|
| `limit` | number | Max results |
| `userAddress` | string | Filter by user |
| `eventTypes` | string[] | Filter by event type |

```javascript
const activity = await bm.getMarketplaceActivity({ limit: 50 })
// Returns: [{ type, assetId, price, from, to, timestamp, txHash }]
```

### `getPriceHistory(options)`
Get historical price data.

```javascript
const history = await bm.getPriceHistory({ assetId: 1 })
```

### `getFloorPrices(options)`
Get floor prices by category.

```javascript
const floors = await bm.getFloorPrices()
```

---

## Land Claims

### `isLandAvailable(x, z)`
Check if land coordinates are available.

```javascript
const available = await bm.isLandAvailable(100, 200)
```

### `claimLand(x, z)`
Claim land at coordinates.

```javascript
await bm.claimLand(100, 200)
```

### `getLandOwner(x, z)`
Get land owner.

```javascript
const owner = await bm.getLandOwner(100, 200)
// Returns: "0x..." or "0x0000..." if unclaimed
```

---

## Assets

### `getOwnedAssets(options)`
Get assets owned by connected wallet.

```javascript
const assets = await bm.getOwnedAssets({ forceRefresh: true })
// Returns: [{ id, balance, name, ... }]
```

### `hasAsset(assetId)`
Check if wallet owns an asset.

```javascript
const owns = await bm.hasAsset(1)
// Returns: true/false
```

### `getAssetInfo(assetId)`
Get asset metadata.

```javascript
const info = await bm.getAssetInfo(1)
// Returns: { id, name, uri, ... }
```

### `mintAsset(to, assetId, amount, data)`
Mint new asset (creator only).

```javascript
await bm.mintAsset('0x...', 100, 1, '0x')
```

---

## Royalties

### `setRoyalty(assetId, creator, percentage)`
Set royalty for an asset (creator only).

| Parameter | Type | Description |
|-----------|------|-------------|
| `assetId` | number | NFT token ID |
| `creator` | string | Royalty recipient |
| `percentage` | number | Percentage (0-25) |

```javascript
await bm.setRoyalty(1, '0xCreator...', 5) // 5% royalty
```

### `getRoyaltyInfo(assetId, salePrice)`
Get royalty info for a sale.

```javascript
const royalty = await bm.getRoyaltyInfo(1, 10000)
// Returns: { creator: "0x...", amount: "500" }
```

---

## Error Handling

All methods throw errors on failure. Use try/catch:

```javascript
try {
  await bm.purchaseAsset(5)
} catch (error) {
  console.error('Purchase failed:', error.message)
  // Common errors:
  // - "ERC20InsufficientBalance" - Not enough tokens
  // - "NotApprovedForAll" - Missing approval
  // - "ListingNotActive" - Listing was cancelled
}
```

---

## Events

The smart contract emits these events:

| Event | Parameters |
|-------|------------|
| `Listed` | listingId, seller, assetId, price, paymentToken |
| `Purchased` | listingId, buyer, seller, price |
| `ListingCancelled` | listingId |
| `BidPlaced` | listingId, bidder, price |
| `BidAccepted` | listingId, bidder, price |
| `BidWithdrawn` | listingId, bidder |
| `BundleListed` | bundleId, seller, assetIds, price |
| `BundlePurchased` | bundleId, buyer |
| `AuctionCreated` | auctionId, seller, assetId, minBid, endTime |
| `AuctionBidPlaced` | auctionId, bidder, amount |
| `AuctionSettled` | auctionId, winner, finalBid |
| `AuctionCancelled` | auctionId |

---

## Version History

| Version | Features |
|---------|----------|
| 2.0.0 | On-Chain Metadata (external OVGMetadata contract) |
| 1.5.0 | Timed Auctions |
| 1.4.0 | Batch Operations |
| 1.3.0 | Multi-Token Support |
| 1.2.0 | Marketplace Fees, Pausable |
| 1.1.0 | Bundle Names |
| 1.0.0 | Initial Release |
