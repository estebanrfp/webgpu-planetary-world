// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/metatx/ERC2771Context.sol";

/**
 * @title OVGToken
 * @dev Economic token for OVGrid Metaverse.
 * Includes governance roles, gasless approvals (EIP-2612), burning capabilities,
 * and meta-transaction support (ERC-2771).
 * @author Esteban Fuster Pozzi (@estebanrfp)
 */
contract OVGToken is ERC20, ERC20Burnable, ERC20Permit, AccessControl, ERC2771Context {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    constructor(address defaultAdmin, address minter, address trustedForwarder)
        ERC20("OVGrid Token", "OVG")
        ERC20Permit("OVGrid Token")
        ERC2771Context(trustedForwarder)
    {
        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
        _grantRole(MINTER_ROLE, minter);
        
        // Mint initial supply of 21,000,000 OVG to the minter (deployer)
        _mint(minter, 21_000_000 * 10 ** decimals());
    }

    /**
     * @dev Override _msgSender to support ERC2771 meta-transactions.
     */
    function _msgSender() internal view override(Context, ERC2771Context) returns (address) {
        return ERC2771Context._msgSender();
    }

    /**
     * @dev Override _msgData to support ERC2771 meta-transactions.
     */
    function _msgData() internal view override(Context, ERC2771Context) returns (bytes calldata) {
        return ERC2771Context._msgData();
    }

    /**
     * @dev Override _contextSuffixLength to support ERC2771 meta-transactions.
     */
    function _contextSuffixLength() internal view override(Context, ERC2771Context) returns (uint256) {
        return ERC2771Context._contextSuffixLength();
    }

    /**
     * @dev Mint new tokens. Only accessible by accounts with MINTER_ROLE.
     * @param to Address to receive the tokens.
     * @param amount Amount to mint.
     */
    function mint(address to, uint256 amount) public onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }
}
