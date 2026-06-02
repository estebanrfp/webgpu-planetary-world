// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IOVGAssets is IERC1155 {
    function getRoyaltyInfo(uint256 assetId, uint256 salePrice) external view returns (address, uint256);
}

/**
 * @title OVGMarketplace
 * @dev Marketplace for OVGrid assets with support for direct sales, rentals, and royalties.
 * @author Esteban Fuster Pozzi (@estebanrfp)
 */
contract OVGMarketplace is Ownable, ReentrancyGuard {
    IERC20 public immutable ovgToken;
    IOVGAssets public immutable ovgAssets;

    struct Listing {
        address seller;
        uint256 assetId;
        uint256 amount;
        uint256 price; // Price in OVG tokens
        bool isRental;
        uint256 duration; // Rental duration in blocks/seconds
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

    mapping(uint256 => Listing) public listings;
    mapping(uint256 => BundleListing) public bundleListings;
    mapping(uint256 => Rental) public activeRentals;
    // listingId => bidder => Bid
    mapping(uint256 => mapping(address => Bid)) public bids;
    // assetId => bidder => Bid (for global/unlisted bids)
    mapping(uint256 => mapping(address => Bid)) public globalBids;
    
    uint256 public nextListingId;
    uint256 public nextBundleId;

    event Listed(uint256 indexed listingId, address indexed seller, uint256 assetId, uint256 price);
    event BundleListed(uint256 indexed bundleId, address indexed seller, uint256[] assetIds, uint256 price);
    event Purchased(uint256 indexed listingId, address indexed buyer, uint256 price, uint256 royalty);
    event BundlePurchased(uint256 indexed bundleId, address indexed buyer, uint256 price);
    event Rented(uint256 indexed listingId, address indexed renter, uint256 expiresAt);
    event RentalExtended(uint256 indexed listingId, address indexed renter, uint256 newExpiresAt);
    event Cancelled(uint256 indexed listingId, address indexed seller);
    event BundleCancelled(uint256 indexed bundleId, address indexed seller);
    event BidPlaced(uint256 indexed listingId, address indexed bidder, uint256 price);
    event GlobalBidPlaced(uint256 indexed assetId, address indexed bidder, uint256 price);
    event BidAccepted(uint256 indexed listingId, address indexed seller, address indexed bidder, uint256 price, uint256 royalty);
    event GlobalBidAccepted(uint256 indexed assetId, address indexed seller, address indexed bidder, uint256 price, uint256 royalty);
    event BidWithdrawn(uint256 indexed listingId, address indexed bidder);
    event GlobalBidWithdrawn(uint256 indexed assetId, address indexed bidder);

    constructor(address _ovgToken, address _ovgAssets, address initialOwner) Ownable(initialOwner) {
        ovgToken = IERC20(_ovgToken);
        ovgAssets = IOVGAssets(_ovgAssets);
    }

    /**
     * @dev List an asset for sale or rent.
     */
    function listAsset(uint256 assetId, uint256 amount, uint256 price, bool isRental, uint256 duration) external {
        require(amount > 0, "Amount must be > 0");
        require(price > 0, "Price must be > 0");
        
        // Ensure marketplace is approved
        require(ovgAssets.isApprovedForAll(msg.sender, address(this)), "Marketplace not approved");

        listings[nextListingId] = Listing({
            seller: msg.sender,
            assetId: assetId,
            amount: amount,
            price: price,
            isRental: isRental,
            duration: duration
        });

        emit Listed(nextListingId, msg.sender, assetId, price);
        nextListingId++;
    }

    /**
     * @dev List a bundle of assets.
     */
    function listBundle(uint256[] calldata assetIds, uint256[] calldata amounts, uint256 price) external {
        require(assetIds.length > 0 && assetIds.length == amounts.length, "Invalid bundle data");
        require(price > 0, "Price must be > 0");
        require(ovgAssets.isApprovedForAll(msg.sender, address(this)), "Marketplace not approved");

        bundleListings[nextBundleId] = BundleListing({
            seller: msg.sender,
            assetIds: assetIds,
            amounts: amounts,
            price: price,
            active: true
        });

        emit BundleListed(nextBundleId, msg.sender, assetIds, price);
        nextBundleId++;
    }

    /**
     * @dev Purchase a listed asset with royalty support.
     */
    function purchase(uint256 listingId) external nonReentrant {
        Listing memory listing = listings[listingId];
        require(!listing.isRental, "Item is for rent only");
        require(listing.amount > 0, "Listing expired or sold out");

        // Calculate Royalty
        (address creator, uint256 royaltyAmount) = ovgAssets.getRoyaltyInfo(listing.assetId, listing.price);
        uint256 sellerAmount = listing.price - royaltyAmount;

        // Transfer Royaltie if applicable
        if (royaltyAmount > 0 && creator != address(0)) {
            require(ovgToken.transferFrom(msg.sender, creator, royaltyAmount), "Royalty payment failed");
        }

        // Transfer payment to seller
        require(ovgToken.transferFrom(msg.sender, listing.seller, sellerAmount), "Payment to seller failed");

        // Transfer asset
        ovgAssets.safeTransferFrom(listing.seller, msg.sender, listing.assetId, 1, "");

        listings[listingId].amount--;
        emit Purchased(listingId, msg.sender, listing.price, royaltyAmount);
    }

    /**
     * @dev Purchase a bundle of assets.
     */
    function purchaseBundle(uint256 bundleId) external nonReentrant {
        BundleListing storage bundle = bundleListings[bundleId];
        require(bundle.active, "Bundle not active");
        
        // Transfer full price to seller
        require(ovgToken.transferFrom(msg.sender, bundle.seller, bundle.price), "Payment failed");

        // Transfer all assets in the bundle
        for (uint256 i = 0; i < bundle.assetIds.length; i++) {
            ovgAssets.safeTransferFrom(bundle.seller, msg.sender, bundle.assetIds[i], bundle.amounts[i], "");
        }

        bundle.active = false;
        emit BundlePurchased(bundleId, msg.sender, bundle.price);
    }

    /**
     * @dev Place a bid/offer on a listed asset.
     */
    function placeBid(uint256 listingId, uint256 price) external nonReentrant {
        Listing memory listing = listings[listingId];
        require(listing.amount > 0, "Listing is not active");
        require(!listing.isRental, "Cannot bid on rentals");
        require(price > 0, "Bid must be > 0");
        require(msg.sender != listing.seller, "Seller cannot bid");

        // If there's an existing bid from this user, refund it first
        Bid storage existingBid = bids[listingId][msg.sender];
        if (existingBid.price > 0) {
            require(ovgToken.transfer(msg.sender, existingBid.price), "Refund failed");
        }

        // Escrow new bid amount
        require(ovgToken.transferFrom(msg.sender, address(this), price), "Escrow failed");

        bids[listingId][msg.sender] = Bid({
            bidder: msg.sender,
            price: price,
            timestamp: block.timestamp
        });

        emit BidPlaced(listingId, msg.sender, price);
    }

    /**
     * @dev Place a global bid on an asset ID (even if not listed).
     */
    function placeGlobalBid(uint256 assetId, uint256 price) external nonReentrant {
        require(price > 0, "Bid must be > 0");
        
        Bid storage existingBid = globalBids[assetId][msg.sender];
        if (existingBid.price > 0) {
            require(ovgToken.transfer(msg.sender, existingBid.price), "Refund failed");
        }

        require(ovgToken.transferFrom(msg.sender, address(this), price), "Escrow failed");

        globalBids[assetId][msg.sender] = Bid({
            bidder: msg.sender,
            price: price,
            timestamp: block.timestamp
        });

        emit GlobalBidPlaced(assetId, msg.sender, price);
    }

    /**
     * @dev Accept a bid as a seller with royalty support.
     * @notice Uses Checks-Effects-Interactions pattern to prevent reentrancy
     */
    function acceptBid(uint256 listingId, address bidder) external nonReentrant {
        Listing memory listing = listings[listingId];
        require(listing.seller == msg.sender, "Only seller can accept");
        require(listing.amount > 0, "Listing is not active");

        Bid memory bid = bids[listingId][bidder];
        require(bid.price > 0, "Bid does not exist");

        // Calculate Royalty
        (address creator, uint256 royaltyAmount) = ovgAssets.getRoyaltyInfo(listing.assetId, bid.price);
        uint256 sellerAmount = bid.price - royaltyAmount;

        // Effects: Update state BEFORE external calls (CEI pattern)
        delete bids[listingId][bidder];
        listings[listingId].amount--;

        // Interactions: External calls AFTER state updates
        if (royaltyAmount > 0 && creator != address(0)) {
            require(ovgToken.transfer(creator, royaltyAmount), "Royalty payment from escrow failed");
        }
        require(ovgToken.transfer(listing.seller, sellerAmount), "Payment to seller from escrow failed");
        ovgAssets.safeTransferFrom(listing.seller, bidder, listing.assetId, 1, "");

        emit BidAccepted(listingId, msg.sender, bidder, bid.price, royaltyAmount);
    }

    /**
     * @dev Accept a global bid.
     * @notice Uses Checks-Effects-Interactions pattern to prevent reentrancy
     */
    function acceptGlobalBid(uint256 assetId, address bidder) external nonReentrant {
        Bid memory bid = globalBids[assetId][bidder];
        require(bid.price > 0, "Bid does not exist");

        // Ensure msg.sender owns the asset and marketplace is approved
        require(ovgAssets.balanceOf(msg.sender, assetId) > 0, "You do not own this asset");
        require(ovgAssets.isApprovedForAll(msg.sender, address(this)), "Marketplace not approved");

        (address creator, uint256 royaltyAmount) = ovgAssets.getRoyaltyInfo(assetId, bid.price);
        uint256 sellerAmount = bid.price - royaltyAmount;

        // Effects: Update state BEFORE external calls (CEI pattern)
        delete globalBids[assetId][bidder];

        // Interactions: External calls AFTER state updates
        if (royaltyAmount > 0 && creator != address(0)) {
            require(ovgToken.transfer(creator, royaltyAmount), "Royalty failed");
        }
        require(ovgToken.transfer(msg.sender, sellerAmount), "Payment failed");
        ovgAssets.safeTransferFrom(msg.sender, bidder, assetId, 1, "");

        emit GlobalBidAccepted(assetId, msg.sender, bidder, bid.price, royaltyAmount);
    }

    /**
     * @dev Withdraw a bid.
     */
    function withdrawBid(uint256 listingId) external nonReentrant {
        Bid memory bid = bids[listingId][msg.sender];
        require(bid.price > 0, "Bid does not exist");

        // Refund escrowed tokens
        require(ovgToken.transfer(msg.sender, bid.price), "Withdraw failed");

        delete bids[listingId][msg.sender];
        emit BidWithdrawn(listingId, msg.sender);
    }

    /**
     * @dev Withdraw a global bid.
     */
    function withdrawGlobalBid(uint256 assetId) external nonReentrant {
        Bid memory bid = globalBids[assetId][msg.sender];
        require(bid.price > 0, "Bid does not exist");

        require(ovgToken.transfer(msg.sender, bid.price), "Withdraw failed");

        delete globalBids[assetId][msg.sender];
        emit GlobalBidWithdrawn(assetId, msg.sender);
    }

    /**
     * @dev Rent a listed asset.
     */
    function rent(uint256 listingId) external nonReentrant {
        Listing memory listing = listings[listingId];
        require(listing.isRental, "Item is for sale only");
        require(listing.amount > 0, "No assets available");
        // Ensure not currently rented by someone else (or expired)
        require(block.timestamp > activeRentals[listingId].expiresAt, "Asset is currently rented");
        
        // Transfer rental fee
        require(ovgToken.transferFrom(msg.sender, listing.seller, listing.price), "Rental payment failed");

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
        
        require(rental.renter == msg.sender, "Not the renter");
        require(block.timestamp < rental.expiresAt, "Rental already expired, must start new");
        
        // Pay for extension
        require(ovgToken.transferFrom(msg.sender, listing.seller, listing.price), "Extension payment failed");
        
        rental.expiresAt += listing.duration;
        emit RentalExtended(listingId, msg.sender, rental.expiresAt);
    }

    /**
     * @dev Cancel a listing.
     */
    function cancelListing(uint256 listingId) external {
        Listing memory listing = listings[listingId];
        require(listing.seller == msg.sender, "Only seller can cancel");
        require(listing.amount > 0, "Listing already inactive");

        // If it's a rental, ensure it's not currently active
        if (listing.isRental) {
            require(block.timestamp > activeRentals[listingId].expiresAt, "Cannot cancel active rental");
        }

        listings[listingId].amount = 0;
        emit Cancelled(listingId, msg.sender);
    }

    /**
     * @dev Cancel a bundle.
     */
    function cancelBundle(uint256 bundleId) external {
        require(bundleListings[bundleId].seller == msg.sender, "Only seller can cancel");
        bundleListings[bundleId].active = false;
        emit BundleCancelled(bundleId, msg.sender);
    }
}
