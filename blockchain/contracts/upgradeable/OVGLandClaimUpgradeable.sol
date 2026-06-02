// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

interface IOVGAssets {
    function mint(address account, uint256 id, uint256 amount, bytes memory data) external;
    function balanceOf(address account, uint256 id) external view returns (uint256);
}

/**
 * @title OVGLandClaimUpgradeable
 * @dev Allows users to claim land plots directly from the metaverse.
 * Land IDs are generated based on planetary coordinates. UUPS upgradeable.
 * @author Esteban Fuster Pozzi (@estebanrfp)
 */
contract OVGLandClaimUpgradeable is 
    Initializable,
    OwnableUpgradeable, 
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable 
{
    // ============ Storage Layout ============
    // IMPORTANT: Do NOT change the order of these variables in future versions.
    
    IOVGAssets public ovgAssets;
    
    // Land configuration
    uint256 public constant LAND_ID_OFFSET = 10000; // Land IDs start at 10000
    uint256 public claimFee; // Fee in native token (POL) - can be 0 for free claims
    
    // Track claimed lands
    mapping(uint256 => bool) public isClaimed;
    mapping(uint256 => address) public landOwner;
    
    // Stats
    uint256 public totalClaimed;

    // ============ Events ============
    event LandClaimed(address indexed claimer, uint256 indexed landId, int256 x, int256 z);
    event ClaimFeeUpdated(uint256 newFee);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @dev Initializes the contract replacing the constructor.
     * @param _ovgAssets Address of the OVG assets contract
     * @param _owner Address of the contract owner
     */
    function initialize(address _ovgAssets, address _owner) public initializer {
        __Ownable_init(_owner);
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        ovgAssets = IOVGAssets(_ovgAssets);
        claimFee = 0; // Free claims by default
    }

    /**
     * @dev Convert planetary coordinates to a unique land ID.
     * Each (x, z) pair maps to exactly one land ID (no grid quantization).
     * Coordinate encoding: x = face * 1000 + localX, z = localY
     * @param x X coordinate (range: 0–5122 for 6 faces × 123 grid)
     * @param z Z coordinate (range: 0–122)
     * @return landId The unique land ID for this plot
     */
    function coordsToLandId(int256 x, int256 z) public pure returns (uint256) {
        // Direct mapping — each (x,z) pair produces a unique land ID
        uint256 absX = uint256(x + 10000); // Shift to positive range
        uint256 absZ = uint256(z + 10000);

        return LAND_ID_OFFSET + (absX * 100000) + absZ;
    }

    /**
     * @dev Claim a land plot at the specified coordinates.
     * @param x X planetary coordinate
     * @param z Z planetary coordinate
     */
    function claimLand(int256 x, int256 z) external payable nonReentrant {
        require(msg.value >= claimFee, "Insufficient claim fee");
        
        uint256 landId = coordsToLandId(x, z);
        require(!isClaimed[landId], "Land already claimed");
        
        // Mark as claimed
        isClaimed[landId] = true;
        landOwner[landId] = msg.sender;
        totalClaimed++;
        
        // Mint the land NFT to the claimer
        ovgAssets.mint(msg.sender, landId, 1, "");
        
        emit LandClaimed(msg.sender, landId, x, z);
    }

    /**
     * @dev Check if land at coordinates is available
     */
    function isAvailable(int256 x, int256 z) external view returns (bool) {
        uint256 landId = coordsToLandId(x, z);
        return !isClaimed[landId];
    }

    /**
     * @dev Get the owner of land at coordinates
     */
    function getOwner(int256 x, int256 z) external view returns (address) {
        uint256 landId = coordsToLandId(x, z);
        return landOwner[landId];
    }

    /**
     * @dev Release (unclaim) a land plot. Callable by the land owner.
     * Does NOT burn the ERC-1155 token — caller must burn separately via OVGAssets.
     * @param x X planetary coordinate
     * @param z Z planetary coordinate
     */
    function releaseLand(int256 x, int256 z) external nonReentrant {
        uint256 landId = coordsToLandId(x, z);
        require(isClaimed[landId], "Land not claimed");
        require(landOwner[landId] == msg.sender, "Not land owner");

        isClaimed[landId] = false;
        landOwner[landId] = address(0);
        if (totalClaimed > 0) totalClaimed--;
    }

    /**
     * @dev Admin reset: unclaim a land plot (e.g. to fix orphaned claims after upgrade).
     * @param x X planetary coordinate
     * @param z Z planetary coordinate
     */
    function resetLand(int256 x, int256 z) external onlyOwner {
        uint256 landId = coordsToLandId(x, z);
        if (isClaimed[landId]) {
            isClaimed[landId] = false;
            landOwner[landId] = address(0);
            if (totalClaimed > 0) totalClaimed--;
        }
    }

    /**
     * @dev Admin reset by raw landId (for clearing orphans from old formula).
     * @param landId The raw land ID to reset
     */
    function resetLandById(uint256 landId) external onlyOwner {
        if (isClaimed[landId]) {
            isClaimed[landId] = false;
            landOwner[landId] = address(0);
            if (totalClaimed > 0) totalClaimed--;
        }
    }

    /**
     * @dev Update the claim fee (owner only)
     */
    function setClaimFee(uint256 _fee) external onlyOwner {
        claimFee = _fee;
        emit ClaimFeeUpdated(_fee);
    }

    /**
     * @dev Withdraw collected fees (owner only)
     */
    function withdraw() external onlyOwner {
        payable(owner()).transfer(address(this).balance);
    }

    /**
     * @dev Authorize upgrade. Only accessible by owner.
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    /**
     * @dev Returns the current implementation version.
     */
    function version() public pure virtual returns (string memory) {
        return "1.2.0";
    }
}
