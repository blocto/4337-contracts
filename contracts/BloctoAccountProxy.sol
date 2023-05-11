// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.12;

import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract BloctoAccountProxy is ERC1967Proxy, Initializable {
    constructor(address _logic) ERC1967Proxy(_logic, new bytes(0)) {}

    function initImplementation(address implementation) public initializer {
        require(Address.isContract(implementation), "ERC1967: new implementation is not a contract");
        StorageSlot.getAddressSlot(_IMPLEMENTATION_SLOT).value = implementation;
    }
}
