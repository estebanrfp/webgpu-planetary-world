# NFT Storage Architecture

This document describes how the world stores NFT data using a hybrid approach: binary files on IPFS (Pinata) and metadata on-chain (OVGMetadata contract).

## Overview

The world uses a **hybrid storage model**:

| Data Type | Storage | Editable |
|-----------|---------|----------|
| Image files | Pinata (IPFS) | Requires re-upload |
| 3D assets (.glb) | Pinata (IPFS) | Requires re-upload |
| Name, Description | On-chain (OVGMetadata) | Instant TX |
| Image/Asset URLs | On-chain (OVGMetadata) | Instant TX |

**Key benefit**: Editing name/description is instant (1 TX) without touching IPFS.

## Storage Structure

### Pinata (IPFS) - Binary Files Only

```
ovgrid-nft-{tokenId}/
    ├── image.{ext}     (png, jpg, gif, webp)
    └── asset.{ext}     (glb, gltf) - optional
```

**NO metadata.json** - metadata is stored on-chain.

### On-chain (OVGMetadata Contract)

```solidity
struct AssetMetadata {
    string title;       // max 64 chars
    string description; // max 160 chars
    string imageUrl;    // IPFS gateway URL
    string assetUrl;    // IPFS gateway URL (optional)
}
```

### How OpenSea/Polygonscan Read Metadata

1. Call `OVGAssets.uri(tokenId)`
2. Contract reads from `OVGMetadata.getAssetMetadata(tokenId)`
3. Returns dynamic JSON as base64 data URI:

```json
{
  "name": "Asset Name",
  "description": "Asset description",
  "image": "https://gateway.pinata.cloud/ipfs/Qm.../image.png",
  "animation_url": "https://gateway.pinata.cloud/ipfs/Qm.../asset.glb"
}
```

## Contract Addresses

### Polygon Mainnet (137)

| Contract | Address |
|----------|---------|
| OVGAssets | `0x79f547F3E8a344D87064C15aA572a98E8d4A5c71` |
| OVGMetadata | `0x8eDB11F435918371E28AC538c95Cf1b7b6505a10` |

### Polygon Amoy Testnet (80002)

| Contract | Address |
|----------|---------|
| OVGAssets | `0xD55d5049e597BA431d5C2b5c1f286532f0E0C195` |
| OVGMetadata | `0x51f36d3A3491551c92D5cE087FF22Cc5010b6B0A` |

## Data Flows

### Mint Flow

```
1. User selects image + asset files
2. Upload to Pinata (folder: ovgrid-nft-{tokenId})
   └── Returns: imageUrl, assetUrl
3. Mint token on OVGAssets
4. Set metadata on OVGMetadata.setAssetMetadata(tokenId, name, desc, imageUrl, assetUrl)
5. Save to local GenosDB cache
```

```javascript
// Simplified mint flow
async mint({ name, description, imageFile, assetFile }) {
  const tokenId = Date.now()

  // 1. Upload files to Pinata (NO metadata.json)
  const { imageUrl, assetUrl } = await pinataService.uploadNFTFiles({
    imageFile,
    assetFile,
    tokenId
  })

  // 2. Mint token
  await OVGAssets.mint(userAddress, tokenId, 1)

  // 3. Set metadata on-chain
  await OVGMetadata.setAssetMetadata(tokenId, name, description, imageUrl, assetUrl)
}
```

### Edit Text Flow (Name/Description)

```
1. User changes name or description
2. Call OVGMetadata.setAssetMetadata() with same URLs
3. Done! (1 TX, ~$0.01 on Polygon)
```

```javascript
// Edit is just 1 TX - no Pinata involved
async updateAssetMetadata(tokenId, { name, description, imageUrl, assetUrl }) {
  await OVGMetadata.setAssetMetadata(tokenId, name, description, imageUrl, assetUrl)
}
```

### Change Image/Asset Flow

```
1. User uploads new image/asset
2. Upload new files to Pinata (new folder)
3. Call OVGMetadata.setAssetMetadata() with NEW URLs
4. Unpin old folder from Pinata
```

### Burn Flow

```
1. Burn token on OVGAssets.burn()
2. Extract CID from imageUrl
3. Unpin folder from Pinata
```

## Pinata Configuration

### Folder Structure

```
Pin name: ovgrid-nft-{tokenId}

{CID}/
    ├── image.png
    └── asset.glb
```

### Keyvalues (for filtering in Pinata dashboard)

```json
{
  "tokenId": "1770156769945",
  "fileType": "folder",
  "project": "WebGPU Planetary World"
}
```

### API Endpoints Used

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/pinning/pinFileToIPFS` | Upload files as folder |
| DELETE | `/pinning/unpin/{CID}` | Remove pin on burn |

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     USER ACTIONS                                │
│  ┌─────────┐  ┌─────────────┐  ┌────────────┐  ┌─────────┐    │
│  │  MINT   │  │ EDIT TEXT   │  │CHANGE IMAGE│  │  BURN   │    │
│  └────┬────┘  └──────┬──────┘  └─────┬──────┘  └────┬────┘    │
└───────│──────────────│───────────────│──────────────│──────────┘
        │              │               │              │
        ▼              │               ▼              ▼
┌───────────────┐      │      ┌───────────────┐ ┌──────────────┐
│    PINATA     │      │      │    PINATA     │ │   PINATA     │
│ Upload folder │      │      │ Upload folder │ │ Unpin folder │
│ (image+asset) │      │      │ (new image)   │ │              │
└───────┬───────┘      │      └───────┬───────┘ └──────────────┘
        │              │              │
        ▼              ▼              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    POLYGON BLOCKCHAIN                           │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  OVGAssets.mint()    OVGMetadata.setAssetMetadata()     │   │
│  │  OVGAssets.burn()    (title, description, URLs)          │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│                    OPENSEA / POLYGONSCAN                        │
│  Calls uri(tokenId) → Returns JSON from OVGMetadata             │
└─────────────────────────────────────────────────────────────────┘
```

## File Structure

```
lib/
├── blockchain/
│   ├── pinataService.js      # uploadNFTFiles(), uploadDirectory()
│   ├── contracts.js          # Contract addresses & ABIs
│   └── BlockchainManager.js  # Contract interactions
├── config/
│   └── marketplaceConfig.js  # PINATA_CONFIG (JWT)
└── marketplace/
    └── js/
        └── services/
            └── blockchain.js # mint(), updateAssetMetadata(), burn()
```

## Key Functions

### pinataService.js

```javascript
// Upload image + asset to Pinata (NO metadata.json)
export async function uploadNFTFiles({ imageFile, assetFile, tokenId }) {
  const files = []
  if (imageFile) files.push({ file: imageFile, name: `image.${ext}` })
  if (assetFile) files.push({ file: assetFile, name: `asset.${ext}` })

  const result = await uploadDirectory(files, `ovgrid-nft-${tokenId}`)

  return {
    imageUrl: `${GATEWAY}${result.cid}/image.${ext}`,
    assetUrl: `${GATEWAY}${result.cid}/asset.${ext}`
  }
}
```

### blockchain.js

```javascript
// Mint: Pinata + On-chain metadata
async mint({ name, description, imageFile, assetFile }) {
  const { imageUrl, assetUrl } = await uploadToPinata({ imageFile, assetFile, tokenId })
  await OVGAssets.mint(user, tokenId, 1)
  await OVGMetadata.setAssetMetadata(tokenId, name, description, imageUrl, assetUrl)
}

// Edit: Only on-chain (instant)
async updateAssetMetadata(tokenId, { name, description, imageUrl, assetUrl }) {
  await OVGMetadata.setAssetMetadata(tokenId, name, description, imageUrl, assetUrl)
}

// Burn: On-chain + Unpin
async burn(tokenId, assetData) {
  await OVGAssets.burn(user, tokenId, 1)
  await unpinFromPinata(extractCidFromUrl(assetData.imageUrl))
}
```

## Comparison: Old vs New Architecture

| Aspect | Old (metadata.json in IPFS) | New (on-chain) |
|--------|----------------------------|----------------|
| Edit name | Re-upload all to Pinata | 1 TX (~$0.01) |
| Edit description | Re-upload all to Pinata | 1 TX (~$0.01) |
| Change image | Re-upload + unpin | Upload + 1 TX + unpin |
| Pinata entries | 1 folder with 3 files | 1 folder with 2 files |
| OpenSea display | Reads IPFS URL | Reads uri() → dynamic JSON |

## Error Handling

```javascript
// Check if OVGMetadata is available (testnet vs mainnet)
if (!bm.contracts.metadata) {
  throw new Error('OVGMetadata not deployed on this network')
}

// Unpin errors are non-fatal
try {
  await unpinFromPinata(cid)
} catch (e) {
  console.warn('Unpin failed:', e.message)
  // Continue - don't block burn
}
```

## Troubleshooting

### Token shows "Metadata: Unknown" on OpenSea

**Cause**: The `setAssetMetadata()` call failed during mint due to:
- Contract authorization (fixed in V2.2.0)
- Network error or timeout
- Contract not initialized

**Fix for existing tokens** (run as deployer/owner):
```bash
npx hardhat run scripts/mainnet-fix-token-metadata.js --network polygonMainnet
```

Edit the script to set the correct tokenId, name, and Pinata URLs.

### V2.2.0 Upgrade (setAssetMetadataByTokenOwner)

The original `setAssetMetadata()` requires owner or marketplace authorization. V2.2.0 adds `setAssetMetadataByTokenOwner()` which allows any token holder to set metadata for tokens they own.

**Upgrade steps**:
```bash
npx hardhat run scripts/upgrade-metadata-v220.js --network polygonMainnet
```

This will:
1. Upgrade OVGMetadata contract
2. Set `assetsContract` reference for ownership verification

## Changelog

### 2026-02-04 (v6) - Token Owner Metadata (V2.2.0)
- Added `setAssetMetadataByTokenOwner()` - any token owner can set metadata
- Added `assetsContract` reference for ownership verification
- Frontend now tries `setAssetMetadataByTokenOwner` first, falls back to `setAssetMetadata`
- Created `upgrade-metadata-v220.js` and `mainnet-fix-token-metadata.js` scripts

### 2026-02-04 (v5) - Testnet Deployment
- Deployed OVGMetadata on Polygon Amoy testnet
- Both mainnet and testnet now have full functionality
- Added set-metadata-contract-testnet.js script

### 2026-02-04 (v4) - On-chain Metadata
- **Major change**: Metadata stored on-chain via OVGMetadata contract
- Pinata only stores image + asset files (NO metadata.json)
- `mint()` calls `OVGMetadata.setAssetMetadata()`
- `updateAssetMetadata()` only does TX on-chain (instant)
- Edit name/description = instant, no re-upload needed

### 2026-02-04 (v1-v3)
- Folder structure iterations
- Files at CID root
- Single unpin on burn

### 2026-02-03
- Initial Pinata integration
- Unpin on burn functionality
