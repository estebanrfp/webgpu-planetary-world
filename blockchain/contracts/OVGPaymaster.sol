// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title OVGPaymaster
 * @dev A sponsorship contract that manages gas funds for OVGrid users.
 * Implements a rate limit of 3 transactions per user per day.
 * Gas fees are paid in POL (native token on Polygon).
 * @author Esteban Fuster Pozzi (@estebanrfp)
 */
contract OVGPaymaster is Ownable {
    // Limits
    uint256 public constant MAX_DAILY_TX = 3;
    uint256 public constant RESET_PERIOD = 1 days;

    // Tracking
    mapping(address => uint256) public txCount;
    mapping(address => uint256) public lastReset;

    // Events
    event GasSponsored(address indexed user, uint256 count);

    constructor(address initialOwner) Ownable(initialOwner) {}

    /**
     * @dev Check if a user is eligible for gasless transaction.
     * This follows the GSN/Paymaster interface logic.
     */
    function isEligible(address user) public view returns (bool) {
        uint256 currentCount = txCount[user];
        if (block.timestamp >= lastReset[user] + RESET_PERIOD) {
            return true; // Cycle finished, can reset
        }
        return currentCount < MAX_DAILY_TX;
    }

    /**
     * @dev Record a sponsored transaction. 
     * To be called by the trusted forwarder or relay system.
     */
    function recordTransaction(address user) external {
        // In a real GSN implementation, this would be part of 'preRelayedCall'
        if (block.timestamp >= lastReset[user] + RESET_PERIOD) {
            lastReset[user] = block.timestamp;
            txCount[user] = 1;
        } else {
            require(txCount[user] < MAX_DAILY_TX, "Daily limit reached");
            txCount[user] += 1;
        }
        emit GasSponsored(user, txCount[user]);
    }

    /**
     * @dev Deposit POL into the paymaster.
     */
    receive() external payable {}

    /**
     * @dev Withdraw POL from the paymaster (Owner only).
     */
    function withdraw(uint256 amount) external onlyOwner {
        payable(owner()).transfer(amount);
    }
}
