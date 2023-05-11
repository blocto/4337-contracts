// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.12;

import "./BloctoAccount4337.sol";

/// @title BloctoAccountCloneableWallet Wallet
/// @notice This contract represents a complete but non working wallet.
contract BloctoAccount4337CloneableWallet is BloctoAccount4337 {
    /// @dev An empty constructor that deploys a NON-FUNCTIONAL version
    ///  of `BloctoAccount`

    constructor(IEntryPoint anEntryPoint) BloctoAccount4337(anEntryPoint) {
        initialized = true;
    }
}
