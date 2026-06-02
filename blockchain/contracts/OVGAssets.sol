// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Burnable.sol";
import "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";

/**
 * @title OVGAssets
 * @dev Digital assets for OVGrid Metaverse (Auditoriums, Tools, Land).
 * Uses ERC-1155 for efficiency and batch processing.
 * @author Esteban Fuster Pozzi (@estebanrfp)
 */
contract OVGAssets is ERC1155, AccessControl, ERC1155Burnable, ERC1155Supply {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant URI_SETTER_ROLE = keccak256("URI_SETTER_ROLE");
    bytes32 public constant CREATOR_ROLE = keccak256("CREATOR_ROLE");

    struct RoyaltyInfo {
        address creator;
        uint96 royaltyPercentage; // In basis points (e.g., 500 = 5%)
    }

    // Mapping for token names/types if needed for off-chain consistency
    mapping(uint256 => string) private _tokenNames;
    
    // Mapping for royalty information per asset type
    mapping(uint256 => RoyaltyInfo) public royalties;

    event RoyaltySet(uint256 indexed assetId, address indexed creator, uint96 percentage);
    event TokenRenamed(uint256 indexed tokenId, address indexed owner, string newName);

    constructor(address defaultAdmin, address minter) ERC1155("") {
        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
        _grantRole(MINTER_ROLE, minter);
        _grantRole(URI_SETTER_ROLE, defaultAdmin);
        _grantRole(CREATOR_ROLE, defaultAdmin);
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

    // Required overrides
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC1155, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    function _update(address from, address to, uint256[] memory ids, uint256[] memory values)
        internal
        override(ERC1155, ERC1155Supply)
    {
        super._update(from, to, ids, values);
    }
}
