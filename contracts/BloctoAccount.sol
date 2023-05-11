// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.12;

/* solhint-disable avoid-low-level-calls */
/* solhint-disable no-inline-assembly */
/* solhint-disable reason-string */

import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import "./TokenCallbackHandler.sol";
import "./CoreWallet/CoreWallet.sol";
// for test
import "hardhat/console.sol";

/**
 * Blocto account.
 */
contract BloctoAccount is UUPSUpgradeable, TokenCallbackHandler, CoreWallet {
    /// @notice This is the version of this contract.
    string public constant VERSION = "1.3.0";

    //-----------------------------------------Method 1---------------------------------------------//
    function _authorizeUpgrade(address newImplementation) internal view override {
        (newImplementation);
        require(msg.sender == address(this), "BloctoAccount: only self");
    }

    //-----------------------------------------Method 2---------------------------------------------//
    // invoke cosigner check
    modifier onlyInvokeCosigner(
        uint8 v,
        bytes32 r,
        bytes32 s,
        uint256 nonce,
        address authorizedAddress,
        bytes memory data
    ) {
        // check signature version
        require(v == 27 || v == 28, "Invalid signature version.");

        // calculate hash
        bytes32 operationHash =
            keccak256(abi.encodePacked(EIP191_PREFIX, EIP191_VERSION_DATA, this, nonce, authorizedAddress, data));

        // recover signer
        address signer = ecrecover(operationHash, v, r, s);

        // check for valid signature
        require(signer != address(0), "Invalid signature.");

        // check nonce
        require(nonce > nonces[signer], "must use valid nonce for signer");

        // check signer
        require(signer == authorizedAddress, "authorized addresses must be equal");

        // Get cosigner
        address requiredCosigner = address(authorizations[authVersion + uint256(uint160(signer))]);

        // The operation should be approved if the signer address has no cosigner (i.e. signer == cosigner) or
        // if the actual cosigner matches the required cosigner.
        require(requiredCosigner == signer || requiredCosigner == msg.sender, "Invalid authorization.");

        // increment nonce to prevent replay attacks
        nonces[signer] = nonce;

        _;
    }

    // upgrade contract by msg.sender is cosigner and sign message (v, r, s) by authorizedAddress
    function invokeCosignerUpgrade(
        uint8 v,
        bytes32 r,
        bytes32 s,
        uint256 nonce,
        address authorizedAddress,
        address newImplementation
    ) external onlyInvokeCosigner(v, r, s, nonce, authorizedAddress, abi.encodePacked(newImplementation)) {
        _upgradeTo(newImplementation);
    }

    //-----------------------------------------Method 3---------------------------------------------//
    // modifier onlySelf() {
    //     require(msg.sender == address(this), "only self");
    //     _;
    // }

    // function upgradeTo(address newImplementation) external override onlyProxy onlySelf {
    //     _upgradeTo(newImplementation);
    // }
}
