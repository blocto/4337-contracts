// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import "./BloctoAccountV140.sol";

/// @title BloctoAccountCloneableWallet Wallet
/// @notice This contract represents a complete but non working wallet.
contract BloctoAccountCloneableWalletV140 is BloctoAccountV140 {
    /// @notice  constructor that deploys a NON-FUNCTIONAL version of `BloctoAccount`
    /// @param anEntryPoint entrypoint address
    constructor(IEntryPoint anEntryPoint) BloctoAccountV140(anEntryPoint) {
        initialized = true;
        initializedImplementation = true;
    }
}
