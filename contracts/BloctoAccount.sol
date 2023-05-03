// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.12;

/* solhint-disable avoid-low-level-calls */
/* solhint-disable no-inline-assembly */
/* solhint-disable reason-string */

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import "@account-abstraction/contracts/core/BaseAccount.sol";

import "./TokenCallbackHandler.sol";
import "./CoreWallet/CoreWallet.sol";

/**
 * Blocto account.
 *  compatibility for EIP-4337 and smart contract wallet with cosigner functionality (CoreWallet)  
 */
contract BloctoAccount is
    CoreWallet,
    BaseAccount,
    TokenCallbackHandler,
    UUPSUpgradeable,
    Initializable
{
    using ECDSA for bytes32;

    /// @notice This is the version of this contract.
    string public constant VERSION = "1.3.0.0";

    IEntryPoint private immutable _entryPoint;

    event BloctoAccountInitialized(
        IEntryPoint indexed entryPoint,
        address authorizedAddress,
        address cosigner
    );

    /// @inheritdoc BaseAccount
    function entryPoint() public view virtual override returns (IEntryPoint) {
        return _entryPoint;
    }

    constructor(IEntryPoint anEntryPoint) {
        _entryPoint = anEntryPoint;
        _disableInitializers();
    }

    /**
     * execute a transaction (called directly from owner, or by entryPoint)
     */
    function execute(
        address dest,
        uint256 value,
        bytes calldata func
    ) external {
        _requireFromEntryPoint();
        _call(dest, value, func);
    }

    /**
     * execute a sequence of transactions
     */
    function executeBatch(
        address[] calldata dest,
        bytes[] calldata func
    ) external {
        _requireFromEntryPoint();
        require(dest.length == func.length, "wrong array lengths");
        for (uint256 i = 0; i < dest.length; i++) {
            _call(dest[i], 0, func[i]);
        }
    }

    /**
     * @dev The _entryPoint member is immutable, to reduce gas consumption.  To upgrade EntryPoint,
     * a new implementation of BloctoAccount must be deployed with the new EntryPoint address, then upgrading
     * the implementation by calling `upgradeTo()`
     */
    function initialize(
        address _authorizedAddress,
        address _cosigner,
        address _recoveryAddress
    ) public virtual initializer {
        _initialize(_authorizedAddress, _cosigner, _recoveryAddress);
    }

    function _initialize(
        address _authorizedAddress,
        address _cosigner,
        address _recoveryAddress
    ) internal virtual {
        init(_authorizedAddress, _cosigner, _recoveryAddress);

        emit BloctoAccountInitialized(
            _entryPoint,
            _authorizedAddress,
            _cosigner
        );
    }

    /// implement template method of BaseAccount
    function _validateSignature(
        UserOperation calldata userOp,
        bytes32 userOpHash
    ) internal virtual override returns (uint256 validationData) {
        bytes4 result = this.isValidSignature(userOpHash, userOp.signature);
        if (result != IERC1271.isValidSignature.selector) {
            return SIG_VALIDATION_FAILED;
        }

        return 0;
    }

    function _call(address target, uint256 value, bytes memory data) internal {
        (bool success, bytes memory result) = target.call{value: value}(data);
        if (!success) {
            assembly {
                revert(add(result, 32), mload(result))
            }
        }
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

    // TODO: not use cosigner
    function withdrawDepositTo(
        address payable withdrawAddress,
        uint256 amount
    ) public {
        require(
            msg.sender == address(recoveryAddress),
            "account: not from recovery address"
        );
        entryPoint().withdrawTo(withdrawAddress, amount);
    }

    // TODO: not use cosigner
    function _authorizeUpgrade(
        address newImplementation
    ) internal view override {
        (newImplementation);
        require(
            msg.sender == address(recoveryAddress),
            "account: not from recovery address"
        );
    }
}
