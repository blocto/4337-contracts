// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

// blast yield contract
IBlast constant BLAST = IBlast(0x4300000000000000000000000000000000000002);
// blast gas collector contract
address constant GAS_COLLECTOR = 0xadBd636A9fF51f2aB6999833AAB784f2C1Efa6F1;

interface IBlast {
    // see https://docs.blast.io/building/guides/gas-fees
    function configureAutomaticYield() external;
    function configureClaimableGas() external;
    function configureGovernor(address governor) external;
    function claimAllGas(address contractAddress, address recipient) external returns (uint256);
}
