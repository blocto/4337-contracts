// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.12;

/* solhint-disable avoid-low-level-calls */
/* solhint-disable no-inline-assembly */
/* solhint-disable reason-string */

import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import "@account-abstraction/contracts/core/BaseAccount.sol";

import "../TokenCallbackHandler.sol";
import "../CoreWallet/CoreWallet.sol";

/**
 * Blocto account.
 *  compatibility for EIP-4337 and smart contract wallet with cosigner functionality (CoreWallet)
 */
contract TestBloctoAccountV200 is UUPSUpgradeable, TokenCallbackHandler, CoreWallet, BaseAccount {
    /**
     *  This is the version of this contract.
     */
    string public constant VERSION = "2.0.0";

    IEntryPoint private immutable _entryPoint;

    constructor(IEntryPoint anEntryPoint) {
        _entryPoint = anEntryPoint;
    }

    /**
     * override from UUPSUpgradeable
     */
    function _authorizeUpgrade(address newImplementation) internal view override onlyInvoked {
        (newImplementation);
    }

    function entryPoint() public view virtual override returns (IEntryPoint) {
        return _entryPoint;
    }

    /**
     * execute a transaction (called directly by entryPoint)
     */
    function execute(address dest, uint256 value, bytes calldata func) external {
        _requireFromEntryPoint();
        _call(dest, value, func);
    }

    /**
     * execute a sequence of transactions (called directly by entryPoint)
     */
    function executeBatch(address[] calldata dest, bytes[] calldata func) external {
        _requireFromEntryPoint();
        require(dest.length == func.length, "wrong array lengths");
        for (uint256 i = 0; i < dest.length; i++) {
            _call(dest[i], 0, func[i]);
        }
    }

    /// internal call for execute and executeBatch
    function _call(address target, uint256 value, bytes memory data) internal {
        (bool success, bytes memory result) = target.call{value: value}(data);
        if (!success) {
            assembly {
                revert(add(result, 32), mload(result))
            }
        }
    }

    /// implement validate signature method of BaseAccount
    function _validateSignature(UserOperation calldata userOp, bytes32 userOpHash)
        internal
        virtual
        override
        returns (uint256 validationData)
    {
        bytes4 result = this.isValidSignature(userOpHash, userOp.signature);
        if (result != IERC1271.isValidSignature.selector) {
            return SIG_VALIDATION_FAILED;
        }

        return 0;
    }

    /**
     * check current account deposit in the entryPoint StakeManager
     */
    function getDeposit() public view returns (uint256) {
        return entryPoint().balanceOf(address(this));
    }

    /**
     * deposit more funds for this account in the entryPoint StakeManager
     */
    function addDeposit() public payable {
        entryPoint().depositTo{value: msg.value}(address(this));
    }

    /**
     * withdraw deposit to withdrawAddress from entryPoint StakeManager
     * @param withdrawAddress target to send to
     * @param amount to withdraw
     */
    function withdrawDepositTo(address payable withdrawAddress, uint256 amount) external onlyInvoked {
        entryPoint().withdrawTo(withdrawAddress, amount);
    }
}
