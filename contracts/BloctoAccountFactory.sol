// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.12;

import "@openzeppelin/contracts/utils/Create2.sol";
// import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import "./BloctoAccountProxy.sol";
import "./BloctoAccount.sol";

// BloctoAccountFactory for creating BloctoAccountProxy
contract BloctoAccountFactory is Ownable {
    /// @notice This is the version of this contract.
    string public constant VERSION = "1.3.0";
    // address public accountImplementation;
    address public bloctoAccountImplementation;
    IEntryPoint public entryPoint;

    event WalletCreated(address wallet, address authorizedAddress, bool full);

    constructor(address _bloctoAccountImplementation, IEntryPoint _entryPoint) {
        bloctoAccountImplementation = _bloctoAccountImplementation;
        entryPoint = _entryPoint;
    }

    /**
     * create an account, and return its BloctoAccount.
     * returns the address even if the account is already deployed.
     * Note that during UserOperation execution, this method is called only if the account is not deployed.
     * This method returns an existing account address so that entryPoint.getSenderAddress() would work even after account creation
     */
    function createAccount(address _authorizedAddress, address _cosigner, address _recoveryAddress, uint256 _salt)
        public
        returns (BloctoAccount ret)
    {
        address addr = getAddress(_cosigner, _recoveryAddress, _salt);
        uint256 codeSize = addr.code.length;
        if (codeSize > 0) {
            return BloctoAccount(payable(addr));
        }
        bytes32 salt = keccak256(abi.encodePacked(_salt, _cosigner, _recoveryAddress));
        // for consistent address
        BloctoAccountProxy newProxy = new BloctoAccountProxy{salt: salt}(address(this));
        newProxy.initImplementation(bloctoAccountImplementation);
        ret = BloctoAccount(payable(address(newProxy)));
        ret.init(_authorizedAddress, uint256(uint160(_cosigner)), _recoveryAddress);
        emit WalletCreated(address(ret), _authorizedAddress, false);
    }

    /**
     * calculate the counterfactual address of this account as it would be returned by createAccount()
     */
    function getAddress(address _cosigner, address _recoveryAddress, uint256 _salt) public view returns (address) {
        bytes32 salt = keccak256(abi.encodePacked(_salt, _cosigner, _recoveryAddress));
        return Create2.computeAddress(
            bytes32(salt), keccak256(abi.encodePacked(type(BloctoAccountProxy).creationCode, abi.encode(address(this))))
        );
    }

    function setImplementation(address _bloctoAccountImplementation) public onlyOwner {
        bloctoAccountImplementation = _bloctoAccountImplementation;
    }

    function setEntrypoint(IEntryPoint _entrypoint) public onlyOwner {
        entryPoint = _entrypoint;
    }

    /**
     * withdraw value from the deposit
     * @param withdrawAddress target to send to
     * @param amount to withdraw
     */
    function withdrawTo(address payable withdrawAddress, uint256 amount) public onlyOwner {
        entryPoint.withdrawTo(withdrawAddress, amount);
    }

    /**
     * add stake for this factory.
     * This method can also carry eth value to add to the current stake.
     * @param unstakeDelaySec - the unstake delay for this factory. Can only be increased.
     */
    function addStake(uint32 unstakeDelaySec) external payable onlyOwner {
        entryPoint.addStake{value: msg.value}(unstakeDelaySec);
    }
}
