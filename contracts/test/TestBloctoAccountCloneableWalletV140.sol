// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.12;

import "./TestBloctoAccountV140.sol";

/// @title BloctoAccountCloneableWallet Wallet
/// @notice This contract represents a complete but non working wallet.
contract TestBloctoAccountCloneableWalletV140 is TestBloctoAccountV140 {
    /// @dev Cconstructor that deploys a NON-FUNCTIONAL version of `TestBloctoAccountV140`
    constructor(IEntryPoint anEntryPoint) TestBloctoAccountV140(anEntryPoint) {
        initialized = true;
    }
}
