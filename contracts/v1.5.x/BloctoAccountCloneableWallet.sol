// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.17;

import "./BloctoAccount.sol";
import "./BlastConstant.sol";
import {BLAST, GAS_COLLECTOR} from "./BlastConstant.sol";

/// @title BloctoAccountCloneableWallet Wallet
/// @notice This contract represents a complete but non working wallet.
contract BloctoAccountCloneableWallet is BloctoAccount {
    /// @notice  constructor that deploys a NON-FUNCTIONAL version of `BloctoAccount`
    /// @param anEntryPoint entrypoint address
    constructor(IEntryPoint anEntryPoint) BloctoAccount(anEntryPoint) {
        initialized = true;
        initializedImplementation = true;
    }

    /// @notice same as CoreWallet's `init` function, but add yield and gas collector function for Blast
    /// @param _authorizedAddress the initial authorized address, must not be zero!
    /// @param _cosigner the initial cosigning address for `_authorizedAddress`, can be equal to `_authorizedAddress`
    /// @param _recoveryAddress the initial recovery address for the wallet, can be address(0)
    /// @param _mergedKeyIndexWithParity the corresponding index of mergedKeys = authVersion + _mergedIndex
    /// @param _mergedKey the corresponding mergedKey (using Schnorr merged key)
    function init(
        address _authorizedAddress,
        uint256 _cosigner,
        address _recoveryAddress,
        uint8 _mergedKeyIndexWithParity,
        bytes32 _mergedKey
    ) public override onlyOnce {
        super.init(_authorizedAddress, _cosigner, _recoveryAddress, _mergedKeyIndexWithParity, _mergedKey);
        // contract balance will grow automatically
        BLAST.configureAutomaticYield();
        // let GAS_COLLECTOR collect gas
        BLAST.configureClaimableGas();
        BLAST.configureGovernor(GAS_COLLECTOR);
    }
}
