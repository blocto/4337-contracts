// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import "./TestBloctoAccountV200.sol";

/// @title BloctoAccountCloneableWallet Wallet
/// @notice This contract represents a complete but non working wallet.
contract TestBloctoAccountCloneableWalletV200 is TestBloctoAccountV200 {
    /// @dev Cconstructor that deploys a NON-FUNCTIONAL version of `TestBloctoAccountV140`
    constructor(IEntryPoint anEntryPoint) TestBloctoAccountV200(anEntryPoint) {
        initialized = true;
    }
}
