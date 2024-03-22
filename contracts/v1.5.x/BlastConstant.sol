// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

// blast yield contract
IBlast constant BLAST = IBlast(0x4300000000000000000000000000000000000002);
// BlastGasCollector contract using Create3Factory to generate constant contract address
address constant GAS_COLLECTOR = 0xBd9D6d96b21d679983Af4ed6182Fd9fff0031eA4;

interface IBlast {
    // see https://docs.blast.io/building/guides/gas-fees
    function configureAutomaticYield() external;
    function configureClaimableGas() external;
    function configureGovernor(address governor) external;
    function configureGovernorOnBehalf(address _newGovernor, address contractAddress) external;
    function claimAllGas(address contractAddress, address recipient) external returns (uint256);
}

interface IBlastPoints {
    function configurePointsOperator(address operator) external;
}
