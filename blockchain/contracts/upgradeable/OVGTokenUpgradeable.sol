// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20BurnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PermitUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title OVGTokenUpgradeable
 * @dev Economic token for OVGrid Metaverse (Upgradeable version).
 * Includes governance roles, gasless approvals (EIP-2612), burning capabilities,
 * and UUPS upgradeability.
 * 
 * Note: Meta-transaction support (ERC-2771) is handled separately via the forwarder
 * contract to maintain full upgradeability of this token contract.
 * 
 * @author Esteban Fuster Pozzi (@estebanrfp)
 */
contract OVGTokenUpgradeable is 
    Initializable,
    ERC20Upgradeable, 
    ERC20BurnableUpgradeable, 
    ERC20PermitUpgradeable, 
    AccessControlUpgradeable,
    UUPSUpgradeable 
{
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    // Storage for trusted forwarder (upgradeable pattern)
    address private _trustedForwarder;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @dev Initializes the contract replacing the constructor.
     * @param defaultAdmin Address to receive DEFAULT_ADMIN_ROLE
     * @param minter Address to receive MINTER_ROLE and initial supply
     * @param trustedForwarder_ Address of the trusted forwarder for meta-transactions
     */
    function initialize(
        address defaultAdmin, 
        address minter, 
        address trustedForwarder_
    ) public initializer {
        __ERC20_init("OVGrid Token", "OVG");
        __ERC20Burnable_init();
        __ERC20Permit_init("OVGrid Token");
        __AccessControl_init();
        __UUPSUpgradeable_init();

        _trustedForwarder = trustedForwarder_;

        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
        _grantRole(MINTER_ROLE, minter);
        _grantRole(UPGRADER_ROLE, defaultAdmin);
        
        // Mint initial supply of 21,000,000 OVG to the minter
        _mint(minter, 21_000_000 * 10 ** decimals());
    }

    /**
     * @dev Returns the trusted forwarder address.
     */
    function trustedForwarder() public view returns (address) {
        return _trustedForwarder;
    }

    /**
     * @dev Returns true if the address is the trusted forwarder.
     */
    function isTrustedForwarder(address forwarder) public view returns (bool) {
        return forwarder == _trustedForwarder;
    }

    /**
     * @dev Override _msgSender to support ERC2771 meta-transactions.
     */
    function _msgSender() internal view override returns (address sender) {
        if (isTrustedForwarder(msg.sender) && msg.data.length >= 20) {
            // The assembly code is more direct than the abi.decode
            assembly {
                sender := shr(96, calldataload(sub(calldatasize(), 20)))
            }
        } else {
            return super._msgSender();
        }
    }

    /**
     * @dev Override _msgData to support ERC2771 meta-transactions.
     */
    function _msgData() internal view override returns (bytes calldata) {
        if (isTrustedForwarder(msg.sender) && msg.data.length >= 20) {
            return msg.data[:msg.data.length - 20];
        } else {
            return super._msgData();
        }
    }

    /**
     * @dev Mint new tokens. Only accessible by accounts with MINTER_ROLE.
     * @param to Address to receive the tokens.
     * @param amount Amount to mint.
     */
    function mint(address to, uint256 amount) public onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }

    /**
     * @dev Update the trusted forwarder. Only admin can call this.
     * @param newForwarder The new trusted forwarder address.
     */
    function setTrustedForwarder(address newForwarder) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _trustedForwarder = newForwarder;
    }

    /**
     * @dev Authorize upgrade. Only accessible by accounts with UPGRADER_ROLE.
     * @param newImplementation Address of the new implementation contract.
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) {}

    /**
     * @dev Returns the current implementation version.
     */
    function version() public pure virtual returns (string memory) {
        return "1.0.0";
    }
}
