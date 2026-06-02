// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

interface IOVGAssets is IERC1155 {
    function getRoyaltyInfo(uint256 assetId, uint256 salePrice) external view returns (address, uint256);
}

// Custom errors for gas efficiency and smaller bytecode
error NotAllowed();
error ZeroValue();
error NotSeller();
error NotActive();
error TooLong();
error InvalidData();
error InvalidBatch();
error NotAvailable();
error TokenMismatch();
error NoBid();
error SellerCantBid();
error NotRenter();
error RentalActive();
error RentalExpired();
error InvalidAddress();
error NoFees();
error AuctionNotFound();
error AuctionAlreadySettled();
error AuctionEnded();
error AuctionNotEnded();
error BidTooLow();
error HasBids();
error DurationInvalid();

/**
 * @title OVGMarketplaceUpgradeable
 * @dev Marketplace for OVGrid assets with support for direct sales, rentals, royalties, 
 * marketplace fees, and multi-token payments (OVG, USDC, USDT, etc.).
 * UUPS upgradeable version with emergency pause functionality.
 * @author Esteban Fuster Pozzi (@estebanrfp)
 */
contract OVGMarketplaceUpgradeable is 
    Initializable,
    OwnableUpgradeable, 
    ReentrancyGuardUpgradeable,
    PausableUpgradeable,
    UUPSUpgradeable 
{
    using SafeERC20 for IERC20;

    // ============ Storage Layout ============
    // IMPORTANT: Do NOT change the order of these variables in future versions.
    // Only append new variables at the end.
    
    IERC20 public ovgToken;
    IOVGAssets public ovgAssets;

    struct Listing {
        address seller;
        uint256 assetId;
        uint256 amount;
        uint256 price;
        bool isRental;
        uint256 duration;
    }

    struct BundleListing {
        address seller;
        uint256[] assetIds;
        uint256[] amounts;
        uint256 price;
        bool active;
    }

    struct Rental {
        address renter;
        uint256 expiresAt;
    }

    struct Bid {
        address bidder;
        uint256 price;
        uint256 timestamp;
    }

    // V1.5.0 - Timed Auctions
    struct TimedAuction {
        address seller;
        uint256 assetId;
        uint256 amount;
        uint256 minBid;
        uint256 startTime;
        uint256 endTime;
        address highestBidder;
        uint256 highestBid;
        bool settled;
    }

    mapping(uint256 => Listing) public listings;
    mapping(uint256 => BundleListing) public bundleListings;
    mapping(uint256 => Rental) public activeRentals;
    mapping(uint256 => mapping(address => Bid)) public bids;
    mapping(uint256 => mapping(address => Bid)) public globalBids;
    
    uint256 public nextListingId;
    uint256 public nextBundleId;

    // V1.1.0 - Bundle names support
    mapping(uint256 => string) public bundleNames;
    uint256 public constant MAX_BUNDLE_NAME_LENGTH = 32;

    // V1.2.0 - Marketplace fees and pausable
    uint256 public marketplaceFee;
    address public feeRecipient;
    uint256 public accumulatedFees;
    uint256 public constant MAX_MARKETPLACE_FEE = 1000;

    // V1.3.0 - Multi-token support
    mapping(address => bool) public allowedTokens;
    mapping(uint256 => address) public listingPaymentToken;
    mapping(uint256 => address) public bundlePaymentToken;
    mapping(uint256 => mapping(address => address)) public bidPaymentToken;
    mapping(uint256 => mapping(address => address)) public globalBidPaymentToken;
    mapping(address => uint256) public accumulatedFeesByToken;

    // ============ Events ============
    event Listed(uint256 indexed listingId, address indexed seller, uint256 assetId, uint256 price);
    event ListedWithToken(uint256 indexed listingId, address indexed seller, uint256 assetId, uint256 price, address paymentToken);
    event BundleListed(uint256 indexed bundleId, address indexed seller, uint256[] assetIds, uint256 price);
    event BundleListedWithToken(uint256 indexed bundleId, address indexed seller, uint256[] assetIds, uint256 price, address paymentToken);
    event Purchased(uint256 indexed listingId, address indexed buyer, uint256 price, uint256 royalty);
    event PurchasedWithToken(uint256 indexed listingId, address indexed buyer, uint256 price, uint256 royalty, address paymentToken);
    event BundlePurchased(uint256 indexed bundleId, address indexed buyer, uint256 price);
    event BundlePurchasedWithToken(uint256 indexed bundleId, address indexed buyer, uint256 price, address paymentToken);
    event Rented(uint256 indexed listingId, address indexed renter, uint256 expiresAt);
    event RentalExtended(uint256 indexed listingId, address indexed renter, uint256 newExpiresAt);
    event Cancelled(uint256 indexed listingId, address indexed seller);
    event ListingUpdated(uint256 indexed listingId, address indexed seller, uint256 newPrice, uint256 newDuration);
    event BundleCancelled(uint256 indexed bundleId, address indexed seller);
    event BidPlaced(uint256 indexed listingId, address indexed bidder, uint256 price);
    event BidPlacedWithToken(uint256 indexed listingId, address indexed bidder, uint256 price, address paymentToken);
    event GlobalBidPlaced(uint256 indexed assetId, address indexed bidder, uint256 price);
    event GlobalBidPlacedWithToken(uint256 indexed assetId, address indexed bidder, uint256 price, address paymentToken);
    event BidAccepted(uint256 indexed listingId, address indexed seller, address indexed bidder, uint256 price, uint256 royalty);
    event GlobalBidAccepted(uint256 indexed assetId, address indexed seller, address indexed bidder, uint256 price, uint256 royalty);
    event BidWithdrawn(uint256 indexed listingId, address indexed bidder);
    event GlobalBidWithdrawn(uint256 indexed assetId, address indexed bidder);
    event BundleRenamed(uint256 indexed bundleId, address indexed seller, string name);
    event MarketplaceFeeUpdated(uint256 oldFee, uint256 newFee);
    event FeeRecipientUpdated(address oldRecipient, address newRecipient);
    event FeesWithdrawn(address indexed recipient, uint256 amount);
    event FeesWithdrawnByToken(address indexed recipient, address indexed token, uint256 amount);
    event TokenAllowed(address indexed token, bool allowed);

    // V1.4.0 - Batch operations
    event BatchListed(uint256[] listingIds, address indexed seller, uint256[] assetIds, uint256[] prices, address paymentToken);
    event BatchPurchased(uint256[] listingIds, address indexed buyer, uint256 totalPrice, uint256 totalRoyalties, address paymentToken);

    // V1.5.0 - Timed Auctions
    event AuctionCreated(uint256 indexed auctionId, address indexed seller, uint256 assetId, uint256 minBid, uint256 endTime, address paymentToken);
    event AuctionBidPlaced(uint256 indexed auctionId, address indexed bidder, uint256 bidAmount, address paymentToken);
    event AuctionSettled(uint256 indexed auctionId, address indexed seller, address indexed winner, uint256 finalBid, uint256 royalty, uint256 fee);
    event AuctionCancelled(uint256 indexed auctionId, address indexed seller);
    event AuctionUpdated(uint256 indexed auctionId, address indexed seller, uint256 newEndTime);

    // Batch operation constants
    uint256 public constant MAX_BATCH_SIZE = 15;

    // V1.5.0 - Timed Auctions
    mapping(uint256 => TimedAuction) public timedAuctions;
    mapping(uint256 => address) public auctionPaymentToken;
    uint256 public nextAuctionId;
    uint256 public constant MIN_AUCTION_DURATION = 300;      // 5 minutes
    uint256 public constant MAX_AUCTION_DURATION = 30 days;
    uint256 public constant MIN_BID_INCREMENT = 100;         // 1% in basis points

    // V2.0.0 - On-chain metadata
    struct ListingMetadata {
        string title;       // max 64 chars
        string description; // max 160 chars
        string imageUrl;    // max 128 chars
        string assetUrl;    // max 128 chars
    }

    mapping(uint256 => ListingMetadata) public listingMetadata;
    mapping(uint256 => ListingMetadata) public bundleMetadata;
    mapping(uint256 => ListingMetadata) public auctionMetadata;

    uint256 public constant MAX_TITLE_LENGTH = 64;
    uint256 public constant MAX_DESCRIPTION_LENGTH = 160;
    uint256 public constant MAX_URL_LENGTH = 128;

    event ListingMetadataUpdated(uint256 indexed listingId, string title, string imageUrl);
    event BundleMetadataUpdated(uint256 indexed bundleId, string title, string imageUrl);
    event AuctionMetadataUpdated(uint256 indexed auctionId, string title, string imageUrl);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @dev Initializes the contract replacing the constructor.
     * @param _ovgToken Address of the OVG token contract
     * @param _ovgAssets Address of the OVG assets contract
     * @param initialOwner Address of the contract owner
     */
    function initialize(
        address _ovgToken, 
        address _ovgAssets, 
        address initialOwner
    ) public initializer {
        __Ownable_init(initialOwner);
        __ReentrancyGuard_init();
        __Pausable_init();
        __UUPSUpgradeable_init();

        ovgToken = IERC20(_ovgToken);
        ovgAssets = IOVGAssets(_ovgAssets);
        
        marketplaceFee = 250;
        feeRecipient = initialOwner;
    }

    /**
     * @dev Reinitializer for V1.2.0 upgrade - sets fee defaults for existing proxies.
     */
    function initializeV1_2(address _feeRecipient) public reinitializer(2) {
        __Pausable_init();
        marketplaceFee = 250;
        feeRecipient = _feeRecipient;
    }

    /**
     * @dev Reinitializer for V1.3.0 upgrade - enables multi-token support.
     * @param _additionalTokens Array of token addresses to whitelist (OVG is always allowed)
     */
    function initializeV1_3(address[] calldata _additionalTokens) public reinitializer(3) {
        // OVG token is always allowed
        allowedTokens[address(ovgToken)] = true;
        emit TokenAllowed(address(ovgToken), true);
        
        // Add additional tokens
        for (uint256 i = 0; i < _additionalTokens.length; i++) {
            if (_additionalTokens[i] != address(0)) {
                allowedTokens[_additionalTokens[i]] = true;
                emit TokenAllowed(_additionalTokens[i], true);
            }
        }
    }

    // ============ Modifiers ============

    modifier validToken(address token) {
        if (!allowedTokens[token]) revert NotAllowed();
        _;
    }

    // ============ Listing Functions ============

    /**
     * @dev List an asset for sale or rent (defaults to OVG token for backwards compatibility).
     */
    function listAsset(uint256 assetId, uint256 amount, uint256 price, bool isRental, uint256 duration) external whenNotPaused {
        _listAssetWithToken(assetId, amount, price, isRental, duration, address(ovgToken));
    }

    /**
     * @dev List an asset for sale or rent with a specific payment token.
     * @param assetId The asset to list
     * @param amount Number of units to list
     * @param price Price per unit in the specified token
     * @param isRental Whether this is a rental listing
     * @param duration Rental duration in seconds (ignored for sales)
     * @param paymentToken The ERC20 token to accept as payment
     */
    function listAssetWithToken(
        uint256 assetId, 
        uint256 amount, 
        uint256 price, 
        bool isRental, 
        uint256 duration,
        address paymentToken
    ) external whenNotPaused validToken(paymentToken) {
        _listAssetWithToken(assetId, amount, price, isRental, duration, paymentToken);
    }

    function _listAssetWithToken(
        uint256 assetId, 
        uint256 amount, 
        uint256 price, 
        bool isRental, 
        uint256 duration,
        address paymentToken
    ) internal {
        if (amount == 0) revert ZeroValue();
        if (price == 0) revert ZeroValue();
        if (!ovgAssets.isApprovedForAll(msg.sender, address(this))) revert NotAllowed();

        uint256 listingId = nextListingId;
        
        listings[listingId] = Listing({
            seller: msg.sender,
            assetId: assetId,
            amount: amount,
            price: price,
            isRental: isRental,
            duration: duration
        });
        
        listingPaymentToken[listingId] = paymentToken;

        emit Listed(listingId, msg.sender, assetId, price);
        emit ListedWithToken(listingId, msg.sender, assetId, price, paymentToken);
        
        nextListingId++;
    }

    // NOTE: Metadata functions moved to external OVGMetadata contract (0x8eDB11F435918371E28AC538c95Cf1b7b6505a10)
    // Storage layout preserved for upgrade compatibility

    /**
     * @dev List a bundle of assets (defaults to OVG token).
     */
    function listBundle(uint256[] calldata assetIds, uint256[] calldata amounts, uint256 price) external whenNotPaused {
        _listBundleInternal(assetIds, amounts, price, "", address(ovgToken));
    }

    /**
     * @dev List a bundle of assets with a custom name (defaults to OVG token).
     */
    function listBundleWithName(uint256[] calldata assetIds, uint256[] calldata amounts, uint256 price, string calldata name) external whenNotPaused {
        if (bytes(name).length > MAX_BUNDLE_NAME_LENGTH) revert TooLong();
        _listBundleInternal(assetIds, amounts, price, name, address(ovgToken));
    }

    /**
     * @dev List a bundle with a specific payment token.
     */
    function listBundleWithToken(
        uint256[] calldata assetIds, 
        uint256[] calldata amounts, 
        uint256 price,
        address paymentToken
    ) external whenNotPaused validToken(paymentToken) {
        _listBundleInternal(assetIds, amounts, price, "", paymentToken);
    }

    /**
     * @dev List a bundle with name and specific payment token.
     */
    function listBundleWithNameAndToken(
        uint256[] calldata assetIds, 
        uint256[] calldata amounts, 
        uint256 price, 
        string calldata name,
        address paymentToken
    ) external whenNotPaused validToken(paymentToken) {
        if (bytes(name).length > MAX_BUNDLE_NAME_LENGTH) revert TooLong();
        _listBundleInternal(assetIds, amounts, price, name, paymentToken);
    }

    function _listBundleInternal(
        uint256[] calldata assetIds, 
        uint256[] calldata amounts, 
        uint256 price, 
        string memory name,
        address paymentToken
    ) internal {
        if (assetIds.length == 0 || assetIds.length != amounts.length) revert InvalidData();
        if (price == 0) revert ZeroValue();
        if (!ovgAssets.isApprovedForAll(msg.sender, address(this))) revert NotAllowed();

        uint256 bundleId = nextBundleId;
        
        bundleListings[bundleId] = BundleListing({
            seller: msg.sender,
            assetIds: assetIds,
            amounts: amounts,
            price: price,
            active: true
        });
        
        bundlePaymentToken[bundleId] = paymentToken;

        if (bytes(name).length > 0) {
            bundleNames[bundleId] = name;
            emit BundleRenamed(bundleId, msg.sender, name);
        }

        emit BundleListed(bundleId, msg.sender, assetIds, price);
        emit BundleListedWithToken(bundleId, msg.sender, assetIds, price, paymentToken);
        
        nextBundleId++;
    }

    /**
     * @dev Set or update the name of a bundle.
     */
    function setBundleName(uint256 bundleId, string calldata name) external {
        if (bundleListings[bundleId].seller != msg.sender) revert NotSeller();
        if (!bundleListings[bundleId].active) revert NotActive();
        if (bytes(name).length > MAX_BUNDLE_NAME_LENGTH) revert TooLong();
        
        bundleNames[bundleId] = name;
        emit BundleRenamed(bundleId, msg.sender, name);
    }

    /**
     * @dev List a bundle with full on-chain metadata.
     * @param assetIds Array of asset IDs in the bundle
     * @param amounts Array of amounts for each asset
     * @param price Bundle price
     * @param paymentToken The ERC20 token to accept as payment
     */

    /**
     * @dev Get the name of a bundle.
     */
    function getBundleName(uint256 bundleId) external view returns (string memory) {
        return bundleNames[bundleId];
    }

    /**
     * @dev Get the payment token for a listing.
     */
    function getListingPaymentToken(uint256 listingId) external view returns (address) {
        address token = listingPaymentToken[listingId];
        return token == address(0) ? address(ovgToken) : token;
    }

    /**
     * @dev Get the payment token for a bundle.
     */
    function getBundlePaymentToken(uint256 bundleId) external view returns (address) {
        address token = bundlePaymentToken[bundleId];
        return token == address(0) ? address(ovgToken) : token;
    }

    // ============ Batch Operations (V1.4.0) ============

    /**
     * @dev List multiple assets at once with a single payment token.
     * @param assetIds Array of asset IDs to list
     * @param amounts Array of amounts for each asset
     * @param prices Array of prices for each asset
     * @param isRentals Array indicating if each listing is a rental (must all be false)
     * @param paymentToken Token address for all listings (must be allowed)
     * @return listingIds Array of created listing IDs
     */
    function batchListAssets(
        uint256[] calldata assetIds,
        uint256[] calldata amounts,
        uint256[] calldata prices,
        bool[] calldata isRentals,
        uint256[] calldata, // durations - unused for sales
        address paymentToken
    ) external whenNotPaused validToken(paymentToken) returns (uint256[] memory listingIds) {
        uint256 len = assetIds.length;
        if (len == 0) revert InvalidBatch();
        if (len > MAX_BATCH_SIZE) revert InvalidBatch();
        if (len != amounts.length || len != prices.length || len != isRentals.length) revert InvalidData();
        if (!ovgAssets.isApprovedForAll(msg.sender, address(this))) revert NotAllowed();

        listingIds = new uint256[](len);
        uint256 startId = nextListingId;

        for (uint256 i = 0; i < len; i++) {
            if (amounts[i] == 0 || prices[i] == 0) revert ZeroValue();
            if (isRentals[i]) revert NotAvailable();

            listings[startId + i] = Listing({
                seller: msg.sender,
                assetId: assetIds[i],
                amount: amounts[i],
                price: prices[i],
                isRental: false,
                duration: 0
            });

            listingPaymentToken[startId + i] = paymentToken;
            listingIds[i] = startId + i;

            emit Listed(startId + i, msg.sender, assetIds[i], prices[i]);
        }

        nextListingId = startId + len;
        emit BatchListed(listingIds, msg.sender, assetIds, prices, paymentToken);
        return listingIds;
    }

    /**
     * @dev Purchase multiple listings at once. All must use the same payment token.
     * @param listingIds Array of listing IDs to purchase
     */
    function batchPurchase(uint256[] calldata listingIds) external nonReentrant whenNotPaused {
        uint256 len = listingIds.length;
        if (len == 0) revert InvalidBatch();
        if (len > MAX_BATCH_SIZE) revert InvalidBatch();

        // Determine payment token from first listing
        address paymentToken = listingPaymentToken[listingIds[0]];
        if (paymentToken == address(0)) paymentToken = address(ovgToken);

        IERC20 token = IERC20(paymentToken);
        uint256 totalPrice;
        uint256 totalRoyalties;

        // First pass: validate and calculate total price
        for (uint256 i = 0; i < len; i++) {
            Listing storage listing = listings[listingIds[i]];
            if (listing.isRental || listing.amount == 0) revert NotAvailable();

            address listingToken = listingPaymentToken[listingIds[i]];
            if (listingToken == address(0)) listingToken = address(ovgToken);
            if (listingToken != paymentToken) revert TokenMismatch();

            totalPrice += listing.price;
        }

        // Transfer total from buyer upfront
        token.safeTransferFrom(msg.sender, address(this), totalPrice);

        // Second pass: process each listing
        for (uint256 i = 0; i < len; i++) {
            Listing storage listing = listings[listingIds[i]];
            uint256 price = listing.price;

            (address creator, uint256 royaltyAmount) = ovgAssets.getRoyaltyInfo(listing.assetId, price);
            uint256 feeAmount = (price * marketplaceFee) / 10000;
            uint256 sellerAmount = price - royaltyAmount - feeAmount;
            totalRoyalties += royaltyAmount;

            if (royaltyAmount > 0 && creator != address(0)) {
                token.safeTransfer(creator, royaltyAmount);
            }
            if (feeAmount > 0) {
                if (feeRecipient != address(0)) {
                    token.safeTransfer(feeRecipient, feeAmount);
                } else {
                    accumulatedFeesByToken[paymentToken] += feeAmount;
                }
            }
            token.safeTransfer(listing.seller, sellerAmount);
            ovgAssets.safeTransferFrom(listing.seller, msg.sender, listing.assetId, 1, "");
            listing.amount--;

            emit Purchased(listingIds[i], msg.sender, price, royaltyAmount);
        }

        emit BatchPurchased(listingIds, msg.sender, totalPrice, totalRoyalties, paymentToken);
    }

    // ============ Purchase Functions ============

    /**
     * @dev Purchase a listed asset with royalty and marketplace fee support.
     */
    function purchase(uint256 listingId) external nonReentrant whenNotPaused {
        Listing memory listing = listings[listingId];
        if (listing.isRental) revert NotAvailable();
        if (listing.amount == 0) revert NotAvailable();

        address paymentToken = listingPaymentToken[listingId];
        if (paymentToken == address(0)) paymentToken = address(ovgToken);
        
        IERC20 token = IERC20(paymentToken);

        // Calculate Royalty
        (address creator, uint256 royaltyAmount) = ovgAssets.getRoyaltyInfo(listing.assetId, listing.price);
        
        // Calculate Marketplace Fee
        uint256 feeAmount = (listing.price * marketplaceFee) / 10000;
        uint256 sellerAmount = listing.price - royaltyAmount - feeAmount;

        // Transfer Royalty if applicable
        if (royaltyAmount > 0 && creator != address(0)) {
            token.safeTransferFrom(msg.sender, creator, royaltyAmount);
        }

        // Transfer Marketplace Fee
        if (feeAmount > 0) {
            if (feeRecipient != address(0)) {
                token.safeTransferFrom(msg.sender, feeRecipient, feeAmount);
            } else {
                token.safeTransferFrom(msg.sender, address(this), feeAmount);
                accumulatedFeesByToken[paymentToken] += feeAmount;
            }
        }

        // Transfer payment to seller
        token.safeTransferFrom(msg.sender, listing.seller, sellerAmount);

        // Transfer asset
        ovgAssets.safeTransferFrom(listing.seller, msg.sender, listing.assetId, 1, "");

        listings[listingId].amount--;
        
        emit Purchased(listingId, msg.sender, listing.price, royaltyAmount);
        emit PurchasedWithToken(listingId, msg.sender, listing.price, royaltyAmount, paymentToken);
    }

    /**
     * @dev Purchase a bundle of assets with marketplace fee.
     */
    function purchaseBundle(uint256 bundleId) external nonReentrant whenNotPaused {
        BundleListing storage bundle = bundleListings[bundleId];
        if (!bundle.active) revert NotActive();
        
        address paymentToken = bundlePaymentToken[bundleId];
        if (paymentToken == address(0)) paymentToken = address(ovgToken);
        
        IERC20 token = IERC20(paymentToken);
        
        // Calculate Marketplace Fee
        uint256 feeAmount = (bundle.price * marketplaceFee) / 10000;
        uint256 sellerAmount = bundle.price - feeAmount;

        // Transfer Marketplace Fee
        if (feeAmount > 0) {
            if (feeRecipient != address(0)) {
                token.safeTransferFrom(msg.sender, feeRecipient, feeAmount);
            } else {
                token.safeTransferFrom(msg.sender, address(this), feeAmount);
                accumulatedFeesByToken[paymentToken] += feeAmount;
            }
        }

        // Transfer remaining to seller
        token.safeTransferFrom(msg.sender, bundle.seller, sellerAmount);

        // Transfer all assets in the bundle
        for (uint256 i = 0; i < bundle.assetIds.length; i++) {
            ovgAssets.safeTransferFrom(bundle.seller, msg.sender, bundle.assetIds[i], bundle.amounts[i], "");
        }

        bundle.active = false;
        
        emit BundlePurchased(bundleId, msg.sender, bundle.price);
        emit BundlePurchasedWithToken(bundleId, msg.sender, bundle.price, paymentToken);
    }

    // ============ Bid Functions ============

    /**
     * @dev Place a bid on a listed asset (uses listing's payment token).
     */
    function placeBid(uint256 listingId, uint256 price) external nonReentrant whenNotPaused {
        Listing memory listing = listings[listingId];
        if (listing.amount == 0) revert NotActive();
        if (listing.isRental) revert NotAvailable();
        if (price == 0) revert ZeroValue();
        if (msg.sender == listing.seller) revert SellerCantBid();

        address paymentToken = listingPaymentToken[listingId];
        if (paymentToken == address(0)) paymentToken = address(ovgToken);
        
        IERC20 token = IERC20(paymentToken);

        // If there's an existing bid from this user, refund it first
        Bid storage existingBid = bids[listingId][msg.sender];
        if (existingBid.price > 0) {
            address existingToken = bidPaymentToken[listingId][msg.sender];
            if (existingToken == address(0)) existingToken = address(ovgToken);
            IERC20(existingToken).safeTransfer(msg.sender, existingBid.price);
        }

        // Escrow new bid amount
        token.safeTransferFrom(msg.sender, address(this), price);

        bids[listingId][msg.sender] = Bid({
            bidder: msg.sender,
            price: price,
            timestamp: block.timestamp
        });
        bidPaymentToken[listingId][msg.sender] = paymentToken;

        emit BidPlaced(listingId, msg.sender, price);
        emit BidPlacedWithToken(listingId, msg.sender, price, paymentToken);
    }

    /**
     * @dev Place a global bid on an asset ID with a specific token.
     */
    function placeGlobalBid(uint256 assetId, uint256 price) external nonReentrant whenNotPaused {
        _placeGlobalBidWithToken(assetId, price, address(ovgToken));
    }

    /**
     * @dev Place a global bid with a specific payment token.
     */
    function placeGlobalBidWithToken(uint256 assetId, uint256 price, address paymentToken) external nonReentrant whenNotPaused validToken(paymentToken) {
        _placeGlobalBidWithToken(assetId, price, paymentToken);
    }

    function _placeGlobalBidWithToken(uint256 assetId, uint256 price, address paymentToken) internal {
        if (price == 0) revert ZeroValue();
        
        IERC20 token = IERC20(paymentToken);
        
        Bid storage existingBid = globalBids[assetId][msg.sender];
        if (existingBid.price > 0) {
            address existingToken = globalBidPaymentToken[assetId][msg.sender];
            if (existingToken == address(0)) existingToken = address(ovgToken);
            IERC20(existingToken).safeTransfer(msg.sender, existingBid.price);
        }

        token.safeTransferFrom(msg.sender, address(this), price);

        globalBids[assetId][msg.sender] = Bid({
            bidder: msg.sender,
            price: price,
            timestamp: block.timestamp
        });
        globalBidPaymentToken[assetId][msg.sender] = paymentToken;

        emit GlobalBidPlaced(assetId, msg.sender, price);
        emit GlobalBidPlacedWithToken(assetId, msg.sender, price, paymentToken);
    }

    /**
     * @dev Accept a bid as a seller with royalty and marketplace fee support.
     * @notice Uses Checks-Effects-Interactions pattern to prevent reentrancy
     */
    function acceptBid(uint256 listingId, address bidder) external nonReentrant whenNotPaused {
        Listing memory listing = listings[listingId];
        if (listing.seller != msg.sender) revert NotSeller();
        if (listing.amount == 0) revert NotActive();

        Bid memory bid = bids[listingId][bidder];
        if (bid.price == 0) revert NoBid();

        address paymentToken = bidPaymentToken[listingId][bidder];
        if (paymentToken == address(0)) paymentToken = address(ovgToken);

        IERC20 token = IERC20(paymentToken);

        // Calculate Royalty
        (address creator, uint256 royaltyAmount) = ovgAssets.getRoyaltyInfo(listing.assetId, bid.price);

        // Calculate Marketplace Fee
        uint256 feeAmount = (bid.price * marketplaceFee) / 10000;
        uint256 sellerAmount = bid.price - royaltyAmount - feeAmount;

        // Effects: Update state BEFORE external calls (CEI pattern)
        delete bids[listingId][bidder];
        delete bidPaymentToken[listingId][bidder];
        listings[listingId].amount--;

        // Accumulate fees if no recipient (before external calls)
        if (feeAmount > 0 && feeRecipient == address(0)) {
            accumulatedFeesByToken[paymentToken] += feeAmount;
        }

        // Interactions: External calls AFTER state updates
        if (royaltyAmount > 0 && creator != address(0)) {
            token.safeTransfer(creator, royaltyAmount);
        }
        if (feeAmount > 0 && feeRecipient != address(0)) {
            token.safeTransfer(feeRecipient, feeAmount);
        }
        token.safeTransfer(listing.seller, sellerAmount);
        ovgAssets.safeTransferFrom(listing.seller, bidder, listing.assetId, 1, "");

        emit BidAccepted(listingId, msg.sender, bidder, bid.price, royaltyAmount);
    }

    /**
     * @dev Accept a global bid with royalty and marketplace fee.
     * @notice Uses Checks-Effects-Interactions pattern to prevent reentrancy
     */
    function acceptGlobalBid(uint256 assetId, address bidder) external nonReentrant whenNotPaused {
        Bid memory bid = globalBids[assetId][bidder];
        if (bid.price == 0) revert NoBid();

        if (ovgAssets.balanceOf(msg.sender, assetId) == 0) revert NotAllowed();
        if (!ovgAssets.isApprovedForAll(msg.sender, address(this))) revert NotAllowed();

        address paymentToken = globalBidPaymentToken[assetId][bidder];
        if (paymentToken == address(0)) paymentToken = address(ovgToken);

        IERC20 token = IERC20(paymentToken);

        (address creator, uint256 royaltyAmount) = ovgAssets.getRoyaltyInfo(assetId, bid.price);

        // Calculate Marketplace Fee
        uint256 feeAmount = (bid.price * marketplaceFee) / 10000;
        uint256 sellerAmount = bid.price - royaltyAmount - feeAmount;

        // Effects: Update state BEFORE external calls (CEI pattern)
        delete globalBids[assetId][bidder];
        delete globalBidPaymentToken[assetId][bidder];

        // Accumulate fees if no recipient (before external calls)
        if (feeAmount > 0 && feeRecipient == address(0)) {
            accumulatedFeesByToken[paymentToken] += feeAmount;
        }

        // Interactions: External calls AFTER state updates
        if (royaltyAmount > 0 && creator != address(0)) {
            token.safeTransfer(creator, royaltyAmount);
        }
        if (feeAmount > 0 && feeRecipient != address(0)) {
            token.safeTransfer(feeRecipient, feeAmount);
        }
        token.safeTransfer(msg.sender, sellerAmount);
        ovgAssets.safeTransferFrom(msg.sender, bidder, assetId, 1, "");

        emit GlobalBidAccepted(assetId, msg.sender, bidder, bid.price, royaltyAmount);
    }

    /**
     * @dev Withdraw a bid.
     */
    function withdrawBid(uint256 listingId) external nonReentrant {
        Bid memory bid = bids[listingId][msg.sender];
        if (bid.price == 0) revert NoBid();

        address paymentToken = bidPaymentToken[listingId][msg.sender];
        if (paymentToken == address(0)) paymentToken = address(ovgToken);

        // Refund escrowed tokens
        IERC20(paymentToken).safeTransfer(msg.sender, bid.price);

        delete bids[listingId][msg.sender];
        delete bidPaymentToken[listingId][msg.sender];
        
        emit BidWithdrawn(listingId, msg.sender);
    }

    /**
     * @dev Withdraw a global bid.
     */
    function withdrawGlobalBid(uint256 assetId) external nonReentrant {
        Bid memory bid = globalBids[assetId][msg.sender];
        if (bid.price == 0) revert NoBid();

        address paymentToken = globalBidPaymentToken[assetId][msg.sender];
        if (paymentToken == address(0)) paymentToken = address(ovgToken);

        IERC20(paymentToken).safeTransfer(msg.sender, bid.price);

        delete globalBids[assetId][msg.sender];
        delete globalBidPaymentToken[assetId][msg.sender];
        
        emit GlobalBidWithdrawn(assetId, msg.sender);
    }

    // ============ Rental Functions ============

    /**
     * @dev Rent a listed asset.
     */
    function rent(uint256 listingId) external nonReentrant whenNotPaused {
        Listing memory listing = listings[listingId];
        if (!listing.isRental) revert NotAvailable();
        if (listing.amount == 0) revert NotAvailable();
        if (block.timestamp <= activeRentals[listingId].expiresAt) revert RentalActive();
        
        address paymentToken = listingPaymentToken[listingId];
        if (paymentToken == address(0)) paymentToken = address(ovgToken);
        
        // Transfer rental fee
        IERC20(paymentToken).safeTransferFrom(msg.sender, listing.seller, listing.price);

        uint256 expiresAt = block.timestamp + listing.duration;
        activeRentals[listingId] = Rental({
            renter: msg.sender,
            expiresAt: expiresAt
        });

        emit Rented(listingId, msg.sender, expiresAt);
    }

    /**
     * @dev Extend an active rental.
     */
    function extendRental(uint256 listingId) external nonReentrant {
        Rental storage rental = activeRentals[listingId];
        Listing memory listing = listings[listingId];
        
        if (rental.renter != msg.sender) revert NotRenter();
        if (block.timestamp >= rental.expiresAt) revert RentalExpired();
        
        address paymentToken = listingPaymentToken[listingId];
        if (paymentToken == address(0)) paymentToken = address(ovgToken);
        
        // Pay for extension
        IERC20(paymentToken).safeTransferFrom(msg.sender, listing.seller, listing.price);
        
        rental.expiresAt += listing.duration;
        emit RentalExtended(listingId, msg.sender, rental.expiresAt);
    }

    // ============ Cancel Functions ============

    /**
     * @dev Cancel a listing.
     */
    function cancelListing(uint256 listingId) external {
        Listing memory listing = listings[listingId];
        if (listing.seller != msg.sender) revert NotSeller();
        if (listing.amount == 0) revert NotActive();

        if (listing.isRental) {
            if (block.timestamp <= activeRentals[listingId].expiresAt) revert RentalActive();
        }

        listings[listingId].amount = 0;
        emit Cancelled(listingId, msg.sender);
    }

    /**
     * @dev Update a listing's price and/or duration. Only seller can update.
     * @param listingId The listing to update
     * @param newPrice New price (0 to keep current)
     * @param newDuration New duration in seconds (0 to keep current, only for rentals)
     */
    function updateListing(uint256 listingId, uint256 newPrice, uint256 newDuration) external nonReentrant whenNotPaused {
        Listing storage listing = listings[listingId];
        if (listing.seller != msg.sender) revert NotSeller();
        if (listing.amount == 0) revert NotActive();

        // For rentals, cannot update if actively rented
        if (listing.isRental && block.timestamp <= activeRentals[listingId].expiresAt) {
            revert RentalActive();
        }

        // Update price if provided
        if (newPrice > 0) {
            listing.price = newPrice;
        }

        // Update duration if provided (only meaningful for rentals)
        if (newDuration > 0) {
            listing.duration = newDuration;
        }

        emit ListingUpdated(listingId, msg.sender, listing.price, listing.duration);
    }

    /**
     * @dev Cancel a bundle.
     */
    function cancelBundle(uint256 bundleId) external {
        if (bundleListings[bundleId].seller != msg.sender) revert NotSeller();
        bundleListings[bundleId].active = false;
        emit BundleCancelled(bundleId, msg.sender);
    }

    // ============ Admin Functions ============

    /**
     * @dev Set the marketplace fee. Max 10% (1000 basis points).
     */
    function setMarketplaceFee(uint256 newFee) external onlyOwner {
        if (newFee > MAX_MARKETPLACE_FEE) revert InvalidData();
        uint256 oldFee = marketplaceFee;
        marketplaceFee = newFee;
        emit MarketplaceFeeUpdated(oldFee, newFee);
    }

    /**
     * @dev Set the fee recipient address.
     */
    function setFeeRecipient(address newRecipient) external onlyOwner {
        if (newRecipient == address(0)) revert InvalidAddress();
        address oldRecipient = feeRecipient;
        feeRecipient = newRecipient;
        emit FeeRecipientUpdated(oldRecipient, newRecipient);
    }

    /**
     * @dev Add or remove a token from the allowed list.
     * @param token The token address to modify
     * @param allowed Whether the token should be allowed
     */
    function setAllowedToken(address token, bool allowed) external onlyOwner {
        if (token == address(0)) revert InvalidAddress();
        allowedTokens[token] = allowed;
        emit TokenAllowed(token, allowed);
    }

    /**
     * @dev Check if a token is allowed for payments.
     */
    function isTokenAllowed(address token) external view returns (bool) {
        return allowedTokens[token];
    }

    /**
     * @dev Withdraw accumulated fees for OVG token (backwards compatible).
     */
    function withdrawFees() external onlyOwner {
        withdrawFeesByToken(address(ovgToken));
    }

    /**
     * @dev Withdraw accumulated fees for a specific token.
     * @param token The token to withdraw fees for
     */
    function withdrawFeesByToken(address token) public onlyOwner {
        uint256 amount = accumulatedFeesByToken[token];
        
        // For backwards compatibility, also check old accumulatedFees for OVG
        if (token == address(ovgToken)) {
            amount += accumulatedFees;
            accumulatedFees = 0;
        }
        
        if (amount == 0) revert NoFees();
        
        address recipient = feeRecipient != address(0) ? feeRecipient : owner();
        accumulatedFeesByToken[token] = 0;
        
        IERC20(token).safeTransfer(recipient, amount);
        emit FeesWithdrawnByToken(recipient, token, amount);
    }

    /**
     * @dev Get accumulated fees for a specific token.
     */
    function getAccumulatedFees(address token) external view returns (uint256) {
        uint256 amount = accumulatedFeesByToken[token];
        if (token == address(ovgToken)) {
            amount += accumulatedFees;
        }
        return amount;
    }

    /**
     * @dev Pause the marketplace.
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @dev Unpause the marketplace.
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    // ============ V1.5.0 - Timed Auctions ============

    /**
     * @dev Create a new timed auction for an asset.
     * @param assetId The asset to auction
     * @param amount Amount of the asset (usually 1)
     * @param minBid Minimum starting bid
     * @param duration Auction duration in seconds (5 min to 30 days)
     * @param paymentToken The ERC20 token to accept as payment
     * @return auctionId The created auction ID
     */
    function createAuction(
        uint256 assetId,
        uint256 amount,
        uint256 minBid,
        uint256 duration,
        address paymentToken
    ) external nonReentrant whenNotPaused validToken(paymentToken) returns (uint256 auctionId) {
        if (amount == 0) revert ZeroValue();
        if (minBid == 0) revert ZeroValue();
        if (duration < MIN_AUCTION_DURATION) revert DurationInvalid();
        if (duration > MAX_AUCTION_DURATION) revert DurationInvalid();

        // Transfer asset to contract (escrow)
        ovgAssets.safeTransferFrom(msg.sender, address(this), assetId, amount, "");

        auctionId = nextAuctionId;
        uint256 endTime = block.timestamp + duration;

        timedAuctions[auctionId] = TimedAuction({
            seller: msg.sender,
            assetId: assetId,
            amount: amount,
            minBid: minBid,
            startTime: block.timestamp,
            endTime: endTime,
            highestBidder: address(0),
            highestBid: 0,
            settled: false
        });

        auctionPaymentToken[auctionId] = paymentToken;
        nextAuctionId++;

        emit AuctionCreated(auctionId, msg.sender, assetId, minBid, endTime, paymentToken);
    }

    /**
     * @dev Place a bid on an active auction.
     * @param auctionId The auction to bid on
     * @param bidAmount The bid amount in the auction's payment token
     */
    function placeBidOnAuction(uint256 auctionId, uint256 bidAmount) external nonReentrant whenNotPaused {
        TimedAuction storage auction = timedAuctions[auctionId];
        if (auction.seller == address(0)) revert AuctionNotFound();
        if (auction.settled) revert AuctionAlreadySettled();
        if (block.timestamp >= auction.endTime) revert AuctionEnded();
        if (msg.sender == auction.seller) revert SellerCantBid();
        if (bidAmount < auction.minBid) revert BidTooLow();

        // Check bid is higher than current highest
        if (auction.highestBid > 0) {
            uint256 minIncrement = (auction.highestBid * MIN_BID_INCREMENT) / 10000;
            if (bidAmount < auction.highestBid + minIncrement) revert BidTooLow();
        }

        address paymentToken = auctionPaymentToken[auctionId];
        IERC20 token = IERC20(paymentToken);

        // Refund previous highest bidder
        if (auction.highestBidder != address(0) && auction.highestBid > 0) {
            token.safeTransfer(auction.highestBidder, auction.highestBid);
        }

        // Escrow new bid
        token.safeTransferFrom(msg.sender, address(this), bidAmount);

        auction.highestBidder = msg.sender;
        auction.highestBid = bidAmount;

        emit AuctionBidPlaced(auctionId, msg.sender, bidAmount, paymentToken);
    }

    /**
     * @dev Settle an ended auction. Anyone can call this.
     * @param auctionId The auction to settle
     */
    function settleAuction(uint256 auctionId) external nonReentrant whenNotPaused {
        TimedAuction storage auction = timedAuctions[auctionId];
        if (auction.seller == address(0)) revert AuctionNotFound();
        if (auction.settled) revert AuctionAlreadySettled();
        if (block.timestamp < auction.endTime) revert AuctionNotEnded();

        auction.settled = true;

        address paymentToken = auctionPaymentToken[auctionId];
        uint256 royaltyAmount = 0;
        uint256 feeAmount = 0;

        if (auction.highestBidder != address(0) && auction.highestBid > 0) {
            // Winner exists - transfer asset to winner
            ovgAssets.safeTransferFrom(address(this), auction.highestBidder, auction.assetId, auction.amount, "");

            IERC20 token = IERC20(paymentToken);

            // Calculate royalty
            (address creator, uint256 royalty) = ovgAssets.getRoyaltyInfo(auction.assetId, auction.highestBid);
            royaltyAmount = royalty;

            // Calculate marketplace fee
            feeAmount = (auction.highestBid * marketplaceFee) / 10000;
            uint256 sellerAmount = auction.highestBid - royaltyAmount - feeAmount;

            // Pay royalty
            if (royaltyAmount > 0 && creator != address(0)) {
                token.safeTransfer(creator, royaltyAmount);
            }

            // Pay marketplace fee
            if (feeAmount > 0) {
                if (feeRecipient != address(0)) {
                    token.safeTransfer(feeRecipient, feeAmount);
                } else {
                    accumulatedFeesByToken[paymentToken] += feeAmount;
                }
            }

            // Pay seller
            token.safeTransfer(auction.seller, sellerAmount);

            emit AuctionSettled(auctionId, auction.seller, auction.highestBidder, auction.highestBid, royaltyAmount, feeAmount);
        } else {
            // No bids - return asset to seller
            ovgAssets.safeTransferFrom(address(this), auction.seller, auction.assetId, auction.amount, "");

            emit AuctionSettled(auctionId, auction.seller, address(0), 0, 0, 0);
        }
    }

    /**
     * @dev Cancel an auction. Only seller can cancel, and only if no bids.
     * @param auctionId The auction to cancel
     */
    function cancelAuction(uint256 auctionId) external nonReentrant whenNotPaused {
        TimedAuction storage auction = timedAuctions[auctionId];
        if (auction.seller != msg.sender) revert NotSeller();
        if (auction.settled) revert AuctionAlreadySettled();
        if (auction.highestBidder != address(0)) revert HasBids();

        auction.settled = true;

        // Return asset to seller
        ovgAssets.safeTransferFrom(address(this), msg.sender, auction.assetId, auction.amount, "");

        emit AuctionCancelled(auctionId, msg.sender);
    }

    /**
     * @dev Update an auction's duration. Only seller can update, and only if no bids.
     * @param auctionId The auction to update
     * @param newDuration New duration in seconds from now (5 min to 30 days)
     */
    function updateAuction(uint256 auctionId, uint256 newDuration) external nonReentrant whenNotPaused {
        TimedAuction storage auction = timedAuctions[auctionId];
        if (auction.seller != msg.sender) revert NotSeller();
        if (auction.settled) revert AuctionAlreadySettled();
        if (auction.highestBidder != address(0)) revert HasBids();
        if (newDuration < MIN_AUCTION_DURATION) revert DurationInvalid();
        if (newDuration > MAX_AUCTION_DURATION) revert DurationInvalid();

        uint256 newEndTime = block.timestamp + newDuration;
        auction.endTime = newEndTime;

        emit AuctionUpdated(auctionId, msg.sender, newEndTime);
    }

    /**
     * @dev Get auction details.
     * @param auctionId The auction ID
     * @return The auction struct
     */
    function getAuction(uint256 auctionId) external view returns (TimedAuction memory) {
        return timedAuctions[auctionId];
    }

    /**
     * @dev Check if an auction is currently active (not settled and not ended).
     * @param auctionId The auction ID
     * @return True if auction is active
     */
    function isAuctionActive(uint256 auctionId) external view returns (bool) {
        TimedAuction memory auction = timedAuctions[auctionId];
        return auction.seller != address(0) &&
               !auction.settled &&
               block.timestamp < auction.endTime;
    }

    /**
     * @dev Get time remaining for an auction.
     * @param auctionId The auction ID
     * @return Seconds remaining, or 0 if ended
     */
    function getAuctionTimeRemaining(uint256 auctionId) external view returns (uint256) {
        TimedAuction memory auction = timedAuctions[auctionId];
        if (auction.seller == address(0) || auction.settled || block.timestamp >= auction.endTime) {
            return 0;
        }
        return auction.endTime - block.timestamp;
    }

    /**
     * @dev Reinitializer for V1.5.0 upgrade.
     */
    function initializeV1_5() public reinitializer(5) {
        // No state initialization needed, mappings auto-initialize
    }

    /**
     * @dev Reinitializer for V2.0.0 upgrade - enables on-chain metadata.
     * No state initialization needed, mappings auto-initialize to empty values.
     */
    function initializeV2_0() public reinitializer(6) {
        // Metadata mappings auto-initialize to empty structs
    }

    /**
     * @dev Authorize upgrade. Only accessible by owner.
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    /**
     * @dev Returns the current implementation version.
     */
    function version() public pure virtual returns (string memory) {
        return "2.2.0";
    }

    /**
     * @dev ERC1155 receiver hook - required to receive ERC1155 tokens.
     */
    function onERC1155Received(
        address,
        address,
        uint256,
        uint256,
        bytes calldata
    ) external pure returns (bytes4) {
        return this.onERC1155Received.selector;
    }

    /**
     * @dev ERC1155 batch receiver hook - required to receive ERC1155 tokens.
     */
    function onERC1155BatchReceived(
        address,
        address,
        uint256[] calldata,
        uint256[] calldata,
        bytes calldata
    ) external pure returns (bytes4) {
        return this.onERC1155BatchReceived.selector;
    }
}
