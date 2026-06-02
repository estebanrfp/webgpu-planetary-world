// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title OVGMetadataUpgradeable
 * @dev External metadata storage for OVGrid Marketplace listings, bundles, and auctions.
 * Separates metadata from main contract to avoid code size limits.
 * @author Esteban Fuster Pozzi (@estebanrfp)
 */
contract OVGMetadataUpgradeable is
    Initializable,
    OwnableUpgradeable,
    UUPSUpgradeable
{
    // ============ Storage ============

    struct ListingMetadata {
        string title;       // max 64 chars
        string description; // max 160 chars
        string imageUrl;    // max 128 chars
        string assetUrl;    // max 128 chars
    }

    // V2.3.0: Asset attributes for OpenSea traits
    struct AssetAttributes {
        string rarity;      // Common, Uncommon, Rare, Epic, Legendary
        string category;    // Objects, Wearables, Land, Auditoriums, Tools
        string collection;  // Collection name
    }

    mapping(uint256 => ListingMetadata) public listingMetadata;
    mapping(uint256 => ListingMetadata) public bundleMetadata;
    mapping(uint256 => ListingMetadata) public auctionMetadata;

    // Marketplace contract address (can update metadata)
    address public marketplace;

    // V2.1.0: ERC-1155 asset metadata (must be at end for upgrade compatibility)
    mapping(uint256 => ListingMetadata) public assetMetadata;

    // V2.2.0: OVGAssets contract reference for token ownership verification
    address public assetsContract;

    // V2.3.0: Asset attributes mapping
    mapping(uint256 => AssetAttributes) public assetAttributes;

    uint256 public constant MAX_TITLE_LENGTH = 64;
    uint256 public constant MAX_DESCRIPTION_LENGTH = 160;
    uint256 public constant MAX_URL_LENGTH = 128;

    // ============ Events ============

    event ListingMetadataUpdated(uint256 indexed listingId, address indexed updater, string title);
    event BundleMetadataUpdated(uint256 indexed bundleId, address indexed updater, string title);
    event AuctionMetadataUpdated(uint256 indexed auctionId, address indexed updater, string title);
    event AssetMetadataUpdated(uint256 indexed assetId, address indexed updater, string title);  // V2.1.0
    event MarketplaceUpdated(address indexed oldMarketplace, address indexed newMarketplace);
    event AssetsContractUpdated(address indexed oldAssets, address indexed newAssets);  // V2.2.0

    // ============ Modifiers ============

    modifier onlyMarketplaceOrOwner() {
        require(msg.sender == marketplace || msg.sender == owner(), "Not authorized");
        _;
    }

    // ============ Initializer ============

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address initialOwner, address _marketplace) public initializer {
        __Ownable_init(initialOwner);
        __UUPSUpgradeable_init();
        marketplace = _marketplace;
    }

    // ============ Admin Functions ============

    function setMarketplace(address _marketplace) external onlyOwner {
        emit MarketplaceUpdated(marketplace, _marketplace);
        marketplace = _marketplace;
    }

    /**
     * @dev V2.2.0: Set OVGAssets contract for token ownership verification
     */
    function setAssetsContract(address _assets) external onlyOwner {
        emit AssetsContractUpdated(assetsContract, _assets);
        assetsContract = _assets;
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // ============ Listing Metadata ============

    function setListingMetadata(
        uint256 listingId,
        string calldata title,
        string calldata description,
        string calldata imageUrl,
        string calldata assetUrl
    ) external onlyMarketplaceOrOwner {
        _validateMetadata(title, description, imageUrl, assetUrl);

        listingMetadata[listingId] = ListingMetadata({
            title: title,
            description: description,
            imageUrl: imageUrl,
            assetUrl: assetUrl
        });

        emit ListingMetadataUpdated(listingId, msg.sender, title);
    }

    function getListingMetadata(uint256 listingId) external view returns (
        string memory title,
        string memory description,
        string memory imageUrl,
        string memory assetUrl
    ) {
        ListingMetadata memory meta = listingMetadata[listingId];
        return (meta.title, meta.description, meta.imageUrl, meta.assetUrl);
    }

    // ============ Bundle Metadata ============

    function setBundleMetadata(
        uint256 bundleId,
        string calldata title,
        string calldata description,
        string calldata imageUrl,
        string calldata assetUrl
    ) external onlyMarketplaceOrOwner {
        _validateMetadata(title, description, imageUrl, assetUrl);

        bundleMetadata[bundleId] = ListingMetadata({
            title: title,
            description: description,
            imageUrl: imageUrl,
            assetUrl: assetUrl
        });

        emit BundleMetadataUpdated(bundleId, msg.sender, title);
    }

    function getBundleMetadata(uint256 bundleId) external view returns (
        string memory title,
        string memory description,
        string memory imageUrl,
        string memory assetUrl
    ) {
        ListingMetadata memory meta = bundleMetadata[bundleId];
        return (meta.title, meta.description, meta.imageUrl, meta.assetUrl);
    }

    // ============ Auction Metadata ============

    function setAuctionMetadata(
        uint256 auctionId,
        string calldata title,
        string calldata description,
        string calldata imageUrl,
        string calldata assetUrl
    ) external onlyMarketplaceOrOwner {
        _validateMetadata(title, description, imageUrl, assetUrl);

        auctionMetadata[auctionId] = ListingMetadata({
            title: title,
            description: description,
            imageUrl: imageUrl,
            assetUrl: assetUrl
        });

        emit AuctionMetadataUpdated(auctionId, msg.sender, title);
    }

    function getAuctionMetadata(uint256 auctionId) external view returns (
        string memory title,
        string memory description,
        string memory imageUrl,
        string memory assetUrl
    ) {
        ListingMetadata memory meta = auctionMetadata[auctionId];
        return (meta.title, meta.description, meta.imageUrl, meta.assetUrl);
    }

    // ============ Asset Metadata (V2.1.0) ============

    /**
     * @dev Set metadata for an ERC-1155 asset (used by Polygonscan/OpenSea)
     * @param assetId The token ID of the asset
     */
    function setAssetMetadata(
        uint256 assetId,
        string calldata title,
        string calldata description,
        string calldata imageUrl,
        string calldata assetUrl
    ) external onlyMarketplaceOrOwner {
        _setAssetMetadata(assetId, title, description, imageUrl, assetUrl);
    }

    /**
     * @dev V2.2.0: Set metadata by token owner (requires assetsContract to be set)
     * Allows token holders to set metadata for their own tokens
     * @param assetId The token ID of the asset
     */
    function setAssetMetadataByTokenOwner(
        uint256 assetId,
        string calldata title,
        string calldata description,
        string calldata imageUrl,
        string calldata assetUrl
    ) external {
        require(assetsContract != address(0), "Assets contract not set");

        // Check if caller owns this token (ERC-1155 balanceOf)
        (bool success, bytes memory data) = assetsContract.staticcall(
            abi.encodeWithSignature("balanceOf(address,uint256)", msg.sender, assetId)
        );
        require(success, "Balance check failed");
        uint256 balance = abi.decode(data, (uint256));
        require(balance > 0, "Not token owner");

        _setAssetMetadata(assetId, title, description, imageUrl, assetUrl);
    }

    function _setAssetMetadata(
        uint256 assetId,
        string calldata title,
        string calldata description,
        string calldata imageUrl,
        string calldata assetUrl
    ) internal {
        _validateMetadata(title, description, imageUrl, assetUrl);

        assetMetadata[assetId] = ListingMetadata({
            title: title,
            description: description,
            imageUrl: imageUrl,
            assetUrl: assetUrl
        });

        emit AssetMetadataUpdated(assetId, msg.sender, title);
    }

    function getAssetMetadata(uint256 assetId) external view returns (
        string memory title,
        string memory description,
        string memory imageUrl,
        string memory assetUrl
    ) {
        ListingMetadata memory meta = assetMetadata[assetId];
        return (meta.title, meta.description, meta.imageUrl, meta.assetUrl);
    }

    // ============ Asset Attributes (V2.3.0) ============

    /**
     * @dev Set attributes for an asset (rarity, category, collection)
     */
    function setAssetAttributes(
        uint256 assetId,
        string calldata rarity,
        string calldata category,
        string calldata collection
    ) external onlyMarketplaceOrOwner {
        assetAttributes[assetId] = AssetAttributes({
            rarity: rarity,
            category: category,
            collection: collection
        });
    }

    /**
     * @dev Set attributes by token owner
     */
    function setAssetAttributesByTokenOwner(
        uint256 assetId,
        string calldata rarity,
        string calldata category,
        string calldata collection
    ) external {
        require(assetsContract != address(0), "Assets contract not set");
        (bool success, bytes memory data) = assetsContract.staticcall(
            abi.encodeWithSignature("balanceOf(address,uint256)", msg.sender, assetId)
        );
        require(success, "Balance check failed");
        require(abi.decode(data, (uint256)) > 0, "Not token owner");

        assetAttributes[assetId] = AssetAttributes({
            rarity: rarity,
            category: category,
            collection: collection
        });
    }

    /**
     * @dev Get attributes for an asset
     */
    function getAssetAttributes(uint256 assetId) external view returns (
        string memory rarity,
        string memory category,
        string memory collection
    ) {
        AssetAttributes memory attr = assetAttributes[assetId];
        return (attr.rarity, attr.category, attr.collection);
    }

    // ============ Full Metadata (V2.4.0) ============

    /**
     * @dev Full metadata struct combining ListingMetadata + AssetAttributes
     */
    struct FullMetadata {
        string title;
        string description;
        string imageUrl;
        string assetUrl;
        string rarity;
        string category;
        string collection;
    }

    /**
     * @dev Get full metadata for a single asset (metadata + attributes in one call)
     * @param assetId The token ID
     * @return Full metadata struct
     */
    function getFullMetadata(uint256 assetId) external view returns (FullMetadata memory) {
        ListingMetadata memory meta = assetMetadata[assetId];
        AssetAttributes memory attr = assetAttributes[assetId];
        return FullMetadata({
            title: meta.title,
            description: meta.description,
            imageUrl: meta.imageUrl,
            assetUrl: meta.assetUrl,
            rarity: attr.rarity,
            category: attr.category,
            collection: attr.collection
        });
    }

    /**
     * @dev Get full metadata for multiple assets in one call (batch)
     * @param assetIds Array of token IDs
     * @return Array of full metadata structs
     */
    function getFullMetadataBatch(uint256[] calldata assetIds) external view returns (FullMetadata[] memory) {
        FullMetadata[] memory results = new FullMetadata[](assetIds.length);
        for (uint256 i = 0; i < assetIds.length; i++) {
            ListingMetadata memory meta = assetMetadata[assetIds[i]];
            AssetAttributes memory attr = assetAttributes[assetIds[i]];
            results[i] = FullMetadata({
                title: meta.title,
                description: meta.description,
                imageUrl: meta.imageUrl,
                assetUrl: meta.assetUrl,
                rarity: attr.rarity,
                category: attr.category,
                collection: attr.collection
            });
        }
        return results;
    }

    /**
     * @dev Set full metadata for an asset (metadata + attributes in one call)
     * @param assetId The token ID
     * @param meta Full metadata struct
     */
    function setFullMetadata(uint256 assetId, FullMetadata calldata meta) external onlyMarketplaceOrOwner {
        _validateMetadata(meta.title, meta.description, meta.imageUrl, meta.assetUrl);
        _storeFullMetadata(assetId, meta);
        emit AssetMetadataUpdated(assetId, msg.sender, meta.title);
    }

    /**
     * @dev Set full metadata by token owner
     */
    function setFullMetadataByTokenOwner(uint256 assetId, FullMetadata calldata meta) external {
        require(assetsContract != address(0), "Assets contract not set");
        (bool success, bytes memory data) = assetsContract.staticcall(
            abi.encodeWithSignature("balanceOf(address,uint256)", msg.sender, assetId)
        );
        require(success, "Balance check failed");
        require(abi.decode(data, (uint256)) > 0, "Not token owner");

        _validateMetadata(meta.title, meta.description, meta.imageUrl, meta.assetUrl);
        _storeFullMetadata(assetId, meta);
        emit AssetMetadataUpdated(assetId, msg.sender, meta.title);
    }

    function _storeFullMetadata(uint256 assetId, FullMetadata calldata meta) internal {
        assetMetadata[assetId] = ListingMetadata({
            title: meta.title,
            description: meta.description,
            imageUrl: meta.imageUrl,
            assetUrl: meta.assetUrl
        });
        assetAttributes[assetId] = AssetAttributes({
            rarity: meta.rarity,
            category: meta.category,
            collection: meta.collection
        });
    }

    // ============ Internal ============

    function _validateMetadata(
        string calldata title,
        string calldata description,
        string calldata imageUrl,
        string calldata assetUrl
    ) internal pure {
        require(bytes(title).length <= MAX_TITLE_LENGTH, "Title too long");
        require(bytes(description).length <= MAX_DESCRIPTION_LENGTH, "Description too long");
        require(bytes(imageUrl).length <= MAX_URL_LENGTH, "Image URL too long");
        require(bytes(assetUrl).length <= MAX_URL_LENGTH, "Asset URL too long");
    }
}
