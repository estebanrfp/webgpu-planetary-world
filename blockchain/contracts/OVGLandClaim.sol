// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IOVGAssets {
    function mint(address account, uint256 id, uint256 amount, bytes memory data) external;
    function balanceOf(address account, uint256 id) external view returns (uint256);
}

/**
 * @title OVGLandClaim
 * @dev Allows users to claim land plots directly from the metaverse.
 * Land IDs are generated based on planetary coordinates.
 * @author Esteban Fuster Pozzi (@estebanrfp)
 */
contract OVGLandClaim is Ownable, ReentrancyGuard {
    IOVGAssets public immutable ovgAssets;
    
    // Land configuration
    uint256 public constant LAND_ID_OFFSET = 10000; // Land IDs start at 10000
    uint256 public claimFee; // Fee in native token (POL) - can be 0 for free claims
    
    // Track claimed lands
    mapping(uint256 => bool) public isClaimed;
    mapping(uint256 => address) public landOwner;
    
    // Stats
    uint256 public totalClaimed;
    
    event LandClaimed(address indexed claimer, uint256 indexed landId, int256 x, int256 z);
    event ClaimFeeUpdated(uint256 newFee);

    constructor(address _ovgAssets, address _owner) Ownable(_owner) {
        ovgAssets = IOVGAssets(_ovgAssets);
        claimFee = 0; // Free claims by default
    }

    /**
     * @dev Convert planetary coordinates to a unique land ID.
     * Uses a simple hash of x,z coordinates divided by grid size.
     * @param x X coordinate (can be negative)
     * @param z Z coordinate (can be negative)
     * @return landId The unique land ID for this plot
     */
    function coordsToLandId(int256 x, int256 z) public pure returns (uint256) {
        // Grid size of 1000 units per land plot
        int256 gridX = x / 1000;
        int256 gridZ = z / 1000;
        
        // Create unique ID from coordinates (shift to positive range)
        // Max planet radius ~6400km = ~6,400,000 units = 6400 grid cells per axis
        uint256 absX = uint256(gridX + 10000); // Shift to positive
        uint256 absZ = uint256(gridZ + 10000);
        
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
}
