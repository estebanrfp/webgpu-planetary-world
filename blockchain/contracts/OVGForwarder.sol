// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/metatx/ERC2771Forwarder.sol";

/**
 * @title OVGForwarder
 * @dev Trusted forwarder for gasless meta-transactions (ERC-2771).
 */
contract OVGForwarder is ERC2771Forwarder {
    constructor() ERC2771Forwarder("OVGrid Forwarder") {}
}
