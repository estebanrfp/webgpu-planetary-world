/**
 * OVGrid Blockchain Contracts Architecture
 * 
 * This file contains the ABIs and deployed addresses for the Polygon network.
 * It serves as the primary bridge between the WebGPU engine and the smart contracts.
 * 
 * Updated: 2026-01-22 - Upgradeable contracts (UUPS pattern)
 * Native token: POL (formerly MATIC)
 */

// Deployment addresses - Use PROXY addresses for upgradeable contracts
export const DEPLOYMENTS = {
  // Polygon Amoy (Testnet) - UPGRADEABLE CONTRACTS V1
  80002: {
    OVGToken: "0x564f99BAD84cE3fD36D5597874633eddBB304b8f",
    OVGAssets: "0xD55d5049e597BA431d5C2b5c1f286532f0E0C195",
    OVGMarketplace: "0x9982f5e65A342D7b8CAd1Ab3C83585916D98542a",
    OVGForwarder: "0x82a72519A568297DB47ce69516524b33d5840cD6",
    OVGPaymaster: "0x3060C0EA9039Cd637d3646f7c593DE0169646c7a",
    OVGLandClaim: "0x0feE250B12c8044fAE839D8F8fd056b46C82dAD0",
    OVGMetadata: "0x51f36d3A3491551c92D5cE087FF22Cc5010b6B0A"
  },
  // Polygon Mainnet - Deployed 2026-01-23
  137: {
    OVGToken: "0x0fB62F6ea4A58A610b3cF19DB401778B4126d28E",
    OVGAssets: "0x79f547F3E8a344D87064C15aA572a98E8d4A5c71",
    OVGMarketplace: "0x5c721aCC1535b2eD3a96Ba1C5768c0A97Dfa77DA",
    OVGForwarder: "0xD66Be0EEB76a29476423D9E3ef1ab0A0596adDa1",
    OVGPaymaster: "0xFE73ca7F771fEB3BD7eF9D8d3622a542e3c042E2",
    OVGLandClaim: "0xb11D83816c8645034099F09A011F30E1685cb7e8",
    OVGMetadata: "0x8eDB11F435918371E28AC538c95Cf1b7b6505a10"
  }
}

export const OVG_TOKEN_ABI = [
  // Errors
  "error AccessControlBadConfirmation()",
  "error AccessControlUnauthorizedAccount(address account, bytes32 neededRole)",
  "error ECDSAInvalidSignature()",
  "error ECDSAInvalidSignatureLength(uint256 length)",
  "error ECDSAInvalidSignatureS(bytes32 s)",
  "error ERC20InsufficientAllowance(address spender, uint256 allowance, uint256 needed)",
  "error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed)",
  "error ERC20InvalidApprover(address approver)",
  "error ERC20InvalidReceiver(address receiver)",
  "error ERC20InvalidSender(address sender)",
  "error ERC20InvalidSpender(address spender)",
  "error ERC2612ExpiredSignature(uint256 deadline)",
  "error ERC2612InvalidSigner(address signer, address owner)",
  "error InvalidAccountNonce(address account, uint256 currentNonce)",
  "error InvalidShortString()",
  "error StringTooLong(string str)",
  "error InvalidInitialization()",
  "error NotInitializing()",
  // Events
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
  "event EIP712DomainChanged()",
  "event Initialized(uint64 version)",
  "event RoleAdminChanged(bytes32 indexed role, bytes32 indexed previousAdminRole, bytes32 indexed newAdminRole)",
  "event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender)",
  "event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Upgraded(address indexed implementation)",
  // Functions
  "function DEFAULT_ADMIN_ROLE() view returns (bytes32)",
  "function DOMAIN_SEPARATOR() view returns (bytes32)",
  "function MINTER_ROLE() view returns (bytes32)",
  "function UPGRADER_ROLE() view returns (bytes32)",
  "function UPGRADE_INTERFACE_VERSION() view returns (string)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 value) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function burn(uint256 value)",
  "function burnFrom(address account, uint256 value)",
  "function decimals() view returns (uint8)",
  "function eip712Domain() view returns (bytes1 fields, string name, string version, uint256 chainId, address verifyingContract, bytes32 salt, uint256[] extensions)",
  "function getRoleAdmin(bytes32 role) view returns (bytes32)",
  "function grantRole(bytes32 role, address account)",
  "function hasRole(bytes32 role, address account) view returns (bool)",
  "function initialize(address defaultAdmin, address minter, address trustedForwarder_)",
  "function isTrustedForwarder(address forwarder) view returns (bool)",
  "function mint(address to, uint256 amount)",
  "function name() view returns (string)",
  "function nonces(address owner) view returns (uint256)",
  "function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)",
  "function proxiableUUID() view returns (bytes32)",
  "function renounceRole(bytes32 role, address callerConfirmation)",
  "function revokeRole(bytes32 role, address account)",
  "function setTrustedForwarder(address newForwarder)",
  "function supportsInterface(bytes4 interfaceId) view returns (bool)",
  "function symbol() view returns (string)",
  "function totalSupply() view returns (uint256)",
  "function transfer(address to, uint256 value) returns (bool)",
  "function transferFrom(address from, address to, uint256 value) returns (bool)",
  "function trustedForwarder() view returns (address)",
  "function upgradeToAndCall(address newImplementation, bytes data) payable",
  "function version() view returns (string)"
]

export const OVG_ASSETS_ABI = [
  // Errors
  "error AccessControlBadConfirmation()",
  "error AccessControlUnauthorizedAccount(address account, bytes32 neededRole)",
  "error ERC1155InsufficientBalance(address sender, uint256 balance, uint256 needed, uint256 tokenId)",
  "error ERC1155InvalidApprover(address approver)",
  "error ERC1155InvalidArrayLength(uint256 idsLength, uint256 valuesLength)",
  "error ERC1155InvalidOperator(address operator)",
  "error ERC1155InvalidReceiver(address receiver)",
  "error ERC1155InvalidSender(address sender)",
  "error ERC1155MissingApprovalForAll(address operator, address owner)",
  "error InvalidInitialization()",
  "error NotInitializing()",
  // Events
  "event ApprovalForAll(address indexed account, address indexed operator, bool approved)",
  "event Initialized(uint64 version)",
  "event RoleAdminChanged(bytes32 indexed role, bytes32 indexed previousAdminRole, bytes32 indexed newAdminRole)",
  "event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender)",
  "event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender)",
  "event RoyaltySet(uint256 indexed assetId, address indexed creator, uint96 percentage)",
  "event TokenRenamed(uint256 indexed tokenId, address indexed owner, string newName)",
  "event TransferBatch(address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values)",
  "event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)",
  "event URI(string value, uint256 indexed id)",
  "event Upgraded(address indexed implementation)",
  // Functions
  "function CREATOR_ROLE() view returns (bytes32)",
  "function DEFAULT_ADMIN_ROLE() view returns (bytes32)",
  "function MINTER_ROLE() view returns (bytes32)",
  "function UPGRADER_ROLE() view returns (bytes32)",
  "function UPGRADE_INTERFACE_VERSION() view returns (string)",
  "function URI_SETTER_ROLE() view returns (bytes32)",
  "function balanceOf(address account, uint256 id) view returns (uint256)",
  "function balanceOfBatch(address[] accounts, uint256[] ids) view returns (uint256[])",
  "function burn(address account, uint256 id, uint256 value)",
  "function burnBatch(address account, uint256[] ids, uint256[] values)",
  "function exists(uint256 id) view returns (bool)",
  "function getRoleAdmin(bytes32 role) view returns (bytes32)",
  "function getRoyaltyInfo(uint256 assetId, uint256 salePrice) view returns (address, uint256)",
  "function getTokenName(uint256 tokenId) view returns (string)",
  "function grantRole(bytes32 role, address account)",
  "function hasRole(bytes32 role, address account) view returns (bool)",
  "function initialize(address defaultAdmin, address minter)",
  "function isApprovedForAll(address account, address operator) view returns (bool)",
  "function mint(address account, uint256 id, uint256 amount, bytes data)",
  "function mintBatch(address to, uint256[] ids, uint256[] amounts, bytes data)",
  "function proxiableUUID() view returns (bytes32)",
  "function renounceRole(bytes32 role, address callerConfirmation)",
  "function revokeRole(bytes32 role, address account)",
  "function royalties(uint256) view returns (address creator, uint96 royaltyPercentage)",
  "function safeBatchTransferFrom(address from, address to, uint256[] ids, uint256[] values, bytes data)",
  "function safeTransferFrom(address from, address to, uint256 id, uint256 value, bytes data)",
  "function setApprovalForAll(address operator, bool approved)",
  "function setRoyalty(uint256 assetId, address creator, uint96 percentage)",
  "function setTokenName(uint256 tokenId, string newName)",
  "function setURI(string newuri)",
  "function supportsInterface(bytes4 interfaceId) view returns (bool)",
  "function totalSupply() view returns (uint256)",
  "function totalSupply(uint256 id) view returns (uint256)",
  "function upgradeToAndCall(address newImplementation, bytes data) payable",
  "function uri(uint256) view returns (string)",
  "function version() view returns (string)",
  // V2.1.0: Metadata Contract Integration
  "function metadataContract() view returns (address)",
  "function setMetadataContract(address _metadataContract)",
  "function emitMetadataUpdate(uint256 tokenId)",
  "function emitMetadataUpdateBatch(uint256[] tokenIds)",
  // V2.2.0: Direct metadata URLs (IPFS/HTTP) for Polygonscan
  "function setTokenMetadataUrl(uint256 tokenId, string metadataUrl)",
  "function getTokenMetadataUrl(uint256 tokenId) view returns (string)",
  // V2.5.0: Collection metadata for OpenSea (contractURI)
  "function contractURI() view returns (string)",
  "function setContractURI(string newContractURI)"
]

export const OVG_MARKETPLACE_ABI = [
  // Errors
  "error OwnableInvalidOwner(address owner)",
  "error OwnableUnauthorizedAccount(address account)",
  "error ReentrancyGuardReentrantCall()",
  "error EnforcedPause()",
  "error ExpectedPause()",
  "error InvalidInitialization()",
  "error NotInitializing()",
  // Events - Listings
  "event BatchListed(uint256[] listingIds, address indexed seller, uint256[] assetIds, uint256[] prices, address paymentToken)",
  "event BatchPurchased(uint256[] listingIds, address indexed buyer, uint256 totalPrice, uint256 totalRoyalties, address paymentToken)",
  "event BidAccepted(uint256 indexed listingId, address indexed seller, address indexed bidder, uint256 price, uint256 royalty)",
  "event BidPlaced(uint256 indexed listingId, address indexed bidder, uint256 price)",
  "event BidWithdrawn(uint256 indexed listingId, address indexed bidder)",
  "event BundleCancelled(uint256 indexed bundleId, address indexed seller)",
  "event BundleListed(uint256 indexed bundleId, address indexed seller, uint256[] assetIds, uint256 price)",
  "event BundleRenamed(uint256 indexed bundleId, address indexed seller, string name)",
  "event BundlePurchased(uint256 indexed bundleId, address indexed buyer, uint256 price)",
  "event Cancelled(uint256 indexed listingId, address indexed seller)",
  "event ListingUpdated(uint256 indexed listingId, address indexed seller, uint256 newPrice, uint256 newDuration)",
  "event GlobalBidAccepted(uint256 indexed assetId, address indexed seller, address indexed bidder, uint256 price, uint256 royalty)",
  "event GlobalBidPlaced(uint256 indexed assetId, address indexed bidder, uint256 price)",
  "event GlobalBidWithdrawn(uint256 indexed assetId, address indexed bidder)",
  "event Initialized(uint64 version)",
  "event Listed(uint256 indexed listingId, address indexed seller, uint256 assetId, uint256 price)",
  "event MarketplaceFeeUpdated(uint256 oldFee, uint256 newFee)",
  "event FeeRecipientUpdated(address oldRecipient, address newRecipient)",
  "event FeesWithdrawn(address indexed recipient, uint256 amount)",
  "event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)",
  "event Paused(address account)",
  "event Purchased(uint256 indexed listingId, address indexed buyer, uint256 price, uint256 royalty)",
  "event Rented(uint256 indexed listingId, address indexed renter, uint256 expiresAt)",
  "event RentalExtended(uint256 indexed listingId, address indexed renter, uint256 newExpiresAt)",
  "event Unpaused(address account)",
  "event Upgraded(address indexed implementation)",
  // Events - Timed Auctions (V1.5.0)
  "event AuctionCreated(uint256 indexed auctionId, address indexed seller, uint256 assetId, uint256 minBid, uint256 endTime, address paymentToken)",
  "event AuctionBidPlaced(uint256 indexed auctionId, address indexed bidder, uint256 bidAmount, address paymentToken)",
  "event AuctionSettled(uint256 indexed auctionId, address indexed seller, address indexed winner, uint256 finalBid, uint256 royalty, uint256 fee)",
  "event AuctionCancelled(uint256 indexed auctionId, address indexed seller)",
  "event AuctionUpdated(uint256 indexed auctionId, address indexed seller, uint256 newEndTime)",
  // Functions
  "function MAX_BATCH_SIZE() view returns (uint256)",
  "function MAX_BUNDLE_NAME_LENGTH() view returns (uint256)",
  "function MAX_MARKETPLACE_FEE() view returns (uint256)",
  "function UPGRADE_INTERFACE_VERSION() view returns (string)",
  "function acceptBid(uint256 listingId, address bidder)",
  "function batchListAssets(uint256[] assetIds, uint256[] amounts, uint256[] prices, bool[] isRentals, uint256[] durations, address paymentToken) returns (uint256[])",
  "function batchPurchase(uint256[] listingIds)",
  "function acceptGlobalBid(uint256 assetId, address bidder)",
  "function accumulatedFees() view returns (uint256)",
  "function activeRentals(uint256) view returns (address renter, uint256 expiresAt)",
  "function bids(uint256, address) view returns (address bidder, uint256 price, uint256 timestamp)",
  "function bundleListings(uint256) view returns (address seller, uint256 price, bool active)",
  "function bundleNames(uint256) view returns (string)",
  "function cancelBundle(uint256 bundleId)",
  "function cancelListing(uint256 listingId)",
  "function updateListing(uint256 listingId, uint256 newPrice, uint256 newDuration)",
  "function extendRental(uint256 listingId)",
  "function feeRecipient() view returns (address)",
  "function getBundleName(uint256 bundleId) view returns (string)",
  "function globalBids(uint256, address) view returns (address bidder, uint256 price, uint256 timestamp)",
  "function initialize(address _ovgToken, address _ovgAssets, address initialOwner)",
  "function initializeV1_2(address _feeRecipient)",
  "function listAsset(uint256 assetId, uint256 amount, uint256 price, bool isRental, uint256 duration)",
  "function listBundle(uint256[] assetIds, uint256[] amounts, uint256 price)",
  "function listBundleWithName(uint256[] assetIds, uint256[] amounts, uint256 price, string name)",
  "function listings(uint256) view returns (address seller, uint256 assetId, uint256 amount, uint256 price, bool isRental, uint256 duration)",
  "function listingPaymentToken(uint256) view returns (address)",
  "function marketplaceFee() view returns (uint256)",
  "function nextBundleId() view returns (uint256)",
  "function nextListingId() view returns (uint256)",
  "function ovgAssets() view returns (address)",
  "function ovgToken() view returns (address)",
  "function owner() view returns (address)",
  "function pause()",
  "function paused() view returns (bool)",
  "function placeBid(uint256 listingId, uint256 price)",
  "function placeGlobalBid(uint256 assetId, uint256 price)",
  "function proxiableUUID() view returns (bytes32)",
  "function purchase(uint256 listingId)",
  "function purchaseBundle(uint256 bundleId)",
  "function renounceOwnership()",
  "function rent(uint256 listingId)",
  "function setBundleName(uint256 bundleId, string name)",
  "function setFeeRecipient(address newRecipient)",
  "function setMarketplaceFee(uint256 newFee)",
  "function transferOwnership(address newOwner)",
  "function unpause()",
  "function upgradeToAndCall(address newImplementation, bytes data) payable",
  "function version() view returns (string)",
  "function withdrawBid(uint256 listingId)",
  "function withdrawFees()",
  "function withdrawGlobalBid(uint256 assetId)",
  // Timed Auctions (V1.5.0)
  "function timedAuctions(uint256) view returns (address seller, uint256 assetId, uint256 amount, uint256 minBid, uint256 startTime, uint256 endTime, address highestBidder, uint256 highestBid, bool settled)",
  "function auctionPaymentToken(uint256) view returns (address)",
  "function nextAuctionId() view returns (uint256)",
  "function createAuction(uint256 assetId, uint256 amount, uint256 minBid, uint256 duration, address paymentToken) returns (uint256)",
  "function placeBidOnAuction(uint256 auctionId, uint256 bidAmount)",
  "function settleAuction(uint256 auctionId)",
  "function cancelAuction(uint256 auctionId)",
  "function updateAuction(uint256 auctionId, uint256 newDuration)",
  "function getAuction(uint256 auctionId) view returns (tuple(address seller, uint256 assetId, uint256 amount, uint256 minBid, uint256 startTime, uint256 endTime, address highestBidder, uint256 highestBid, bool settled))",
  "function isAuctionActive(uint256 auctionId) view returns (bool)",
  "function getAuctionTimeRemaining(uint256 auctionId) view returns (uint256)",
  "function MIN_AUCTION_DURATION() view returns (uint256)",
  "function MAX_AUCTION_DURATION() view returns (uint256)",
  "function MIN_BID_INCREMENT() view returns (uint256)",
  "function initializeV1_5()"
]

export const OVG_PAYMASTER_ABI = [
  // Errors
  "error OwnableInvalidOwner(address owner)",
  "error OwnableUnauthorizedAccount(address account)",
  "error InvalidInitialization()",
  "error NotInitializing()",
  // Events
  "event GasSponsored(address indexed user, uint256 count)",
  "event Initialized(uint64 version)",
  "event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)",
  "event Upgraded(address indexed implementation)",
  // Functions
  "function MAX_DAILY_TX() view returns (uint256)",
  "function RESET_PERIOD() view returns (uint256)",
  "function UPGRADE_INTERFACE_VERSION() view returns (string)",
  "function initialize(address initialOwner)",
  "function isEligible(address user) view returns (bool)",
  "function lastReset(address) view returns (uint256)",
  "function owner() view returns (address)",
  "function proxiableUUID() view returns (bytes32)",
  "function recordTransaction(address user)",
  "function renounceOwnership()",
  "function transferOwnership(address newOwner)",
  "function txCount(address) view returns (uint256)",
  "function upgradeToAndCall(address newImplementation, bytes data) payable",
  "function version() view returns (string)",
  "function withdraw(uint256 amount)"
]

export const OVG_FORWARDER_ABI = [
  "function getNonce(address from) view returns (uint256)",
  "function verify(tuple(address from, address to, uint256 value, uint256 gas, uint256 nonce, uint256 deadline, bytes data) req, bytes signature) view returns (bool)",
  "function execute(tuple(address from, address to, uint256 value, uint256 gas, uint256 nonce, uint256 deadline, bytes data) req, bytes signature) payable returns (bytes)"
]

export const OVG_LAND_CLAIM_ABI = [
  // Errors
  "error OwnableInvalidOwner(address owner)",
  "error OwnableUnauthorizedAccount(address account)",
  "error ReentrancyGuardReentrantCall()",
  "error InvalidInitialization()",
  "error NotInitializing()",
  // Events
  "event ClaimFeeUpdated(uint256 newFee)",
  "event Initialized(uint64 version)",
  "event LandClaimed(address indexed claimer, uint256 indexed landId, int256 x, int256 z)",
  "event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)",
  "event Upgraded(address indexed implementation)",
  // Functions
  "function LAND_ID_OFFSET() view returns (uint256)",
  "function UPGRADE_INTERFACE_VERSION() view returns (string)",
  "function claimFee() view returns (uint256)",
  "function claimLand(int256 x, int256 z) payable",
  "function coordsToLandId(int256 x, int256 z) pure returns (uint256)",
  "function getOwner(int256 x, int256 z) view returns (address)",
  "function initialize(address _ovgAssets, address _owner)",
  "function isAvailable(int256 x, int256 z) view returns (bool)",
  "function isClaimed(uint256) view returns (bool)",
  "function landOwner(uint256) view returns (address)",
  "function ovgAssets() view returns (address)",
  "function owner() view returns (address)",
  "function proxiableUUID() view returns (bytes32)",
  "function renounceOwnership()",
  "function releaseLand(int256 x, int256 z)",
  "function resetLand(int256 x, int256 z)",
  "function resetLandById(uint256 landId)",
  "function setClaimFee(uint256 _fee)",
  "function totalClaimed() view returns (uint256)",
  "function transferOwnership(address newOwner)",
  "function upgradeToAndCall(address newImplementation, bytes data) payable",
  "function version() view returns (string)",
  "function withdraw()"
]

// Multicall3 - Universal address on all EVM chains
// https://github.com/mds1/multicall
export const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11'

export const MULTICALL3_ABI = [
  "function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) payable returns (tuple(bool success, bytes returnData)[])",
  "function aggregate3Value(tuple(address target, bool allowFailure, uint256 value, bytes callData)[] calls) payable returns (tuple(bool success, bytes returnData)[])"
]

export const OVG_METADATA_ABI = [
  // Errors
  "error OwnableInvalidOwner(address owner)",
  "error OwnableUnauthorizedAccount(address account)",
  "error InvalidInitialization()",
  "error NotInitializing()",
  // Events
  "event ListingMetadataUpdated(uint256 indexed listingId, address indexed updater, string title)",
  "event BundleMetadataUpdated(uint256 indexed bundleId, address indexed updater, string title)",
  "event AuctionMetadataUpdated(uint256 indexed auctionId, address indexed updater, string title)",
  "event MarketplaceUpdated(address indexed oldMarketplace, address indexed newMarketplace)",
  "event Initialized(uint64 version)",
  "event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)",
  "event Upgraded(address indexed implementation)",
  // Constants
  "function MAX_TITLE_LENGTH() view returns (uint256)",
  "function MAX_DESCRIPTION_LENGTH() view returns (uint256)",
  "function MAX_URL_LENGTH() view returns (uint256)",
  "function UPGRADE_INTERFACE_VERSION() view returns (string)",
  // State
  "function marketplace() view returns (address)",
  "function owner() view returns (address)",
  // Listing Metadata
  "function setListingMetadata(uint256 listingId, string title, string description, string imageUrl, string assetUrl)",
  "function getListingMetadata(uint256 listingId) view returns (string title, string description, string imageUrl, string assetUrl)",
  "function listingMetadata(uint256) view returns (string title, string description, string imageUrl, string assetUrl)",
  // Bundle Metadata
  "function setBundleMetadata(uint256 bundleId, string title, string description, string imageUrl, string assetUrl)",
  "function getBundleMetadata(uint256 bundleId) view returns (string title, string description, string imageUrl, string assetUrl)",
  "function bundleMetadata(uint256) view returns (string title, string description, string imageUrl, string assetUrl)",
  // Auction Metadata
  "function setAuctionMetadata(uint256 auctionId, string title, string description, string imageUrl, string assetUrl)",
  "function getAuctionMetadata(uint256 auctionId) view returns (string title, string description, string imageUrl, string assetUrl)",
  "function auctionMetadata(uint256) view returns (string title, string description, string imageUrl, string assetUrl)",
  // Asset Metadata (V2.1.0) - ERC-1155 token metadata for Polygonscan/OpenSea
  "event AssetMetadataUpdated(uint256 indexed assetId, address indexed updater, string title)",
  "function setAssetMetadata(uint256 assetId, string title, string description, string imageUrl, string assetUrl)",
  "function setAssetMetadataByTokenOwner(uint256 assetId, string title, string description, string imageUrl, string assetUrl)",
  "function getAssetMetadata(uint256 assetId) view returns (string title, string description, string imageUrl, string assetUrl)",
  "function assetMetadata(uint256) view returns (string title, string description, string imageUrl, string assetUrl)",
  // V2.2.0: Assets contract reference
  "event AssetsContractUpdated(address indexed oldAssets, address indexed newAssets)",
  "function assetsContract() view returns (address)",
  "function setAssetsContract(address _assets)",
  // V2.3.0: Asset attributes (traits for OpenSea)
  "function setAssetAttributes(uint256 assetId, string rarity, string category, string collection)",
  "function setAssetAttributesByTokenOwner(uint256 assetId, string rarity, string category, string collection)",
  "function getAssetAttributes(uint256 assetId) view returns (string rarity, string category, string collection)",
  // V2.4.0: Full metadata (single call for all fields)
  "function getFullMetadata(uint256 assetId) view returns (tuple(string title, string description, string imageUrl, string assetUrl, string rarity, string category, string collection))",
  "function getFullMetadataBatch(uint256[] assetIds) view returns (tuple(string title, string description, string imageUrl, string assetUrl, string rarity, string category, string collection)[])",
  "function setFullMetadata(uint256 assetId, tuple(string title, string description, string imageUrl, string assetUrl, string rarity, string category, string collection) meta)",
  "function setFullMetadataByTokenOwner(uint256 assetId, tuple(string title, string description, string imageUrl, string assetUrl, string rarity, string category, string collection) meta)",
  // Admin
  "function initialize(address initialOwner, address _marketplace)",
  "function setMarketplace(address _marketplace)",
  "function proxiableUUID() view returns (bytes32)",
  "function renounceOwnership()",
  "function transferOwnership(address newOwner)",
  "function upgradeToAndCall(address newImplementation, bytes data) payable"
]
