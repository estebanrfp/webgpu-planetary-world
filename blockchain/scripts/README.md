# Blockchain Scripts

Command-line utilities for managing OVGrid smart contracts on Polygon.

## Prerequisites

```bash
cd blockchain
pnpm install
cp .env.example .env
# Edit .env with your PRIVATE_KEY
```

## Scripts Overview

### Asset Management

| Script | Purpose | Network |
|--------|---------|---------|
| `burn-assets.js` | Burn ERC-1155 tokens | Both |
| `mint-assets.js` | Mint new assets | Testnet |
| `mainnet-mint-to-user.js` | Mint to specific user | Mainnet |
| `check-balances.js` | Check token balances | Both |

### Metadata Management

| Script | Purpose | Network |
|--------|---------|---------|
| `set-token-metadata-url.js` | Set token metadata URL | Both |
| `upload-and-set-metadata.js` | Upload to Pinata + set URL | Both |
| `fix-token-metadata.js` | Fix broken metadata | Both |
| `check-uri.js` | Check token URI | Both |

### Contract Deployment & Upgrades

| Script | Purpose | Network |
|--------|---------|---------|
| `deploy.js` | Deploy contracts | Testnet |
| `deploy-mainnet.js` | Deploy to mainnet | Mainnet |
| `upgrade-v2.2.0.js` | Upgrade to V2.2.0 | Both |
| `check-implementation.js` | Check proxy implementation | Both |

### Diagnostics

| Script | Purpose | Network |
|--------|---------|---------|
| `check-matic.js` | Check MATIC balance | Both |
| `check-roles.js` | Check contract roles | Both |
| `diagnose-mainnet.js` | Full mainnet diagnostics | Mainnet |
| `check-metadata-setup.js` | Verify metadata configuration | Both |

## Usage Examples

### Burn Assets

```bash
# Burn specific tokens on mainnet (default)
node scripts/burn-assets.js 1770150606098 1770150936120

# Burn on testnet
node scripts/burn-assets.js --testnet 1234567890

# Help
node scripts/burn-assets.js
# Output: Usage: node burn-assets.js [--testnet] <tokenId1> <tokenId2> ...
```

### Check Token Balance

```bash
node scripts/check-balances.js
# Shows all token balances for the wallet
```

### Set Metadata URL

```bash
node scripts/set-token-metadata-url.js <tokenId> <ipfsUrl>
# Example: node scripts/set-token-metadata-url.js 123 https://gateway.pinata.cloud/ipfs/Qm...
```

### Upload and Set Metadata

```bash
node scripts/upload-and-set-metadata.js <tokenId> <imagePath> <name> <description>
# Uploads image to Pinata, creates metadata JSON, sets URL on chain
```

## Environment Variables

```env
# Required
PRIVATE_KEY=your_wallet_private_key

# Optional (for Pinata uploads)
PINATA_JWT=your_pinata_jwt_token
```

## Network Configuration

Scripts auto-detect network from flags:

| Flag | Network | Chain ID | RPC |
|------|---------|----------|-----|
| (none) | Polygon Mainnet | 137 | polygon-bor-rpc.publicnode.com |
| `--testnet` | Polygon Amoy | 80002 | rpc-amoy.polygon.technology |

## Contract Addresses

### Mainnet (137)
- OVGAssets: `0x79f547F3E8a344D87064C15aA572a98E8d4A5c71`
- OVGMarketplace: `0x5c721aCC1535b2eD3a96Ba1C5768c0A97Dfa77DA`
- OVGToken: `0x0fB62F6ea4A58A610b3cF19DB401778B4126d28E`

### Testnet (80002)
- OVGAssets: `0xD55d5049e597BA431d5C2b5c1f286532f0E0C195`
- OVGMarketplace: `0x9982f5e65A342D7b8CAd1Ab3C83585916D98542a`
- OVGToken: `0x564f99BAD84cE3fD36D5597874633eddBB304b8f`

## Troubleshooting

### Transaction Timeout
```
Error: Transaction timeout - check your wallet
```
- Increase gas price or wait for network congestion to clear
- Check transaction on Polygonscan using the TX hash

### Balance is 0
```
Balance: 0
Skipping - no balance
```
- Token doesn't exist or already burned
- Wrong network (mainnet vs testnet)

### Invalid Seller / Corrupt Listing
- Listing has invalid data, likely from old contract version
- Use `check-balances.js` to verify actual ownership

## Author

Esteban Fuster Pozzi (@estebanrfp)
