# OVGrid On-Chain Metadata Model

## Overview

OVGrid uses an **on-chain metadata model** where NFT metadata (name, description, image URL, attributes) is stored directly on the blockchain via smart contracts, rather than relying on external JSON files hosted on IPFS or centralized servers.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     POLYGON MAINNET                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────┐      ┌─────────────────────┐           │
│  │   OVGAssets         │      │   OVGMetadata       │           │
│  │   (ERC-1155)        │◄────►│   (Metadata Store)  │           │
│  │                     │      │                     │           │
│  │ • mint()            │      │ • setAssetMetadata()│           │
│  │ • burn()            │      │ • setAssetAttributes│           │
│  │ • uri() ────────────┼──────┼─► Generates JSON    │           │
│  │ • contractURI()     │      │                     │           │
│  └─────────────────────┘      └─────────────────────┘           │
│           │                                                      │
│           ▼                                                      │
│  ┌─────────────────────┐      ┌─────────────────────┐           │
│  │   OVGMarketplace    │      │   Pinata IPFS       │           │
│  │                     │      │   (Images only)     │           │
│  │ • list/buy/sell     │      │                     │           │
│  │ • auctions          │      │ • image.png         │           │
│  │ • rentals           │      │ • asset.glb         │           │
│  └─────────────────────┘      └─────────────────────┘           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Contract Addresses (Polygon Mainnet)

| Contract | Address | Version |
|----------|---------|---------|
| OVGAssets | `0x79f547F3E8a344D87064C15aA572a98E8d4A5c71` | 2.5.0 |
| OVGMetadata | `0x8eDB11F435918371E28AC538c95Cf1b7b6505a10` | - |
| OVGMarketplace | `0x5c721aCC1535b2eD3a96Ba1C5768c0A97Dfa77DA` | - |

## Two Levels of Metadata

### 1. Contract-Level Metadata (contractURI)

Defines how the **entire collection** appears on OpenSea and other marketplaces.

```solidity
// OVGAssetsUpgradeable.sol (V2.5.0)
function contractURI() public view returns (string memory) {
    return _contractURI;
}

function setContractURI(string memory newContractURI) external onlyRole(URI_SETTER_ROLE) {
    _contractURI = newContractURI;
}
```

**Format:** Base64-encoded JSON as data URI

```json
{
  "name": "OVGrid Assets",
  "description": "Digital assets for OVGrid Metaverse",
  "image": "https://gateway.pinata.cloud/ipfs/Qm...",
  "external_link": "https://ovgrid.com",
  "seller_fee_basis_points": 250,
  "fee_recipient": "0x..."
}
```

**Configured via:** Settings → Admin → Collection Settings

### 2. Token-Level Metadata (uri)

Defines metadata for **each individual token**.

```solidity
// OVGAssetsUpgradeable.sol
function uri(uint256 tokenId) public view override returns (string memory) {
    // Fetches from OVGMetadata contract
    // Returns: data:application/json;base64,{...}
}
```

**Format:** Base64-encoded JSON with OpenSea-compatible attributes

```json
{
  "name": "Golden Sword",
  "description": "A legendary weapon",
  "image": "https://gateway.pinata.cloud/ipfs/Qm.../image.png",
  "animation_url": "https://gateway.pinata.cloud/ipfs/Qm.../asset.glb",
  "attributes": [
    {"trait_type": "Rarity", "value": "Legendary"},
    {"trait_type": "Category", "value": "Wearables"},
    {"trait_type": "Collection", "value": "Genesis Weapons"}
  ]
}
```

## Setting Token Metadata

### On Mint (Recommended)

```javascript
// 1. Upload image to Pinata
const imageUrl = await pinata.uploadFile(imageFile)

// 2. Mint token
await assets.mint(owner, tokenId, supply, '0x')

// 3. Set metadata on-chain
await metadata.setAssetMetadataByTokenOwner(
  tokenId,
  "Golden Sword",           // title
  "A legendary weapon",     // description
  imageUrl,                 // imageUrl
  ""                        // assetUrl (optional 3D model)
)

// 4. Set attributes on-chain
await metadata.setAssetAttributesByTokenOwner(
  tokenId,
  "Legendary",    // rarity
  "Wearables",    // category
  "Genesis"       // collection (sub-collection)
)
```

### Post-Mint Update

Token owners can update their token's metadata:

```javascript
await metadata.setAssetMetadataByTokenOwner(tokenId, title, desc, imageUrl, assetUrl)
await metadata.setAssetAttributesByTokenOwner(tokenId, rarity, category, collection)
```

## Why On-Chain?

| Aspect | On-Chain (OVGrid) | Off-Chain (Traditional) |
|--------|-------------------|------------------------|
| **Permanence** | Data lives on blockchain forever | IPFS pins can expire |
| **Mutability** | Owner can update metadata | Immutable once set |
| **Dependencies** | Only needs RPC access | Needs IPFS gateway |
| **Cost** | Gas per update | One-time pin cost |
| **Verification** | Fully verifiable on-chain | Trust IPFS hash |

## OpenSea Compatibility

OpenSea reads metadata via:

1. **`contractURI()`** → Collection page info
2. **`uri(tokenId)`** → Individual token info

Both return `data:application/json;base64,...` which OpenSea decodes.

### OpenSea "Metadata: Unknown" Label

OpenSea may show "Metadata: Unknown" for tokens with on-chain JSON + external images. This is just a **classification label**, not an error. If attributes display correctly, metadata is working.

## Single Contract Architecture

OVGrid uses **one ERC-1155 contract** for all asset types:

```
OVGAssets Contract
│
├── Land Parcels (Category: "Land")
│   └── tokenId: coordinates-based
│
├── Wearables (Category: "Wearables")
│   └── tokenId: timestamp-based
│
├── Objects (Category: "Objects")
│   └── tokenId: timestamp-based
│
└── Vehicles (Category: "Vehicles")
    └── tokenId: timestamp-based
```

**Benefits:**
- Single collection on OpenSea
- Unified marketplace
- One set of royalties
- Filter by Category attribute

## Collection Settings UI

Access: **Settings → Admin → Collection Settings**

Allows changing:
- Collection name
- Collection description
- Collection image
- External link
- Royalty percentage (seller_fee_basis_points)
- Royalty recipient (fee_recipient)

Changes are stored on-chain via `setContractURI()`.

## Version History

| Version | Changes |
|---------|---------|
| 2.1.0 | Added OVGMetadata integration |
| 2.2.0 | Added setTokenMetadataUrl for direct IPFS URLs |
| 2.3.0 | Added asset attributes (rarity, category, collection) |
| 2.4.0 | Fixed uri() to exclude empty animation_url |
| 2.5.0 | Added contractURI() for OpenSea collection metadata |
