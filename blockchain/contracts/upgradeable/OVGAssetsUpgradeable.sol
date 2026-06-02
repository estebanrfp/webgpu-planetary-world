// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/extensions/ERC1155BurnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/extensions/ERC1155SupplyUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/utils/Base64.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @dev Interface for OVGMetadata contract
 */
interface IOVGMetadata {
    function getAssetMetadata(uint256 assetId) external view returns (
        string memory title,
        string memory description,
        string memory imageUrl,
        string memory assetUrl
    );
    function getAssetAttributes(uint256 assetId) external view returns (
        string memory rarity,
        string memory category,
        string memory collection
    );
}

/**
 * @title OVGAssetsUpgradeable
 * @dev Digital assets for OVGrid Metaverse (Auditoriums, Tools, Land).
 * Uses ERC-1155 for efficiency and batch processing. UUPS upgradeable.
 * @author Esteban Fuster Pozzi (@estebanrfp)
 */
contract OVGAssetsUpgradeable is 
    Initializable,
    ERC1155Upgradeable, 
    AccessControlUpgradeable, 
    ERC1155BurnableUpgradeable, 
    ERC1155SupplyUpgradeable,
    UUPSUpgradeable 
{
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant URI_SETTER_ROLE = keccak256("URI_SETTER_ROLE");
    bytes32 public constant CREATOR_ROLE = keccak256("CREATOR_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    struct RoyaltyInfo {
        address creator;
        uint96 royaltyPercentage; // In basis points (e.g., 500 = 5%)
    }

    // Mapping for token names/types if needed for off-chain consistency
    mapping(uint256 => string) private _tokenNames;

    // Mapping for royalty information per asset type
    mapping(uint256 => RoyaltyInfo) public royalties;

    // V2.1.0: Metadata contract address for dynamic uri()
    address public metadataContract;

    // V2.2.0: Direct token metadata URLs (IPFS/HTTP) for Polygonscan compatibility
    mapping(uint256 => string) private _tokenMetadataUrls;

    // V2.5.0: Contract-level metadata URI for OpenSea collection info
    string private _contractURI;

    event RoyaltySet(uint256 indexed assetId, address indexed creator, uint96 percentage);
    event TokenRenamed(uint256 indexed tokenId, address indexed owner, string newName);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @dev Initializes the contract replacing the constructor.
     * @param defaultAdmin Address to receive admin roles
     * @param minter Address to receive MINTER_ROLE
     */
    function initialize(address defaultAdmin, address minter) public initializer {
        __ERC1155_init("");
        __AccessControl_init();
        __ERC1155Burnable_init();
        __ERC1155Supply_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
        _grantRole(MINTER_ROLE, minter);
        _grantRole(URI_SETTER_ROLE, defaultAdmin);
        _grantRole(CREATOR_ROLE, defaultAdmin);
        _grantRole(UPGRADER_ROLE, defaultAdmin);
    }
    
    /**
     * @dev Get royalty info for an asset. 
     * Returns (creator, amount) for a given sale price.
     */
    function getRoyaltyInfo(uint256 assetId, uint256 salePrice) external view returns (address, uint256) {
        RoyaltyInfo memory info = royalties[assetId];
        if (info.creator == address(0)) return (address(0), 0);
        
        uint256 royaltyAmount = (salePrice * info.royaltyPercentage) / 10000;
        return (info.creator, royaltyAmount);
    }

    /**
     * @dev Set royalty info for an asset. 
     * Can be set by minter, admin or creator.
     */
    function setRoyalty(uint256 assetId, address creator, uint96 percentage) public {
        require(
            hasRole(DEFAULT_ADMIN_ROLE, msg.sender) || 
            hasRole(MINTER_ROLE, msg.sender) || 
            hasRole(CREATOR_ROLE, msg.sender), 
            "Caller is not authorized"
        );
        require(percentage <= 2500, "Royalty too high (max 25%)");
        royalties[assetId] = RoyaltyInfo(creator, percentage);
        emit RoyaltySet(assetId, creator, percentage);
    }

    /**
     * @dev Set a custom name for a token. Only the owner can rename their tokens.
     * @param tokenId The token ID to rename
     * @param newName The new name (max 32 characters)
     */
    function setTokenName(uint256 tokenId, string calldata newName) external {
        require(balanceOf(msg.sender, tokenId) > 0, "Not owner of token");
        require(bytes(newName).length <= 32, "Name too long (max 32 chars)");
        _tokenNames[tokenId] = newName;
        emit TokenRenamed(tokenId, msg.sender, newName);
    }

    /**
     * @dev Get the custom name for a token.
     * @param tokenId The token ID
     * @return The custom name (empty string if not set)
     */
    function getTokenName(uint256 tokenId) external view returns (string memory) {
        return _tokenNames[tokenId];
    }

    /**
     * @dev Set the global URI.
     */
    function setURI(string memory newuri) public onlyRole(URI_SETTER_ROLE) {
        _setURI(newuri);
    }

    /**
     * @dev V2.1.0: Set the metadata contract address
     */
    function setMetadataContract(address _metadataContract) external onlyRole(DEFAULT_ADMIN_ROLE) {
        metadataContract = _metadataContract;
    }

    /**
     * @dev V2.1.0: Emit URI event to notify explorers that metadata has changed
     * This forces Polygonscan/OpenSea to refresh the token metadata
     * @param tokenId The token ID whose metadata was updated
     */
    function emitMetadataUpdate(uint256 tokenId) external onlyRole(URI_SETTER_ROLE) {
        emit URI(uri(tokenId), tokenId);
    }

    /**
     * @dev V2.1.0: Batch emit URI events for multiple tokens
     * @param tokenIds Array of token IDs to update
     */
    function emitMetadataUpdateBatch(uint256[] calldata tokenIds) external onlyRole(URI_SETTER_ROLE) {
        for (uint256 i = 0; i < tokenIds.length; i++) {
            emit URI(uri(tokenIds[i]), tokenIds[i]);
        }
    }

    /**
     * @dev V2.2.0: Set a direct metadata URL for a token (IPFS/HTTP)
     * This URL must point to a JSON file with name, description, image fields
     * @param tokenId The token ID
     * @param metadataUrl The URL (ipfs://... or https://...)
     */
    function setTokenMetadataUrl(uint256 tokenId, string calldata metadataUrl) external onlyRole(URI_SETTER_ROLE) {
        _tokenMetadataUrls[tokenId] = metadataUrl;
        emit URI(metadataUrl, tokenId);
    }

    /**
     * @dev V2.2.0: Get the direct metadata URL for a token
     * @param tokenId The token ID
     * @return The metadata URL (empty if not set)
     */
    function getTokenMetadataUrl(uint256 tokenId) external view returns (string memory) {
        return _tokenMetadataUrls[tokenId];
    }

    /**
     * @dev V2.5.0: Get contract-level metadata URI for OpenSea
     * Returns collection info (name, description, image, external_link)
     * @return The contract metadata URI
     */
    function contractURI() public view returns (string memory) {
        return _contractURI;
    }

    /**
     * @dev V2.5.0: Set contract-level metadata URI
     * @param newContractURI The URI pointing to collection metadata JSON
     */
    function setContractURI(string memory newContractURI) external onlyRole(URI_SETTER_ROLE) {
        _contractURI = newContractURI;
    }

    /**
     * @dev V2.4.0: Override uri() - OpenSea compatible
     * - No empty animation_url (OpenSea rejects it)
     * - No non-standard token_id field
     * - Always valid JSON attributes array
     * Priority: 1) Direct URL, 2) OVGMetadata base64, 3) Default URI
     */
    function uri(uint256 tokenId) public view override returns (string memory) {
        // Priority 1: Direct URL if set (for Polygonscan compatibility)
        if (bytes(_tokenMetadataUrls[tokenId]).length > 0) {
            return _tokenMetadataUrls[tokenId];
        }

        if (metadataContract == address(0)) {
            return super.uri(tokenId);
        }

        (
            string memory title,
            string memory description,
            string memory imageUrl,
            string memory assetUrl
        ) = IOVGMetadata(metadataContract).getAssetMetadata(tokenId);

        // If no metadata or no image, return default (OpenSea requires image)
        if (bytes(title).length == 0 || bytes(imageUrl).length == 0) {
            return super.uri(tokenId);
        }

        // Get attributes
        (
            string memory rarity,
            string memory category,
            string memory collection
        ) = IOVGMetadata(metadataContract).getAssetAttributes(tokenId);

        string memory attributes = _buildAttributes(rarity, category, collection);

        // Build JSON - only include animation_url if not empty
        string memory json;
        if (bytes(assetUrl).length > 0) {
            json = string(abi.encodePacked(
                '{"name":"', title,
                '","description":"', description,
                '","image":"', imageUrl,
                '","animation_url":"', assetUrl,
                '","attributes":', attributes, '}'
            ));
        } else {
            json = string(abi.encodePacked(
                '{"name":"', title,
                '","description":"', description,
                '","image":"', imageUrl,
                '","attributes":', attributes, '}'
            ));
        }

        // Return as base64 data URI
        return string(abi.encodePacked(
            "data:application/json;base64,",
            Base64.encode(bytes(json))
        ));
    }

    /**
     * @dev Build attributes JSON array - ALWAYS returns valid JSON array
     */
    function _buildAttributes(
        string memory rarity,
        string memory category,
        string memory collection
    ) internal pure returns (string memory) {
        string memory result = "[";
        bool hasAttr = false;

        if (bytes(rarity).length > 0) {
            result = string(abi.encodePacked(
                result,
                '{"trait_type":"Rarity","value":"', rarity, '"}'
            ));
            hasAttr = true;
        }

        if (bytes(category).length > 0) {
            if (hasAttr) result = string(abi.encodePacked(result, ","));
            result = string(abi.encodePacked(
                result,
                '{"trait_type":"Category","value":"', category, '"}'
            ));
            hasAttr = true;
        }

        if (bytes(collection).length > 0) {
            if (hasAttr) result = string(abi.encodePacked(result, ","));
            result = string(abi.encodePacked(
                result,
                '{"trait_type":"Collection","value":"', collection, '"}'
            ));
        }

        // ALWAYS return valid JSON array
        return string(abi.encodePacked(result, "]"));
    }

    /**
     * @dev Mint assets. Each ID can represent a different type (Auditorium, Land, tool).
     */
    function mint(address account, uint256 id, uint256 amount, bytes memory data)
        public
        onlyRole(MINTER_ROLE)
    {
        _mint(account, id, amount, data);
    }

    /**
     * @dev Batch mint assets for optimization.
     */
    function mintBatch(address to, uint256[] memory ids, uint256[] memory amounts, bytes memory data)
        public
        onlyRole(MINTER_ROLE)
    {
        _mintBatch(to, ids, amounts, data);
    }

    /**
     * @dev Authorize upgrade. Only accessible by accounts with UPGRADER_ROLE.
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) {}

    /**
     * @dev Returns the current implementation version.
     */
    function version() public pure virtual returns (string memory) {
        return "2.5.0";
    }

    // Required overrides
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC1155Upgradeable, AccessControlUpgradeable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    function _update(address from, address to, uint256[] memory ids, uint256[] memory values)
        internal
        override(ERC1155Upgradeable, ERC1155SupplyUpgradeable)
    {
        super._update(from, to, ids, values);
    }
}
