// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.12;

/* solhint-disable avoid-low-level-calls */
/* solhint-disable no-inline-assembly */
/* solhint-disable reason-string */

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import "@account-abstraction/contracts/core/BaseAccount.sol";

import "../TokenCallbackHandler.sol";
import "../CoreWallet/CoreWallet.sol";

/**
 * Blocto account.
 *  compatibility for EIP-4337 and smart contract wallet with cosigner functionality (CoreWallet)
 */
contract TestBloctoAccountV2 is CoreWallet, UUPSUpgradeable, Initializable {
    /// @notice This is the version of this contract.
    string public constant VERSION = "1.3.1";

    // override from UUPSUpgradeable, to prevent upgrades from this method
    function _authorizeUpgrade(address newImplementation) internal pure override {
        (newImplementation);
        require(false, "BloctoAccount: cannot upgrade from _authorizeUpgrade");
    }
}
