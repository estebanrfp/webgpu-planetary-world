# Marketplace - Upgrade Guide

> How to upgrade the smart contracts to new versions.

---

## Overview

The OVGMarketplace uses the **UUPS (Universal Upgradeable Proxy Standard)** pattern from OpenZeppelin. This allows upgrading the contract logic while preserving:

- Contract address (proxy stays the same)
- All stored data (listings, bids, etc.)
- User balances and approvals

---

## Architecture

```
┌─────────────────┐     ┌─────────────────────┐
│   User/DApp     │────▶│   Proxy Contract    │
└─────────────────┘     │   (Fixed Address)   │
                        └──────────┬──────────┘
                                   │ delegatecall
                        ┌──────────▼──────────┐
                        │  Implementation V1  │ ◀── Can be upgraded
                        │  Implementation V2  │
                        │  Implementation V3  │
                        └─────────────────────┘
```

---

## Prerequisites

1. **Owner Role**: Only the contract owner can upgrade
2. **Hardhat**: With `@openzeppelin/hardhat-upgrades` plugin
3. **Private Key**: Deployer wallet with POL for gas

---

## Step-by-Step Upgrade Process

### 1. Prepare the New Contract

Ensure the new contract:
- Inherits from the same base contracts
- Does NOT change storage layout order
- Only APPENDS new state variables at the end
- Has a new `reinitializer` function for initialization

```solidity
// CORRECT: Append new variables at the end
contract OVGMarketplaceUpgradeable {
    // V1.0 variables (DO NOT MODIFY ORDER)
    IERC20 public ovgToken;
    IOVGAssets public ovgAssets;
    mapping(uint256 => Listing) public listings;
    // ...existing variables...

    // V1.5 variables (APPEND HERE)
    mapping(uint256 => TimedAuction) public timedAuctions;
    uint256 public nextAuctionId;
}
```

### 2. Add Reinitializer Function

```solidity
/// @notice Initialize V1.5 state (auctions)
function initializeV1_5() public reinitializer(5) {
    // Initialize new state if needed
    // Mappings auto-initialize to empty, so usually nothing here
}
```

**Reinitializer Numbers:**
| Version | Reinitializer |
|---------|---------------|
| V1.0 | `initializer` |
| V1.2 | `reinitializer(2)` |
| V1.3 | `reinitializer(3)` |
| V1.5 | `reinitializer(5)` |

### 3. Update Version Function

```solidity
function version() public pure virtual returns (string memory) {
    return "1.5.0";
}
```

### 4. Compile and Test

```bash
cd blockchain

# Compile
pnpm hardhat compile --force

# Run all tests
pnpm hardhat test

# Verify test count
# Expected: 194 tests passing
```

### 5. Validate Upgrade Compatibility

```bash
# The upgrade script auto-validates, but you can check manually:
pnpm hardhat run scripts/check-upgrade.js --network polygonAmoy
```

### 6. Deploy to Testnet First

```bash
# Set environment variable
export CONTRACT_NAME=OVGMarketplace

# Deploy new implementation
pnpm hardhat run scripts/upgrade-contract.js --network polygonAmoy
```

**Expected Output:**
```
====================================================
Upgrading OVGMarketplace on: polygonAmoy
====================================================

Validating upgrade...
Upgrade validation passed!

Performing upgrade...
Upgrade successful!
New implementation: 0x...
Contract version: 1.5.0
```

### 7. Call Reinitializer

Create a script or use hardhat console:

```javascript
// scripts/init-v15.js
const hre = require("hardhat");

async function main() {
  const marketplace = await hre.ethers.getContractAt(
    "OVGMarketplaceUpgradeable",
    "0x...PROXY_ADDRESS..."
  );

  const tx = await marketplace.initializeV1_5();
  await tx.wait();

  console.log("Initialized V1.5!");
  console.log("Version:", await marketplace.version());
}

main();
```

```bash
pnpm hardhat run scripts/init-v15.js --network polygonAmoy
```

### 8. Test on Testnet

- Create a test auction
- Place bids
- Settle auction
- Verify all existing features still work

### 9. Deploy to Mainnet

```bash
# IMPORTANT: Double-check you're ready!
export CONTRACT_NAME=OVGMarketplace

pnpm hardhat run scripts/upgrade-contract.js --network polygonMainnet
pnpm hardhat run scripts/init-v15.js --network polygonMainnet
```

### 10. Verify on Polygonscan (Optional)

```bash
pnpm hardhat verify --network polygonMainnet 0xNEW_IMPLEMENTATION_ADDRESS
```

---

## Upgrade History

| Date | Version | Implementation | Changes |
|------|---------|----------------|---------|
| 2026-02-04 | 2.1.0 | `0x4841042cA9D864d5A16678Cc1830dBd0D0dFfbc4` | updateAuction, Custom Errors, Size Optimization |
| 2026-01-23 | 1.5.0 | `0xE82d2C4F6cc2192EaAd79997300F08D5744524FF` | Timed Auctions |
| 2026-01-23 | 1.4.0 | `0x284F8c1277B654AedA08CCb0ff1d83888987E681` | Batch Operations |
| 2026-01-23 | 1.3.0 | - | Multi-Token Support |
| 2026-01-22 | 1.2.0 | - | Marketplace Fees, Pausable |

---

## Rollback Procedure

If an upgrade fails or has issues:

### Option 1: Deploy Fix Forward
1. Fix the issue in a new version
2. Deploy another upgrade

### Option 2: Emergency Pause
1. Call `pauseMarketplace()` to stop all operations
2. Investigate the issue
3. Deploy fix and unpause

**Note:** UUPS does NOT support true rollback to previous implementation. The proxy always points to the latest implementation.

---

## Storage Layout Rules

**NEVER:**
- Change the order of existing state variables
- Remove existing state variables
- Change the type of existing variables
- Insert new variables between existing ones

**ALWAYS:**
- Append new variables at the end
- Use `reinitializer(N)` with incrementing N
- Test thoroughly on testnet first

### Example: Safe vs Unsafe

```solidity
// ORIGINAL (V1.0)
contract V1 {
    uint256 public a;
    uint256 public b;
}

// SAFE UPGRADE (V1.1)
contract V1_1 {
    uint256 public a;     // Same position
    uint256 public b;     // Same position
    uint256 public c;     // NEW - appended at end ✅
}

// UNSAFE UPGRADE ❌
contract V1_1_BAD {
    uint256 public a;
    uint256 public c;     // INSERTED - breaks storage! ❌
    uint256 public b;
}
```

---

## Troubleshooting

### "Upgrade validation failed"

The new contract has incompatible storage layout. Check:
- Variable order unchanged
- No removed variables
- No type changes

### "Initializer already initialized"

The reinitializer was already called. Each reinitializer can only run once.

### "Not authorized"

Only the contract owner can upgrade. Verify:
```javascript
const owner = await marketplace.owner()
const signer = await ethers.getSigner()
console.log('Owner:', owner)
console.log('Signer:', await signer.getAddress())
```

### Gas estimation failed

The contract might be too large. Try:
- Reduce optimizer runs (e.g., `runs: 10`)
- Enable `viaIR: true` in hardhat config
- Split contract into libraries

---

## Mainnet Addresses

| Contract | Proxy Address |
|----------|---------------|
| OVGMarketplace | `0x5c721aCC1535b2eD3a96Ba1C5768c0A97Dfa77DA` |
| OVGToken | `0x0fB62F6ea4A58A610b3cF19DB401778B4126d28E` |
| OVGAssets | `0x79f547F3E8a344D87064C15aA572a98E8d4A5c71` |
| OVGLandClaim | `0xb11D83816c8645034099F09A011F30E1685cb7e8` |

---

## Scripts Reference

| Script | Purpose |
|--------|---------|
| `scripts/upgrade-contract.js` | Deploy new implementation and upgrade proxy |
| `scripts/check-version.js` | Check current contract version |
| `scripts/deploy-upgradeable.js` | Initial deployment (proxy + implementation) |
