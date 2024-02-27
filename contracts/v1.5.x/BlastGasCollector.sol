// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.0.0
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import {BLAST, GAS_COLLECTOR} from "./BlastConstant.sol";

contract BlastGasCollector is Ownable {
    /// @notice constructor setting owner and configure BLAST
    constructor() Ownable() {
        // contract balance will grow automatically
        BLAST.configureAutomaticYield();
        // let GAS_COLLECTOR collect gas
        BLAST.configureClaimableGas();
    }

    /// @notice can claim gas including self
    /// @param target claim target
    /// @param receiver claimed gas receiver
    function claimGas(address target, address receiver) onlyOwner external {
        BLAST.claimAllGas(target, receiver);
    }
}
