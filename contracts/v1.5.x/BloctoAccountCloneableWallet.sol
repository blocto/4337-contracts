// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import "./BloctoAccount.sol";

/// @title BloctoAccountCloneableWallet Wallet
/// @notice This contract represents a complete but non working wallet.
contract BloctoAccountCloneableWallet is BloctoAccount {
    /// @notice  constructor that deploys a NON-FUNCTIONAL version of `BloctoAccount`
    /// @param anEntryPoint entrypoint address
    /// @param blastPointsAddr blast points contract address
    constructor(IEntryPoint anEntryPoint, address blastPointsAddr) BloctoAccount(anEntryPoint, blastPointsAddr) {
        initialized = true;
        initializedImplementation = true;
    }
}
