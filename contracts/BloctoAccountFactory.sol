// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.12;

import "@openzeppelin/contracts/utils/Create2.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "./BloctoAccount.sol";

/**
 * A UserOperations "initCode" holds the address of the factory, and a method call (to createAccount, in this sample factory).
 * The factory's createAccount returns the target account address even if it is already installed.
 * This way, the entryPoint.getSenderAddress() can be called either before or after the account is created.
 */
contract BloctoAccountFactory is Initializable {
    /// @notice This is the version of this contract.
    string public constant VERSION = "1.3.0.0";
    // public generates a public getter, but not a setter. only set by internal function
    BloctoAccount public 
     accountImplementation;

    constructor(IEntryPoint _entryPoint) {
        accountImplementation = new BloctoAccount(_entryPoint);
    }

    // function initialize(
    //     IEntryPoint _entryPoint
    // ) public virtual initializer {
    //     accountImplementation = new BloctoAccount(_entryPoint);
    // }

    /**
     * create an account, and return its address.
     * returns the address even if the account is already deployed.
     * Note that during UserOperation execution, this method is called only if the account is not deployed.
     * This method returns an existing account address so that entryPoint.getSenderAddress() would work even after account creation
     */
    function createAccount(
        address _authorizedAddress,
        address _cosigner,
        address _recoveryAddress,
        uint256 salt
    ) public returns (BloctoAccount ret) {
        address addr = getAddress(
            _authorizedAddress,
            _cosigner,
            _recoveryAddress,
            salt
        );

        uint codeSize = addr.code.length;
        if (codeSize > 0) {
            return BloctoAccount(payable(addr));
        }
        ret = BloctoAccount(
            payable(
                new ERC1967Proxy{salt: bytes32(salt)}(
                    address(accountImplementation),
                    abi.encodeCall(
                        BloctoAccount.initialize,
                        (_authorizedAddress, _cosigner, _recoveryAddress)
                    )
                )
            )
        );
    }

    /**
     * calculate the counterfactual address of this account as it would be returned by createAccount()
     */
    function getAddress(
        address _authorizedAddress,
        address _cosigner,
        address _recoveryAddress,
        uint256 salt
    ) public view returns (address) {
        return
            Create2.computeAddress(
                bytes32(salt),
                keccak256(
                    abi.encodePacked(
                        type(ERC1967Proxy).creationCode,
                        abi.encode(
                            address(accountImplementation),
                            abi.encodeCall(
                                BloctoAccount.initialize,
                                (
                                    _authorizedAddress,
                                    _cosigner,
                                    _recoveryAddress
                                )
                            )
                        )
                    )
                )
            );
    }
}
