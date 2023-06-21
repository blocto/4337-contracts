// SPDX-License-Identifier: GPL-3.0
// from: https://github.com/eth-infinitism/account-abstraction/tree/develop/contracts/test
pragma solidity ^0.8.12;

import "@account-abstraction/contracts/interfaces/UserOperation.sol";

contract TestUtil {
    using UserOperationLib for UserOperation;

    function packUserOp(UserOperation calldata op) external pure returns (bytes memory){
        return op.pack();
    }

}
