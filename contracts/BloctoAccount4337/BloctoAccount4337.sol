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
contract BloctoAccount4337 is UUPSUpgradeable, TokenCallbackHandler, CoreWallet, BaseAccount {
    /// @notice This is the version of this contract.
    string public constant VERSION = "1.4.0";

    address public constant EntryPointV060 = 0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789;

    modifier onlySelf() {
        require(msg.sender == address(this), "only self");
        _;
    }

    // override from UUPSUpgradeable
    function _authorizeUpgrade(address newImplementation) internal view override onlySelf {
        (newImplementation);
    }

    function entryPoint() public view virtual override returns (IEntryPoint) {
        return IEntryPoint(EntryPointV060);
    }

    /**
     * execute a transaction (called directly by entryPoint)
     */
    function execute(address dest, uint256 value, bytes calldata func) external {
        _requireFromEntryPoint();
        _call(dest, value, func);
    }

    /**
     * execute a sequence of transactions
     */
    function executeBatch(address[] calldata dest, bytes[] calldata func) external {
        _requireFromEntryPoint();
        require(dest.length == func.length, "wrong array lengths");
        for (uint256 i = 0; i < dest.length; i++) {
            _call(dest[i], 0, func[i]);
        }
    }

    // internal call for execute and executeBatch
    function _call(address target, uint256 value, bytes memory data) internal {
        (bool success, bytes memory result) = target.call{value: value}(data);
        if (!success) {
            assembly {
                revert(add(result, 32), mload(result))
            }
        }
    }

    /// implement template method of BaseAccount
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
     * check current account deposit in the entryPoint
     */
    function getDeposit() public view returns (uint256) {
        return entryPoint().balanceOf(address(this));
    }

    /**
     * deposit more funds for this account in the entryPoint
     */
    function addDeposit() public payable {
        entryPoint().depositTo{value: msg.value}(address(this));
    }

    // withdraw deposit to withdrawAddress by cosigner & authorizedAddress signature
    function withdrawDepositTo(address payable withdrawAddress, uint256 amount) external onlySelf {
        entryPoint().withdrawTo(withdrawAddress, amount);
    }
}
