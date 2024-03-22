// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.0.0
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import {BLAST} from "./BlastConstant.sol";

contract BlastGasCollector is AccessControl {
    /// @notice gas collector role for using claimGas()
    bytes32 public constant GAS_COLLECTOR_ROLE = keccak256("GAS_COLLECTOR_ROLE");

    /// @notice constructor setting owner and configure BLAST
    constructor(address _admin) {
        // contract balance will grow automatically
        BLAST.configureAutomaticYield();
        // let GAS_COLLECTOR collect gas
        BLAST.configureClaimableGas();
        // sender as default admin
        _setupRole(DEFAULT_ADMIN_ROLE, _admin);
    }

    /// @notice can claim gas including self gas
    /// @param target claim target
    /// @param recipientOfGas claimed gas recipientOfGas
    function claimGas(address target, address recipientOfGas) external {
        require(hasRole(GAS_COLLECTOR_ROLE, msg.sender), "caller is not gas collecotr role");
        BLAST.claimAllGas(target, recipientOfGas);
    }

    /// @notice can claim gas including self gas
    /// @param targetAry claim target
    /// @param recipientOfGas claimed gas recipientOfGas
    function claimGasBatch(address[] calldata targetAry, address recipientOfGas) external {
        require(hasRole(GAS_COLLECTOR_ROLE, msg.sender), "caller is not gas collecotr role");
        for (uint256 i = 0; i < targetAry.length; i++) {
            BLAST.claimAllGas(targetAry[i], recipientOfGas);
        }
    }

    /// @notice configures the governor for a specific contract. Called by an authorized user
    /// @param _newGovernor the address of new governor
    /// @param target the address of the contract to be configured
    function configureGovernorOnBehalf(address _newGovernor, address target) external {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "caller is not admin");
        BLAST.configureGovernorOnBehalf(_newGovernor, target);
    }

    /// @notice configures the governor for a specific contract. Called by an authorized user
    /// @param _newGovernor the address of new governor
    /// @param targetAry the address of the contract to be configured
    function configureGovernorOnBehalf(address _newGovernor, address[] calldata targetAry) external {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "caller is not admin");
        for (uint256 i = 0; i < targetAry.length; i++) {
            BLAST.configureGovernorOnBehalf(_newGovernor, targetAry[i]);
        }
    }

    /// @notice selfdestruct to transfer all funds to the owner
    function destruct() external {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "caller is not admin");
        selfdestruct(payable(msg.sender));
    }
}
