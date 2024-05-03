// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";

contract ModuleManager is Ownable {
    mapping(address => bool) private verifiedModules;

    /// @dev event to log address addition
    event ModuleAdded(address moduleAddress);

    /// @dev Event to log address removal
    event ModuleRemoved(address moduleAddress);

    /// @notice constructor setting owner
    /// @param admin owner of the contract
    constructor(address admin) {
        transferOwnership(admin);
    }

    /// @dev Function to add an address to the map
    /// @param moduleAddress add address to verifiedModules
    function addModule(address moduleAddress) external onlyOwner {
        require(!verifiedModules[moduleAddress], "address already exists");
        verifiedModules[moduleAddress] = true;
        emit ModuleAdded(moduleAddress);
    }

    /// @dev Function to remove an address from the map
    /// @param moduleAddress address to remove from verifiedModules
    function removeModule(address moduleAddress) external onlyOwner {
        require(verifiedModules[moduleAddress], "address does not exist");
        verifiedModules[moduleAddress] = false;
        emit ModuleRemoved(moduleAddress);
    }

    /// @dev Function to check if an address exists in the map
    /// @param moduleAddress check address in verifiedModules
    function isVerified(address moduleAddress) external view returns (bool) {
        return verifiedModules[moduleAddress];
    }
}
