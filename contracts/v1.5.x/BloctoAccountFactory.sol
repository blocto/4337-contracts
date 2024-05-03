// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import "./BloctoAccountFactoryV1_5_2.sol";
import "./BloctoAccountFactoryV1_5_3.sol";
import "./BloctoAccountFactoryV1_5_4.sol";

// BloctoAccountFactory for creating BloctoAccountProxy
contract BloctoAccountFactory is BloctoAccountFactoryV1_5_2, BloctoAccountFactoryV1_5_3, BloctoAccountFactoryV1_5_4 {
    /// @notice this is the version of this contract.
    string public constant VERSION = "1.5.4";

    constructor(address _account_1_5_3, address _account_1_5_4)
        BloctoAccountFactoryV1_5_3(_account_1_5_3)
        BloctoAccountFactoryV1_5_4(_account_1_5_4)
    {}
}
