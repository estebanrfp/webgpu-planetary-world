# OVGrid Marketplace - Production Roadmap

> **Last Updated:** 2026-01-24
> **Current Version:** 1.5.0 (Polygon Mainnet + Amoy)
> **Status:** 🚀 PRODUCTION - v1.5.0 with Timed Auctions

---

## Quick Status

| Category | Progress | Notes |
|----------|----------|-------|
| Smart Contracts | ✅ 100% | v1.5.0 deployed on Mainnet + Amoy |
| Frontend UI Core | ✅ 100% | Admin + Multi-token + Batch + Auctions UI complete |
| Contract Tests | ✅ 100% | 194 tests passing (91 base + 44 multi-token + 15 batch + 44 auctions) |
| Frontend Tests | ✅ 100% | 251 tests passing (72.90% coverage) |
| Security Audit | ✅ 100% | Slither published in SECURITY.md |
| Mainnet Deploy | ✅ 100% | 🚀 v1.5.0 Deployed 2026-01-23 |
| Production Ready | ✅ 100% | **All critical fixes + frontend tests implemented** |

---

## 🔍 Production Readiness Audit (2026-01-24)

> **Auditoría exhaustiva realizada para evaluar si el marketplace está listo para uso en producción mainnet.**

### Scores por Área

| Área | Score | Estado |
|------|-------|--------|
| Smart Contracts | 9/10 | ✅ Excelente - Slither 0 high/medium, ReentrancyGuard, Pausable |
| Frontend Error Handling | 9/10 | ✅ ErrorLogger centralizado + tx.wait() con timeout |
| State Management | 9/10 | ✅ Memory leaks corregidos, cleanup en destroy/close |
| Security (XSS/Validation) | 9/10 | ✅ XSS protegido + address checksum validation |
| Infrastructure | 8/10 | ✅ Timeouts + pre-validación batch + race condition guards |
| Testing | 9/10 | ✅ 194 contract tests + 251 frontend tests (72.90% coverage) |
| **OVERALL** | **9/10** | ✅ **Production Ready para Mainnet** |

### ✅ Issues Críticos (RESUELTOS)

| ID | Issue | Estado | Solución |
|----|-------|--------|----------|
| C1 | Sin monitoreo de errores | ✅ RESUELTO | `lib/utils/ErrorLogger.js` con buffer local + global handlers |
| C2 | Batch sin pre-validación | ✅ RESUELTO | `validateBatchPurchase()` antes de tx |
| C3 | Network timeout sin reintentos | ✅ RESUELTO | `withTimeout()` en tx.wait() (60s) |
| C4 | Memory leaks en intervals | ✅ RESUELTO | Cleanup en ProfileUI.destroy() + marketplace close() |

### ✅ Issues de Alta Prioridad (RESUELTOS)

| ID | Issue | Estado | Solución |
|----|-------|--------|----------|
| H1 | Address validation sin checksum | ✅ RESUELTO | `isValidEthAddress()` usa `ethers.isAddress()` |
| H2 | Race conditions en transacciones | ✅ RESUELTO | `isProcessing` guards en todos los handlers |
| H3 | Network switch sin cleanup | ✅ RESUELTO | `state.reset()` completo en AdminHandlers |
| H4 | Silent catches sin logs | ✅ RESUELTO | `ErrorLogger.warn/debug` en catches |

### Veredicto

| Entorno | Estado | Notas |
|---------|--------|-------|
| **Testnet (Amoy)** | ✅ **SEGURO** | Listo para uso |
| **Mainnet (bajo tráfico)** | ✅ **SEGURO** | Error logging + timeouts implementados |
| **Mainnet (alto tráfico)** | ✅ **LISTO** | Batch pre-validation + race condition guards |

### Tiempo Restante para 100% Production-Ready

- **✅ Fixes críticos (C1-C4):** COMPLETADO
- **✅ Fixes alta prioridad (H1-H4):** COMPLETADO
- **✅ Frontend tests básicos:** COMPLETADO (251 tests, 72.90% coverage)
- **❌ Verificación Polygonscan:** 1 día (pendiente, opcional)

---

## 🎯 Production Readiness Checklist

> **Current Status: 100% Production-Ready** - Contracts + Frontend tests + Critical fixes all complete.

### 🔴 Crítico (Bloqueadores)

| Task | Status | Effort | Notes |
|------|--------|--------|-------|
| Publicar reporte Slither | ✅ | 1 día | `SECURITY.md` creado - 0 high/medium, 14 low (mitigados) |
| SRI hashes para CDN | ✅ | 1 hora | ethers.js con SRI, genosdb pinned v0.12.6 |
| Documentación técnica | ✅ | 2-3 días | `docs/marketplace/` - API.md, UPGRADE.md, ARCHITECTURE.md |

### 🟡 Importante (Recomendado)

| Task | Status | Effort | Notes |
|------|--------|--------|-------|
| **C1: Error monitoring** | ✅ | 2 días | `lib/utils/ErrorLogger.js` - logging local con buffer |
| **C2: Batch pre-validation** | ✅ | 1 día | `validateBatchPurchase()` en BlockchainManager |
| **C3: Network timeouts** | ✅ | 1 día | `withTimeout()` en tx.wait() (60s) |
| **C4: Interval cleanup** | ✅ | 1 día | Cleanup en destroy/close |
| **H1-H4: High priority fixes** | ✅ | 2 días | Address checksum, race guards, network cleanup, ErrorLogger |
| Refactor index.js | ✅ | 1 semana | 1770 → 233 LOC (arquitectura modular) |
| Frontend tests | ✅ | 2 días | 251 tests, 72.90% coverage (utils, state, validation) |
| Rate limiting contract | ❌ | 3 días | Máx listings/bids por usuario |

### 🟢 Nice-to-Have (Futuro)

| Task | Status | Effort | Notes |
|------|--------|--------|-------|
| Verificación Polygonscan | ❌ | 1 día | Verificar código + logo |
| Trust Wallet listing | ❌ | 1 semana | PR con logo 256x256 |
| Web3Modal | ❌ | 2 días | Selector de wallets |
| IndexedDB cache | ❌ | 3 días | Persistencia offline |
| Service Worker | ❌ | 1 semana | PWA + push notifications |

### Riesgos Identificados

| Área | Riesgo | Mitigación | Acción Requerida |
|------|--------|------------|------------------|
| Smart Contract | BAJO | UUPS, SafeERC20, ReentrancyGuard, Pausable | ✅ Ninguna |
| Frontend | BAJO | ErrorLogger + race guards + memory leak fixes | ✅ Ninguna |
| Network | BAJO | withTimeout (60s) + pre-validation | ✅ Ninguna |
| Operaciones | BAJO | ErrorLogger.getBuffer() para debugging local | ✅ Ninguna |
| Dependencias | BAJO | ethers.js con SRI hash, genosdb pinned v0.12.6 | ✅ Ninguna |

### Métricas de Código

```
Smart Contracts:     ~2,500 LOC (Solidity)
Frontend:           ~15,000 LOC (JavaScript)
Contract Tests:      ~2,766 LOC (194 tests)
Frontend Tests:      ~2,581 LOC (251 tests)

index.js complexity: ✅ BAJA (233 LOC) - refactorizado en módulos
Test coverage:       ✅ Contracts OK, ✅ Frontend 72.90%
```

#### Frontend Test Coverage Details

| File | Coverage | Tests |
|------|----------|-------|
| `lib/utils/withRetry.js` | 97.62% | 14 |
| `lib/config/marketplaceConfig.js` | 87.97% | - |
| `lib/ui/marketplace/state/MarketplaceState.js` | 81.98% | 43 |
| `lib/utils/ErrorLogger.js` | 78.57% | 14 |
| `lib/ui/marketplace/utils.js` | 64.29% | 64 |

```bash
# Run frontend tests
bun test

# Run with coverage
bun test --coverage

# Watch mode
bun test --watch
```

---

## Feature Checklist

### 🟢 Funcionalidades de Mercado (Trading)

| Feature | Smart Contract | Frontend UI | Status |
|---------|----------------|-------------|--------|
| Ventas directas | ✅ `listAsset`, `purchase` | ✅ SellWizard, BuyWizard | ✅ **Completado** |
| Sistema de Ofertas (Bidding) | ✅ `placeBid`, `acceptBid`, `withdrawBid` | ✅ BidWizard, OffersTab | ✅ **Completado** |
| Ofertas globales (items no listados) | ✅ `placeGlobalBid`, `acceptGlobalBid` | ✅ GlobalBidWizard | ✅ **Completado** |
| Alquileres (Rentals) | ✅ `rent`, `listAsset(isRental=true)` | ✅ RentWizard | ✅ **Completado** |
| Extensión de Renta | ✅ `extendRental` | ✅ ExtendRentalWizard | ✅ **Completado** |
| Bundles (paquetes) | ✅ `listBundle`, `purchaseBundle` | ✅ BundleWizard | ✅ **Completado** |
| Nombres de bundles on-chain | ✅ `setBundleName`, `getBundleName` | ✅ RenameWizard | ✅ **Completado** |
| Subastas temporizadas | ✅ `createAuction`, `placeBidOnAuction`, `settleAuction` | ✅ CreateAuctionWizard, PlaceBidWizard, AuctionCard | ✅ **Completado v1.5.0** |

### 🟢 Economía y Gobernanza (Tokenomics)

| Feature | Smart Contract | Frontend UI | Status |
|---------|----------------|-------------|--------|
| Royalties (EIP-2981) | ✅ `setRoyalty`, `getRoyaltyInfo` | ✅ RoyaltyWizard | ✅ **Completado** |
| Marketplace Fee (2.5%) | ✅ `marketplaceFee`, `setMarketplaceFee` | ✅ AdminTab, BuyWizard | ✅ **Completado** |
| Fee Recipient configurable | ✅ `feeRecipient`, `setFeeRecipient` | ✅ AdminTab | ✅ **Completado** |
| Withdraw fees acumulados | ✅ `withdrawFees`, `accumulatedFees` | ✅ AdminTab | ✅ **Completado** |
| Emergency Pause | ✅ `pause`, `unpause` | ✅ AdminTab, PausedBanner | ✅ **Completado** |

### 🟢 Análisis y Estadísticas

| Feature | Backend | Frontend UI | Status |
|---------|---------|-------------|--------|
| Dashboard de Vendedor | ✅ MarketplaceCache | ✅ StatsTab (earnings, volume) | ✅ **Completado** |
| Historial de actividad | ✅ Events blockchain | ✅ ActivityTab | ✅ **Completado** |
| Gráficas de Precio | ✅ Price history data | ✅ StatsTab (charts) | ✅ **Completado** |
| Ofertas recibidas/enviadas | ✅ Bids mapping | ✅ OffersTab | ✅ **Completado** |

### 🟡 Pendientes (Post-Launch)

| Feature | Status | Prioridad | Notas |
|---------|--------|-----------|-------|
| **Verificación Polygonscan** | ❌ Pendiente | Alta | Verificar contratos + solicitar logo |
| **Trust Wallet Assets** | ❌ Pendiente | Media | Logo 256x256 + PR al repo |
| **Previsualización 3D Real** | ❌ Pendiente | Media | Visor WebGL/WebGPU para modelos 3D |
| **Subastas temporizadas** | ✅ Completado | Media | v1.5.0 - English auctions con countdown |
| **Multi-token (USDC, USDT)** | ✅ Completado | Alta | v1.3.0 - Smart contract + UI wizards |
| **Indexación con GenosDB** | ❌ Pendiente | Alta | Reemplaza The Graph, P2P + offline-first |
| **Notificaciones push** | ❌ Pendiente | Baja | Service Workers + GenosDB real-time |

---

## Completed Features (Detail)

### Smart Contracts (v1.4.0)
- [x] Direct sales (listAsset, purchase, cancelListing)
- [x] Rentals (rent, extendRental)
- [x] Bundles (listBundle, purchaseBundle, cancelBundle)
- [x] Bundle naming on-chain (setBundleName, getBundleName)
- [x] Bidding system (placeBid, acceptBid, withdrawBid)
- [x] Global bids for unlisted NFTs (placeGlobalBid, acceptGlobalBid)
- [x] Creator royalties (setRoyalty, getRoyaltyInfo)
- [x] Marketplace fee 2.5% (configurable 0-10%)
- [x] Pausable emergency stop
- [x] UUPS upgradeable pattern
- [x] **Multi-token payments (v1.3.0)** - OVG, USDC, USDT support
  - Token whitelist (setAllowedToken, isTokenAllowed)
  - Per-listing payment token (listAssetWithToken, listBundleWithToken)
  - Multi-token bids (placeGlobalBidWithToken)
  - Fee tracking per token (getAccumulatedFees, withdrawFeesByToken)
  - SafeERC20 for secure transfers
- [x] **Batch operations (v1.4.0)** - List/buy multiple assets
  - batchListAssets (up to 15 items per transaction)
  - batchPurchase (up to 15 items per transaction)
  - Aggregated royalties and fees calculation
  - Same payment token requirement for batch purchases
- [x] **Timed Auctions (v1.5.0)** - English auctions with countdown
  - createAuction (minBid, duration 5min-30days, payment token)
  - placeBidOnAuction (1% minimum increment, auto-refund previous)
  - settleAuction (transfer asset to winner, pay seller)
  - cancelAuction (seller only, no bids)
  - Events: AuctionCreated, AuctionBidPlaced, AuctionSettled, AuctionCancelled

### Frontend UI
- [x] Inventory view (owned NFTs, listed, bundles, rented)
- [x] Explore view (browse listings)
- [x] Detail view (asset/bundle details)
- [x] Activity tab (transaction history, global/personal filter)
- [x] Offers tab (received/sent bids, global offers)
- [x] Stats tab (earnings, volume, price history charts)
- [x] All wizards (Sell, Buy, Rent, Bid, Gift, Royalty, Rename, Bundle, etc.)
- [x] **Multi-token UI (v1.3.0)** - Token selector in wizards
  - SellWizard with token selector
  - RentWizard with token selector
  - BundleWizard with token selector
  - BuyWizard shows payment token required
  - BidWizard shows payment token required
  - GlobalOfferWizard with token selector
- [x] **Batch operations UI (v1.4.0)** - Batch list/buy multiple assets
  - BatchSellWizard for listing multiple assets
  - BatchBuyWizard for purchasing multiple listings
  - Batch List button in InventoryView
  - Batch Buy toggle in ExploreView
  - AssetCard checkbox support for batch selection
- [x] **Timed Auctions UI (v1.5.0)** - Auction creation and bidding
  - CreateAuctionWizard with duration presets and token selector
  - PlaceBidWizard with countdown timer and bid validation
  - AuctionCard component with real-time countdown
  - ExploreView "Auctions" tab with active auctions
  - InventoryView "Auction" button for owned assets
  - OffersTab "My Auction Bids" section

### Infrastructure
- [x] BlockchainManager with all contract methods
- [x] MarketplaceCache for RPC optimization
- [x] GenosDB signer integration
- [x] Lazy loading for wizards/tabs

---

## Pending Tasks

### Priority 1: Admin Panel (Required for operations) ✅ COMPLETE

**Files:**
- `lib/ui/marketplace/tabs/AdminTab.js` ✅
- `lib/ui/marketplace/index.js` ✅

```
Tasks:
- [x] Create AdminTab.js component
- [x] Show current marketplace fee (basis points + percentage)
- [x] Show fee recipient address
- [x] Show accumulated fees balance
- [x] Show paused status
- [x] Button: Set marketplace fee (input 0-1000 basis points)
- [x] Button: Set fee recipient (address input)
- [x] Button: Withdraw accumulated fees
- [x] Button: Pause/Unpause marketplace
- [x] Only show tab if connected wallet is contract owner
- [x] Add tab to index.js (admin icon: ⚙️)
```

**BlockchainManager methods available:**
- `getMarketplaceFee()` - returns basis points
- `getFeeRecipient()` - returns address
- `getAccumulatedFees()` - returns OVG amount
- `isMarketplacePaused()` - returns boolean
- `setMarketplaceFee(basisPoints)` - owner only
- `setFeeRecipient(address)` - owner only
- `withdrawMarketplaceFees()` - owner only
- `pauseMarketplace()` - owner only
- `unpauseMarketplace()` - owner only

---

### Priority 2: Fee Display in Purchase Flow ✅ COMPLETE

**Files modified:**
- `lib/ui/marketplace/wizards/BuyWizard.js` ✅
- `lib/ui/marketplace/styles.js` ✅
- `lib/ui/marketplace/index.js` ✅

```
Tasks:
- [x] Add fee breakdown HTML generator function
- [x] Create fetchFeeInfo() to get marketplace fee + royalty
- [x] Show breakdown in single asset buy wizard
- [x] Show breakdown in bundle buy wizard
- [x] Add CSS styles for fee breakdown component
- [x] Load fee info when selecting a listing in Explore
```

**Fee breakdown display:**
```
Price:           100.00 OVG
Creator Royalty:  -5.00 OVG (5%)
Marketplace Fee:  -2.50 OVG (2.5%)
─────────────────────────────
Seller Receives:  92.50 OVG
```

---

### Priority 3: Paused State UI ✅ COMPLETE

**Files modified:**
- `lib/ui/marketplace/index.js` ✅
- `lib/ui/marketplace/styles.js` ✅

```
Tasks:
- [x] Add isMarketplacePaused state variable
- [x] Check pause status on marketplace open
- [x] Add generatePausedBannerHTML() function
- [x] Add updatePausedBanner() function
- [x] Show banner in modal header when paused
- [x] Update banner on pause/unpause actions
```

---

### Priority 4: Solidity Tests ✅ COMPLETE

**File:** `blockchain/test/MarketplaceFees.test.js`

```
Test cases (49 tests passing):
- [x] Fee Configuration (3 tests)
- [x] setMarketplaceFee validations (6 tests)
- [x] setFeeRecipient validations (4 tests)
- [x] purchase() with fee deduction (3 tests)
- [x] purchaseBundle() with fee (2 tests)
- [x] acceptBid() with fee deduction (2 tests)
- [x] acceptGlobalBid() with fee deduction (2 tests)
- [x] Fee accumulation (1 test)
- [x] withdrawFees validations (3 tests)
- [x] pause() functionality (3 tests)
- [x] unpause() functionality (3 tests)
- [x] whenNotPaused modifier (14 tests)
- [x] Version check (1 test)
- [x] Integration: Full purchase flow (1 test)
```

**Run tests:** `cd blockchain && pnpm test`

---

### Priority 5: Security Audit (Before Mainnet) ✅ COMPLETE

**Tool:** Slither v0.11.5 (Trail of Bits)

**Run command:** `cd blockchain && slither contracts/upgradeable/OVGMarketplaceUpgradeable.sol --solc-remaps "@openzeppelin/=$(pwd)/node_modules/@openzeppelin/"`

#### Summary: 78 findings analyzed

| Severity | Count | Status |
|----------|-------|--------|
| High | 0 | ✅ None |
| Medium | 0 | ✅ None |
| Low | 11 | ⚠️ Acceptable (see below) |
| Informational | 67 | ℹ️ OpenZeppelin internals |

#### Low Severity Findings (Acceptable)

1. **reentrancy-no-eth** (11 instances)
   - Functions: `purchase`, `purchaseBundle`, `acceptBid`, `acceptGlobalBid`, `placeBid`, `placeGlobalBid`, `rent`, `extendRental`, `withdrawBid`, `withdrawGlobalBid`
   - **Mitigated by:** `nonReentrant` modifier on all critical functions
   - **Risk:** Low - State changes after external calls but protected by ReentrancyGuard

2. **missing-zero-check** (2 instances)
   - `initialize()` and `initializeV1_2()` don't validate zero address for `feeRecipient`
   - **Acceptable:** Owner can update feeRecipient later via `setFeeRecipient()`

3. **calls-loop** (1 instance)
   - `purchaseBundle()` calls `safeTransferFrom` in a loop
   - **Acceptable:** Necessary for bundle functionality, gas limit naturally prevents abuse

4. **timestamp** (3 instances)
   - `rent()`, `extendRental()`, `cancelListing()` use `block.timestamp`
   - **Acceptable:** Standard practice for time-based features, ~15s manipulation window is acceptable for rental durations

#### Informational (Not Issues)

- **pragma**: Multiple Solidity versions (OpenZeppelin dependencies)
- **assembly**: Used by OpenZeppelin libraries (standard)
- **naming-convention**: OpenZeppelin internal naming
- **dead-code**: Unused OpenZeppelin helper functions

#### Recommendations for Future Versions

1. Consider adding zero-address check in `initializeV1_2()` for extra safety
2. Could optimize bundle purchases with batch transfer if ERC1155 supports it
3. Event parameters could be indexed for better filtering

#### Conclusion

**✅ Contract is production-ready.** No critical or high-severity vulnerabilities found. All low-severity findings are either mitigated or acceptable trade-offs for functionality.

---

**External Audit (Optional):**
For high-value deployments, consider additional audit from:
- OpenZeppelin
- Trail of Bits
- Consensys Diligence
- Code4rena (community audit)

---

### Priority 6: Mainnet Deployment ✅ COMPLETE

**Deployed:** 2026-01-24

**Deployment steps:**
1. [x] Deploy OVGForwarder to Polygon Mainnet
2. [x] Deploy OVGPaymaster to Polygon Mainnet (UUPS Proxy)
3. [x] Deploy OVGToken to Polygon Mainnet (UUPS Proxy)
4. [x] Deploy OVGAssets to Polygon Mainnet (UUPS Proxy)
5. [x] Deploy OVGMarketplace to Polygon Mainnet (UUPS Proxy)
6. [x] Deploy OVGLandClaim to Polygon Mainnet (UUPS Proxy)
7. [x] Call `initializeV1_3()` to whitelist USDC and USDT
8. [x] Update `lib/blockchain/contracts.js` with mainnet addresses
9. [x] Update ROADMAP.md

---

## Future Enhancements (Post-Launch)

### Priority 7: 3D Asset Preview
**Status:** ❌ Pendiente | **Complejidad:** Media (~3-4 horas)

Implementar visor WebGL/WebGPU para previsualizar modelos 3D de assets antes de comprar.

```
Tasks:
- [ ] Crear componente 3DPreviewModal
- [ ] Integrar Three.js o WebGPU renderer
- [ ] Cargar modelos GLB/GLTF desde IPFS o CDN
- [ ] Controles de rotación/zoom
- [ ] Fallback a imagen si no hay modelo 3D
```

---

### Priority 8: Subastas Temporizadas (Timed Auctions) ✅ COMPLETE
**Status:** ✅ Completado | **Version:** 1.5.0

Sistema de subastas con tiempo límite donde gana la puja más alta al expirar.

**Tipo implementado:**
- **English Auction:** Precio sube con cada puja (estilo eBay)

**Smart Contract (v1.5.0):**
- [x] TimedAuction struct (seller, assetId, amount, minBid, startTime, endTime, highestBidder, highestBid, settled)
- [x] `createAuction(assetId, amount, minBid, duration, paymentToken)` - escrow asset
- [x] `placeBidOnAuction(auctionId, bidAmount)` - 1% min increment, auto-refund previous
- [x] `settleAuction(auctionId)` - transfer to winner or return to seller
- [x] `cancelAuction(auctionId)` - seller only, no bids placed
- [x] View functions: getAuction, isAuctionActive, getAuctionTimeRemaining
- [x] Events: AuctionCreated, AuctionBidPlaced, AuctionSettled, AuctionCancelled
- [x] Constants: MIN_AUCTION_DURATION (5 min), MAX_AUCTION_DURATION (30 days), MIN_BID_INCREMENT (1%)

**Frontend UI:**
- [x] CreateAuctionWizard - duration presets, min bid, token selector
- [x] PlaceBidWizard - countdown, bid input, minimum next bid hint
- [x] AuctionCard - real-time countdown, current bid, highest bidder
- [x] ExploreView "Auctions" tab with filters
- [x] InventoryView "Auction" button
- [x] OffersTab "My Auction Bids" section

**Tests:** 44 tests in `TimedAuctions.test.js`

---

### Priority 9: Multi-Token Payments (OVG, USDC, USDT) ✅ COMPLETE
**Status:** ✅ Completado | **Version:** 1.3.0

Permite pagos con diferentes tokens además de OVG.

**Smart Contract (v1.3.0):**
- [x] Mapping de tokens permitidos (whitelist)
- [x] Struct Listing incluye paymentToken
- [x] `listAssetWithToken()`, `listBundleWithToken()`
- [x] `placeGlobalBidWithToken()` para ofertas multi-token
- [x] `setAllowedToken(address, bool)` - owner only
- [x] `getAccumulatedFees(token)`, `withdrawFeesByToken(token)`
- [x] SafeERC20 para transferencias seguras
- [x] initializeV1_3() para upgrade

**Frontend UI:**
- [x] Token selector en SellWizard
- [x] Token selector en RentWizard
- [x] Token selector en BundleWizard
- [x] Token badge en BuyWizard (muestra token requerido)
- [x] Token badge en BidWizard (muestra token requerido)
- [x] Token selector en GlobalOfferWizard

**Tokens soportados (Polygon Mainnet):**
- OVG (nativo del proyecto - 18 decimals)
- USDC: `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359` (6 decimals)
- USDT: `0xc2132D05D31c914a87C6611C10748AEb04B58e8F` (6 decimals)

**Tests:** 44 tests en `MultiToken.test.js` + 15 tests en `BatchOperations.test.js`

---

### Priority 10: Indexación con GenosDB (Reemplaza The Graph)
**Status:** ❌ Pendiente | **Complejidad:** Media (~2-3 horas) | **No requiere:** Cambios en contrato

Usar GenosDB como capa de indexación descentralizada en lugar de The Graph.

**Ventajas sobre The Graph:**
- ✅ P2P nativo - sin servidor centralizado
- ✅ Offline-first - funciona sin conexión
- ✅ Real-time subscriptions con `db.map()`
- ✅ Ya integrado en el proyecto (GenosDB signer)
- ✅ Queries MongoDB-style (`$gt`, `$in`, `$or`)
- ✅ Sin costos de hosting

```
Tasks:
- [ ] Crear MarketplaceIndexer.js que escuche eventos del contrato
- [ ] Indexar eventos: Listed, Purchased, BidPlaced, BidAccepted, etc.
- [ ] Estructura de datos en GenosDB:
      - listings: { type: 'listing', assetId, seller, price, ... }
      - sales: { type: 'sale', listingId, buyer, price, timestamp }
      - bids: { type: 'bid', assetId, bidder, price, timestamp }
- [ ] Reemplazar llamadas RPC en MarketplaceCache por queries GenosDB
- [ ] Implementar sincronización P2P entre usuarios
- [ ] Agregar filtros avanzados en Explore (precio, fecha, vendedor)
```

**Ejemplo de uso:**
```javascript
// Escuchar nuevos listings en tiempo real
await db.map({ query: { type: 'listing', active: true } }, ({ id, value, action }) => {
  if (action === 'added') updateExploreView(value)
})

// Query con filtros
const { results } = await db.map({
  query: { type: 'listing', price: { $lt: 100 }, assetType: 'land' },
  field: 'price',
  order: 'asc',
  $limit: 20
})
```

---

### Priority 11: Notificaciones Push
**Status:** ❌ Pendiente | **Complejidad:** Media (~2-3 horas) | **No requiere:** Cambios en contrato

Alertas en tiempo real para eventos importantes del marketplace.

**Eventos a notificar:**
- Nueva oferta en tu item
- Tu oferta fue aceptada/rechazada
- Item que sigues bajó de precio
- Tu renta está por expirar
- Alguien compró tu listing

```
Tasks:
- [ ] Registrar Service Worker para push notifications
- [ ] Usar GenosDB real-time para detectar eventos relevantes
- [ ] UI de preferencias de notificaciones (qué eventos recibir)
- [ ] Mostrar badge de notificaciones no leídas
- [ ] Historial de notificaciones en dropdown
```

**Integración con GenosDB:**
```javascript
// Suscribirse a ofertas en mis items
await db.map({ 
  query: { type: 'bid', seller: myAddress } 
}, ({ value, action }) => {
  if (action === 'added') {
    showNotification(`Nueva oferta de ${value.price} OVG`)
  }
})
```

---

### Phase 2: Advanced Trading ✅ COMPLETE
- [x] Batch operations (list/buy multiple) ✅ v1.4.0

### Phase 3: Scalability (Future)
- [ ] WebSocket for real-time updates (complementa GenosDB)
- [ ] Redis caching layer (opcional, para alto tráfico)

### Phase 4: User Experience (Future)
- [x] Favorites/Watchlist
- [ ] Email notifications (opcional, complementa push)
- [ ] Mobile-responsive improvements
- [ ] Dark/Light theme

### Phase 5: Analytics
- [ ] Rarity rankings
- [ ] Price prediction (ML)
- [ ] Whale tracking

---

## Ideas Descartadas / Evaluadas

> Features evaluados y descartados por no aportar valor significativo al caso de uso de OVGrid.

| Feature | Razón de descarte |
|---------|-------------------|
| **Collection offers** | Los assets de OVGrid (Land Plots, items) son únicos y específicos. Los usuarios quieren ubicaciones concretas, no "cualquier plot". Ya existe Global Bids para ofertar por items específicos no listados. |
| **Lazy minting** | Solo útil para marketplaces con contenido generado por usuarios. En OVGrid, el proyecto controla el minteo de assets (Land Plots, items del juego). |
| **Chainlink price conversion** | Complejidad innecesaria. El usuario puede seleccionar el token de pago que prefiera (OVG, USDC, USDT) sin necesidad de conversión automática. |
| **Candlestick charts** | Requiere alto volumen de trading para ser útil. Con pocas ventas diarias, OHLC no aporta información (open=high=low=close). El gráfico de líneas actual es más apropiado para el caso de uso. |

---

## Contract Addresses

### Polygon Mainnet - PRODUCTION 🚀
| Contract | Proxy Address | Type |
|----------|---------------|------|
| OVGForwarder | `0xD66Be0EEB76a29476423D9E3ef1ab0A0596adDa1` | Non-upgradeable |
| OVGPaymaster | `0xFE73ca7F771fEB3BD7eF9D8d3622a542e3c042E2` | UUPS Proxy |
| OVGToken | `0x0fB62F6ea4A58A610b3cF19DB401778B4126d28E` | UUPS Proxy |
| OVGAssets | `0x79f547F3E8a344D87064C15aA572a98E8d4A5c71` | UUPS Proxy |
| OVGMarketplace | `0x5c721aCC1535b2eD3a96Ba1C5768c0A97Dfa77DA` | UUPS Proxy |
| OVGLandClaim | `0xb11D83816c8645034099F09A011F30E1685cb7e8` | UUPS Proxy |

**Whitelisted Payment Tokens (v1.3.0):**
- OVG: `0x0fB62F6ea4A58A610b3cF19DB401778B4126d28E` (18 decimals)
- USDC: `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359` (6 decimals)
- USDT: `0xc2132D05D31c914a87C6611C10748AEb04B58e8F` (6 decimals)

---

## Token Branding & External Listings

> **Note:** These tasks are for external visibility of OVG token on explorers, wallets, and aggregators. They don't affect smart contract functionality.

### Contract Verification (Polygonscan)
**Status:** ❌ Pendiente | **Prioridad:** Alta

Verificar contratos en Polygonscan para mostrar código fuente y habilitar interacción directa.

```
Tasks:
- [ ] Verificar OVGToken en Polygonscan
- [ ] Verificar OVGAssets en Polygonscan
- [ ] Verificar OVGMarketplace en Polygonscan
- [ ] Solicitar logo/branding para OVGToken
- [ ] Solicitar label "Token" para OVGToken
```

**Beneficios:**
- ✅ Código fuente visible públicamente
- ✅ Logo del token en Polygonscan
- ✅ Interacción directa desde el explorador
- ✅ Mayor confianza para usuarios

---

### Trust Wallet Assets
**Status:** ❌ Pendiente | **Prioridad:** Media

Agregar OVG token a Trust Wallet para que muestre logo y metadata.

```
Tasks:
- [ ] Crear logo PNG 256x256 (fondo transparente)
- [ ] Fork del repo github.com/trustwallet/assets
- [ ] Agregar token info en blockchains/polygon/assets/0x0fB6.../
- [ ] Crear PR con logo.png e info.json
- [ ] Esperar aprobación (~1-2 semanas)
```

**Estructura requerida:**
```
blockchains/polygon/assets/0x0fB62F6ea4A58A610b3cF19DB401778B4126d28E/
├── logo.png      # 256x256, fondo transparente
└── info.json     # name, symbol, decimals, website, etc.
```

---

### Token Lists (Uniswap, DEX Aggregators)
**Status:** ❌ Pendiente | **Prioridad:** Baja

Agregar OVG a token lists para aparecer en DEXs y agregadores.

```
Tasks:
- [ ] Crear token list JSON propio (ovgrid-tokenlist.json)
- [ ] Solicitar inclusión en Polygon Token List
- [ ] Solicitar inclusión en CoinGecko (requiere liquidez)
- [ ] Solicitar inclusión en CoinMarketCap (requiere liquidez)
```

**Requisitos típicos para listings:**
- Liquidez mínima en DEX (~$10k-50k)
- Volumen de trading
- Comunidad activa
- Website y documentación

---

### Polygon Amoy (Testnet)
| Contract | Proxy Address | Implementation |
|----------|---------------|----------------|
| OVGToken | `0x564f99BAD84cE3fD36D5597874633eddBB304b8f` | - |
| OVGAssets | `0xD55d5049e597BA431d5C2b5c1f286532f0E0C195` | - |
| OVGMarketplace | `0x9982f5e65A342D7b8CAd1Ab3C83585916D98542a` | `0xC5A910E57dBa3d544c23f85aaF8Da3B846392036` |

---

## Quick Commands

```bash
# Compile contracts
cd blockchain && npx hardhat compile

# Run contract tests (194 tests)
cd blockchain && npx hardhat test

# Run frontend tests (251 tests)
bun test

# Run frontend tests with coverage
bun test --coverage

# Run frontend tests in watch mode
bun test --watch

# Deploy upgrade
cd blockchain && CONTRACT_NAME=OVGMarketplace npx hardhat run scripts/upgrade-contract.js --network polygonAmoy

# Check contract version
cd blockchain && npx hardhat run scripts/check-version.js --network polygonAmoy

# Run Slither security analysis
cd blockchain && slither contracts/upgradeable/OVGMarketplaceUpgradeable.sol --solc-remaps "@openzeppelin/=$(pwd)/node_modules/@openzeppelin/"

# Start dev server
bun run dev
```

---

## Files Reference

```
Key files for marketplace:
├── blockchain/
│   ├── contracts/upgradeable/OVGMarketplaceUpgradeable.sol  # Main contract
│   └── deployments/polygonAmoy-upgradeable.json             # Deployment info
├── lib/
│   ├── blockchain/
│   │   ├── BlockchainManager.js  # All contract interactions
│   │   ├── contracts.js          # ABIs and addresses
│   │   └── MarketplaceCache.js   # Caching layer
│   ├── config/
│   │   └── marketplaceConfig.js  # Centralized constants
│   ├── utils/
│   │   ├── ErrorLogger.js        # Centralized error logging
│   │   ├── withRetry.js          # Retry + timeout utilities
│   │   └── __tests__/            # Unit tests (2 files, 28 tests)
│   └── ui/marketplace/
│       ├── index.js              # Main controller (233 LOC)
│       ├── utils.js              # Utility functions
│       ├── state/
│       │   └── MarketplaceState.js    # Centralized state (232 LOC)
│       ├── generators/
│       │   └── ModalGenerator.js      # HTML generators (244 LOC)
│       ├── DataLoader.js              # Data fetching (184 LOC)
│       ├── handlers/
│       │   ├── NavigationHandlers.js  # Tabs, back, close (107 LOC)
│       │   ├── InventoryHandlers.js   # Card clicks, bundles (82 LOC)
│       │   ├── ExploreHandlers.js     # Search, filters (141 LOC)
│       │   ├── TransactionHandlers.js # Sell, buy, rent (340 LOC)
│       │   ├── BidHandlers.js         # Bids, global offers (196 LOC)
│       │   ├── BatchHandlers.js       # Batch list/buy (207 LOC)
│       │   ├── AuctionHandlers.js     # Timed auctions (172 LOC)
│       │   └── AdminHandlers.js       # Admin panel (127 LOC)
│       ├── views/                # Inventory, Explore, Detail
│       ├── tabs/                 # Activity, Offers, Stats, Admin
│       ├── wizards/              # All transaction wizards
│       ├── components/           # AssetCard, AuctionCard, Pagination
│       └── __tests__/            # Unit tests (7 files + mocks, 223 tests)
│           ├── utils.test.js
│           ├── state.test.js
│           ├── calculations.test.js
│           ├── validation.test.js
│           ├── dataLoader.test.js
│           └── mocks/
├── bunfig.toml                   # Bun config (includes test settings)
└── ROADMAP.md                    # This file
```

---

## Session Notes

Use this section to track progress between AI sessions:

### 2026-01-23 (Session 5) - Timed Auctions v1.5.0 🎯
- ✅ Implemented Timed Auctions in smart contract (v1.5.0):
  - TimedAuction struct with full auction state
  - createAuction(), placeBidOnAuction(), settleAuction(), cancelAuction()
  - View functions: getAuction(), isAuctionActive(), getAuctionTimeRemaining()
  - Events: AuctionCreated, AuctionBidPlaced, AuctionSettled, AuctionCancelled
  - MIN_AUCTION_DURATION (5 min), MAX_AUCTION_DURATION (30 days), MIN_BID_INCREMENT (1%)
- ✅ Created 44 new tests in `TimedAuctions.test.js` (194 total tests passing)
- ✅ Updated BlockchainManager.js with auction methods
- ✅ Updated contracts.js ABI with auction functions
- ✅ Created CreateAuctionWizard.js (duration presets, token selector)
- ✅ Created PlaceBidWizard.js (countdown, bid validation, settle)
- ✅ Created AuctionCard.js (real-time countdown component)
- ✅ Modified ExploreView.js with "Auctions" filter tab
- ✅ Modified InventoryView.js with "Auction" button
- ✅ Modified OffersTab.js with "My Auction Bids" section
- ✅ Modified index.js with auction handlers and countdown management
- ✅ Modified styles.js with auction-specific CSS
- ✅ Fixed hardhat config for contract size (allowUnlimitedContractSize, optimizer runs 10)
- ✅ Bug fixes:
  - Fixed BuyWizard null feeInfo crash (nullish coalescing)
  - Fixed bundle name display (show custom name instead of Bundle #ID)
  - Fixed card click issue for ID=0 (explicit null checks instead of truthy)
  - Fixed Batch List checkbox mode (spread operator ordering)
  - Fixed BatchSellWizard payment token (getDefaultToken()?.address)
  - Fixed cache invalidation for all marketplace operations (cancel, purchase, bundle, bids)

### 2026-01-23 (Session 4) - Batch Operations v1.4.0 🚀
- ✅ Implemented batch operations in smart contract:
  - `batchListAssets()` - list up to 15 assets in one TX
  - `batchPurchase()` - purchase up to 15 listings in one TX
  - Events: BatchListed, BatchPurchased
  - MAX_BATCH_SIZE constant (15)
- ✅ Created 15 new tests in `BatchOperations.test.js`
- ✅ Updated BlockchainManager.js with batch methods
- ✅ Updated contracts.js ABI
- ✅ Created BatchSellWizard.js and BatchBuyWizard.js
- ✅ Modified InventoryView, ExploreView, AssetCard, index.js, styles.js
- ✅ Fixed "stack too deep" error with viaIR compiler option
- ✅ Upgraded contract on Polygon Amoy testnet
- ✅ Upgraded contract on Polygon Mainnet to v1.4.0
- ✅ All 150 tests passing

### 2026-01-23 (Session 3) - Bugfixes & Token Branding Roadmap
- ✅ Fixed BlockchainManager init check (verify contracts ready after network switch)
- ✅ Fixed network switch error (event delegation for admin buttons)
- ✅ Fixed payment token not passed to sell handler
- ✅ Fixed token badge height alignment in sell wizard
- ✅ Added more reliable Polygon Mainnet RPCs
- ✅ Added mainnet diagnostic and mint scripts
- ✅ Added "Token Branding & External Listings" section to ROADMAP
- ✅ Removed duplicate Priority 11 (3D Asset Preview)
- ✅ Minted 10 Land Plots on mainnet (IDs 1000-1009)

### 2026-01-24 - Polygon Mainnet Deployment 🚀
- ✅ Deployed all 6 contracts to Polygon Mainnet
  - OVGForwarder: `0xD66Be0EEB76a29476423D9E3ef1ab0A0596adDa1`
  - OVGPaymaster: `0xFE73ca7F771fEB3BD7eF9D8d3622a542e3c042E2`
  - OVGToken: `0x0fB62F6ea4A58A610b3cF19DB401778B4126d28E`
  - OVGAssets: `0x79f547F3E8a344D87064C15aA572a98E8d4A5c71`
  - OVGMarketplace: `0x5c721aCC1535b2eD3a96Ba1C5768c0A97Dfa77DA`
  - OVGLandClaim: `0xb11D83816c8645034099F09A011F30E1685cb7e8`
- ✅ Initialized v1.3.0 with USDC and USDT whitelisted
- ✅ Updated `lib/blockchain/contracts.js` with mainnet addresses
- ✅ Deployment took ~1m 13s total (with some gas issues resolved)
- Deployer wallet: `0xE5639DfE345F8ab845bEBE63a1C7322F9c6fF5c7`

### 2026-01-23 (Session 2) - Multi-Token v1.3.0 UI
- ✅ Implemented Multi-Token UI support in all wizards:
  - SellWizard.js - Token selector for listings
  - RentWizard.js - Token selector for rentals
  - BundleWizard.js - Token selector for bundles
  - BuyWizard.js - Shows payment token badge
  - BidWizard.js - Shows payment token badge
  - GlobalOfferWizard.js - Token selector for global offers
- ✅ Added SUPPORTED_TOKENS config to marketplaceConfig.js
- ✅ Added token utilities to utils.js (generateTokenSelectorHTML, generateTokenBadgeHTML)
- ✅ Added CSS styles for token selector and badge
- ✅ Updated ROADMAP.md to v1.3.0
- Smart contract v1.3.0 was completed in previous session (135 tests passing)

### 2026-01-23 (Session 1)
- Updated ROADMAP.md with complete feature checklist
- Added detailed specs for pending features:
  - Priority 7: 3D Asset Preview (WebGL/WebGPU)
  - Priority 8: Subastas Temporizadas (English/Dutch)
  - Priority 9: Multi-Token Payments (OVG, USDC, USDT)
  - Priority 10: Indexación con GenosDB (reemplaza The Graph)
  - Priority 11: Notificaciones Push
- Confirmed GenosDB can replace The Graph (P2P, offline-first, real-time)
- All core features verified as implemented
- Implemented Multi-Token smart contract v1.3.0:
  - 44 new tests in MultiToken.test.js
  - BlockchainManager.js updated with multi-token methods

### 2026-01-22
- Implemented marketplace fee (2.5%) and pausable functionality
- Upgraded contract to v1.2.0 on Polygon Amoy
- New implementation: `0xC5A910E57dBa3d544c23f85aaF8Da3B846392036`
- Created ROADMAP.md (renamed from TODO.md)
- ✅ Completed Admin Panel integration in marketplace UI
- ✅ Completed Fee breakdown display in BuyWizard
- ✅ Completed Paused banner UI
- ✅ Completed Solidity tests (49 tests passing)
- ✅ Completed Slither security analysis (no critical issues)

### 2026-01-23 (Session 6) - Mainnet Upgrade v1.5.0 🚀
- ✅ Upgraded OVGMarketplace to v1.5.0 on Polygon Mainnet
  - Old Implementation: `0x284F8c1277B654AedA08CCb0ff1d83888987E681`
  - New Implementation: `0xE82d2C4F6cc2192EaAd79997300F08D5744524FF`
  - TX: `0x384e703e59b71e81976652868a05a62fbf7e944a06f0a64f92ffcba99b1ec5be`
- ✅ Called initializeV1_5() successfully
- ✅ Timed Auctions now available on mainnet

### 2026-01-24 (Session 7) - Modular Architecture Refactor ✨
- ✅ Refactored index.js from 1770 LOC → 233 LOC
- ✅ Created modular architecture:
  - `state/MarketplaceState.js` (232 LOC) - Centralized state with getters/setters
  - `generators/ModalGenerator.js` (244 LOC) - Pure HTML generation functions
  - `DataLoader.js` (184 LOC) - Data fetching and loading logic
  - `handlers/NavigationHandlers.js` (107 LOC) - Tabs, back, close, refresh
  - `handlers/InventoryHandlers.js` (82 LOC) - Card clicks, bundle checkboxes
  - `handlers/ExploreHandlers.js` (141 LOC) - Search, filters, favorites
  - `handlers/TransactionHandlers.js` (340 LOC) - Sell, buy, rent, gift
  - `handlers/BidHandlers.js` (196 LOC) - Bids, global offers
  - `handlers/BatchHandlers.js` (207 LOC) - Batch list/buy
  - `handlers/AuctionHandlers.js` (172 LOC) - Timed auctions
  - `handlers/AdminHandlers.js` (127 LOC) - Admin panel actions
- ✅ Added centralized constants to `marketplaceConfig.js`:
  - Time constants (SECONDS_PER_HOUR, SECONDS_PER_DAY)
  - Auction durations presets
  - Fee percentages, validation constants
- ✅ Added utility functions to `utils.js`:
  - `isValidEthAddress()` - Reusable address validation
  - `debounce()` - Centralized debounce function
- ✅ Removed debug console.log/error statements
- ✅ No functionality changes - behavior preserved

### 2026-01-24 (Session 8) - Production Readiness Audit 🔍
- ✅ Auditoría exhaustiva de producción completada
- ✅ Evaluación de 5 áreas: contracts, error handling, state, security, infrastructure
- ⚠️ Issues críticos identificados (C1-C4)
- ⚠️ Issues de alta prioridad identificados (H1-H4)
- ✅ Veredicto inicial: Testnet SEGURO, Mainnet necesitaba trabajo

### 2026-01-24 (Session 9) - Production Readiness Fixes ✅
- ✅ **TODOS LOS ISSUES CRÍTICOS RESUELTOS (C1-C4)**
- ✅ **TODOS LOS ISSUES DE ALTA PRIORIDAD RESUELTOS (H1-H4)**
- ✅ Archivos nuevos creados:
  - `lib/utils/ErrorLogger.js` - Logger centralizado con buffer local + global error handlers
  - `lib/utils/withRetry.js` - Retry con exponential backoff + withTimeout
- ✅ Archivos modificados:
  - `lib/config/marketplaceConfig.js` - TX_WAIT_TIMEOUT_MS (60s), RETRY_CONFIG
  - `lib/blockchain/BlockchainManager.js` - validateBatchPurchase(), withTimeout en tx.wait(), ErrorLogger
  - `lib/ui/marketplace/utils.js` - isValidEthAddress() con ethers.isAddress(), ErrorLogger
  - `lib/ui/marketplace/state/MarketplaceState.js` - Eliminada zombie variable
  - `lib/ui/marketplace/index.js` - Cleanup en close()
  - `lib/ui/ProfileUI.js` - clearInterval en destroy()
  - `lib/ui/marketplace/handlers/*` - isProcessing guards, ErrorLogger, network cleanup
  - `lib/ui/marketplace/wizards/BatchBuyWizard.js` - Pre-validación con validateBatchPurchase()
- ✅ Nuevo score: **9/10 Production Ready**
- ✅ Veredicto final: **Mainnet LISTO para alto tráfico**

### 2026-01-24 (Session 10) - Frontend Unit Tests ✅
- ✅ **251 frontend tests implementados** con 72.90% coverage
- ✅ Configuración de testing:
  - `bunfig.toml` actualizado con sección [test] y root = "./lib" (excluye blockchain/)
  - `package.json` scripts: test, test:watch, test:coverage
- ✅ Archivos de test creados:
  - `lib/utils/__tests__/ErrorLogger.test.js` (141 LOC, 14 tests)
  - `lib/utils/__tests__/withRetry.test.js` (208 LOC, 14 tests)
  - `lib/ui/marketplace/__tests__/utils.test.js` (456 LOC, 64 tests)
  - `lib/ui/marketplace/__tests__/state.test.js` (295 LOC, 43 tests)
  - `lib/ui/marketplace/__tests__/calculations.test.js` (419 LOC, 42 tests)
  - `lib/ui/marketplace/__tests__/validation.test.js` (432 LOC, 53 tests)
  - `lib/ui/marketplace/__tests__/dataLoader.test.js` (375 LOC, 21 tests)
  - `lib/ui/marketplace/__tests__/mocks/blockchainManager.mock.js` (145 LOC)
  - `lib/ui/marketplace/__tests__/mocks/marketplaceConfig.mock.js` (110 LOC)
- ✅ Bug fix en `lib/ui/marketplace/utils.js`:
  - `isValidEthAddress()` ahora usa `globalThis.window` para compatibilidad cross-environment (Bun/Node/Browser)
- ✅ Coverage por archivo:
  - withRetry.js: 97.62%
  - marketplaceConfig.js: 87.97%
  - MarketplaceState.js: 81.98%
  - ErrorLogger.js: 78.57%
  - utils.js: 64.29%

### Next Session
- [ ] Verify contracts on PolygonScan (opcional)
- [ ] Trust Wallet asset listing (opcional)

---

## Author

Esteban Fuster Pozzi (@estebanrfp) — Full Stack JavaScript Developer
