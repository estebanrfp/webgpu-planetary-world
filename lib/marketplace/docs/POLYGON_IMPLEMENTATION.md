# Polygon Blockchain Implementation

> Blockchain contracts, addresses, scripts, and optimizations for the OVGrid Marketplace on Polygon.

## Related Documents

- [GENOSDB_INTEGRATION.md](./GENOSDB_INTEGRATION.md) — Data layer, AI rules, GenosDB patterns, pagination
- [ERC1155_SUPPLY_MODEL.md](./ERC1155_SUPPLY_MODEL.md) — Supply management, inventory grouping, batch operations

---

## Current Status

**Deployed and Production Ready**

| Network | Status | Contracts |
|---------|--------|-----------|
| Polygon Mainnet (137) | ✅ Active | OVGAssets, OVGMarketplace, OVGToken |
| Polygon Amoy Testnet (80002) | ✅ Active | OVGAssets, OVGMarketplace, OVGToken |

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    MARKETPLACE UI                           │
│  (lib/marketplace/js/app-core.js)                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐    ┌─────────────────────────────────┐│
│  │  GenosDB        │    │  BlockchainManager.js           ││
│  │  (Local Cache)  │◄───│  - getOwnedAssets()             ││
│  │                 │    │  - getActiveListings()          ││
│  └─────────────────┘    │  - fetchTokenMetadata()         ││
│                         └─────────────────────────────────┘│
│                                    │                        │
└────────────────────────────────────┼────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────┐
│                  POLYGON BLOCKCHAIN                         │
├─────────────────────────────────────────────────────────────┤
│  OVGAssets (ERC-1155)     │  OVGMarketplace                │
│  - mint()                 │  - createListing()             │
│  - burn()                 │  - purchase()                  │
│  - uri() → Pinata IPFS    │  - cancelListing()             │
│  - setTokenMetadataUrl()  │  - rentAsset()                 │
│                           │  - placeBid()                  │
└─────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────┐
│                    PINATA IPFS                              │
│  - Token metadata JSON                                      │
│  - Asset images                                             │
│  - Gateway: gateway.pinata.cloud/ipfs/{CID}                │
└─────────────────────────────────────────────────────────────┘
```

## Contract Addresses

### Polygon Mainnet (Chain ID: 137)

| Contract | Proxy Address | Type |
|----------|---------------|------|
| OVGAssets | `0x79f547F3E8a344D87064C15aA572a98E8d4A5c71` | UUPS Upgradeable |
| OVGMarketplace | `0x5c721aCC1535b2eD3a96Ba1C5768c0A97Dfa77DA` | UUPS Upgradeable |
| OVGToken | `0x0fB62F6ea4A58A610b3cF19DB401778B4126d28E` | UUPS Upgradeable |
| OVGMetadata | `0x8eDB11F435918371E28AC538c95Cf1b7b6505a10` | UUPS Upgradeable (v2.4.0) |

### Polygon Amoy Testnet (Chain ID: 80002)

| Contract | Proxy Address | Type |
|----------|---------------|------|
| OVGAssets | `0xD55d5049e597BA431d5C2b5c1f286532f0E0C195` | UUPS Upgradeable |
| OVGMarketplace | `0x9982f5e65A342D7b8CAd1Ab3C83585916D98542a` | UUPS Upgradeable |
| OVGToken | `0x564f99BAD84cE3fD36D5597874633eddBB304b8f` | UUPS Upgradeable |
| OVGMetadata | `0x51f36d3A3491551c92D5cE087FF22Cc5010b6B0A` | UUPS Upgradeable |

## Token Metadata Flow

### Minting with Metadata

1. **Upload image to Pinata IPFS**
2. **Create metadata JSON** with image URL
3. **Upload metadata JSON to Pinata**
4. **Mint token** via `OVGAssets.mint()`
5. **Set metadata URL** via `OVGAssets.setTokenMetadataUrl(tokenId, ipfsUrl)`

### Metadata JSON Format (ERC-1155 Standard)

```json
{
  "name": "Asset Name",
  "description": "Asset description",
  "image": "https://gateway.pinata.cloud/ipfs/QmImageCID",
  "external_url": "https://ovgrid.com",
  "attributes": [
    { "trait_type": "Collection", "value": "OVGrid" },
    { "trait_type": "Category", "value": "Land" },
    { "trait_type": "Rarity", "value": "Rare" }
  ]
}
```

### Fetching Metadata in Marketplace

```javascript
// BlockchainManager calls uri() to get metadata URL
const metadataUrl = await assets.uri(tokenId)
// Returns: https://gateway.pinata.cloud/ipfs/QmMetadataCID

// Then fetches the JSON
const response = await fetch(metadataUrl)
const metadata = await response.json()
// { name, description, image, attributes... }
```

## Configuration

### Network Settings (`lib/config/marketplaceConfig.js`)

```javascript
// Default network (changed from TESTNET to MAINNET on 2026-02-03)
let _activeNetwork = POLYGON_CONFIG.MAINNET

// RPC block range limit (mainnet RPCs limit to 50k blocks)
ACTIVITY_BLOCK_RANGE: 45000  // ~25 hours on Polygon

// Asset discovery (empty - uses TransferSingle events)
KNOWN_ASSET_IDS: []
```

### Key Changes (2026-02-03)

| Change | Before | After | Reason |
|--------|--------|-------|--------|
| Default network | TESTNET | MAINNET | Cleaner state, no corrupt data |
| ACTIVITY_BLOCK_RANGE | 500,000 | 45,000 | Mainnet RPC limit is 50k |
| KNOWN_ASSET_IDS | [1,2,3,4,5,1000-1005] | [] | Caused ghost assets |
| Corrupt listings | Shown | Filtered | Skip sellers with invalid addresses |

## Asset Discovery

Assets are discovered via blockchain events, not hardcoded IDs:

```javascript
// 1. Query TransferSingle events (received by user)
const singleReceived = await assets.queryFilter(
  assets.filters.TransferSingle(null, null, userAddress),
  fromBlock
)

// 2. Query TransferBatch events (received by user)
const batchReceived = await assets.queryFilter(
  assets.filters.TransferBatch(null, null, userAddress),
  fromBlock
)

// 3. Check balance for each discovered ID
for (const id of discoveredIds) {
  const balance = await assets.balanceOf(userAddress, id)
  if (balance > 0n) {
    owned.push({ id, balance })
  }
}
```

## Listing Validation

Corrupt listings are filtered by checking seller address validity:

```javascript
// Skip listings with invalid seller addresses
const sellerHex = listing.seller?.toLowerCase() || ''
const isInvalidSeller = !sellerHex ||
  sellerHex === '0x0000000000000000000000000000000000000000' ||
  sellerHex.replace(/0/g, '').length < 8 // Too many zeros = corrupted

if (isInvalidSeller) {
  console.warn(`Skipping listing ${id}: invalid seller`)
  return null
}
```

## Scripts

### Mint Token with Metadata

```bash
cd blockchain
node scripts/mainnet-mint-to-user.js
```

### Burn Token

```bash
cd blockchain
node scripts/mainnet-burn-all.js
```

### Check Token State

```bash
node -e "
import { ethers } from 'ethers'
const provider = new ethers.JsonRpcProvider('https://polygon-rpc.com')
const contract = new ethers.Contract(ASSETS_ADDRESS, ['function uri(uint256) view returns (string)'], provider)
const uri = await contract.uri(TOKEN_ID)
console.log('Metadata URL:', uri)
"
```

## Fees Structure

> See [ERC1155_SUPPLY_MODEL.md](./ERC1155_SUPPLY_MODEL.md#fee-structure) for detailed fee breakdown with examples.

| Action | Fee | Recipient |
|--------|-----|-----------|
| Sale / Rental / Auction | 2.5% | Marketplace |
| Creator Royalty | 0-25% | Original creator (immutable after mint) |

## Security Considerations

- **UUPS Upgradeable** - All contracts use upgradeable proxy pattern
- **Role-based access** - MINTER_ROLE, ADMIN_ROLE for privileged operations
- **Reentrancy guards** - On all payment functions
- **Input validation** - URL lengths, price limits

## Asset Detail Panel Operations

The Asset Detail Panel in Inventory view provides the following blockchain operations:

### Edit Name
- User can edit asset name directly in the panel
- Character counter shows 0-64 character limit
- Saves to GenosDB locally and updates on-chain via `setTokenMetadataUrl()`

### Burn Asset
- Two-step confirmation: "Burn" → "Confirm Burn" (orange button)
- Calls `OVGAssets.burn(account, tokenId, amount)`
- Automatically unpins image and metadata from Pinata IPFS
- Removes asset from GenosDB

### Update Metadata
- Two-step confirmation: "Update" → "Confirm" (orange button)
- Uploads new metadata JSON to Pinata
- Calls `setTokenMetadataUrl(tokenId, newIpfsUrl)` on blockchain
- Updates local GenosDB cache

## Network Auto-Initialization

Network preference is loaded from localStorage at module initialization:

```javascript
// lib/config/marketplaceConfig.js
let _activeNetwork = (() => {
  try {
    const saved = localStorage.getItem('ovgrid_network')
    if (saved === 'TESTNET') return POLYGON_CONFIG.TESTNET
  } catch (e) { /* localStorage not available */ }
  return POLYGON_CONFIG.MAINNET
})()
```

This ensures the correct network is used immediately, without waiting for async initialization.

## Cache Management

### Clear Cache (Settings → Admin tab)

The Clear Cache function clears all cached data:

```javascript
async function clearCache() {
  // 1. Clear in-memory MarketplaceCache
  const { MarketplaceCache } = await import('/lib/blockchain/MarketplaceCache.js')
  MarketplaceCache.clear()

  // 2. Clear GenosDB collections
  const db = await getDb()
  await db.clear()

  // 3. Refresh view
  window.refreshCurrentView?.()
}
```

## Multicall3 Optimization

BlockchainManager uses Multicall3 to batch multiple RPC calls into single requests, significantly reducing latency and RPC costs.

### Multicall3 Address

```
0xcA11bde05977b3631167028862bE2a173976CA11 (same on all EVM chains)
```

### Optimized Functions

| Function | Before | After | Improvement |
|----------|--------|-------|-------------|
| `getActiveListings()` | ~50+ calls | ~5 calls | 90% reduction |
| `getOwnedAssets()` | N balance calls | 1 call | N→1 |
| `getActiveAuctions()` | 2N calls | 2 calls | N→1 |
| `getUserGlobalBids()` | N calls | 1 call | N→1 |
| `getReceivedGlobalBids()` | M×N calls | 1 call | M×N→1 |

### Implementation Pattern

```javascript
// lib/blockchain/BlockchainManager.js

// Encode multiple calls
const calls = ids.map(id => ({
  target: contractAddress,
  callData: contract.interface.encodeFunctionData('getFunction', [id])
}))

// Execute batch
const results = await multicall.tryAggregate.staticCall(false, calls)

// Decode results
results.forEach(({ success, returnData }, i) => {
  if (success) {
    const decoded = contract.interface.decodeFunctionResult('getFunction', returnData)
    // Process decoded data
  }
})
```

### Helper Functions

```javascript
// Execute batch calls
await multicall(calls)

// Encode call for multicall
encodeCall(contract, 'functionName', [args])

// Decode result from multicall
decodeResult(contract, 'functionName', returnData)
```

## Author

Esteban Fuster Pozzi (@estebanrfp) — Full Stack JavaScript Developer
