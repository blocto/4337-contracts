// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.12;

import "./BloctoAccount.sol";

/// @title BloctoAccountCloneableWallet Wallet
/// @notice This contract represents a complete but non working wallet.
contract BloctoAccountCloneableWallet is BloctoAccount {
    /// @dev constructor that deploys a NON-FUNCTIONAL version of `BloctoAccount`
    constructor(IEntryPoint anEntryPoint) BloctoAccount(anEntryPoint) {
        initialized = true;
    }
}