// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import "./BloctoAccountFactoryBase.sol";

// BloctoAccountFactory for creating BloctoAccountProxy
contract BloctoAccountFactoryV1_5_4 is BloctoAccountFactoryBase {
    //---------------------------V1.5.4---------------------------//
    address public immutable bloctoAccountImplementation_1_5_4;

    constructor(address _account_1_5_4) {
        bloctoAccountImplementation_1_5_4 = _account_1_5_4;
    }

    /// @notice create an account, and return its BloctoAccount. note: diretly use _salt to create account
    /// @param _authorizedAddress the initial authorized address, must not be zero!
    /// @param _cosigner the initial cosigning address for `_authorizedAddress`, can be equal to `_authorizedAddress`
    /// @param _recoveryAddress the initial recovery address for the wallet, can be address(0)
    /// @param _salt salt for create account (used for address calculation in create2)
    /// @param _mergedKeyIndexWithParity the corresponding index of mergedKeys = authVersion + _mergedIndex
    /// @param _mergedKey the corresponding mergedKey (using Schnorr merged key)
    function createAccount_1_5_4(
        address _authorizedAddress,
        address _cosigner,
        address _recoveryAddress,
        bytes32 _salt,
        uint8 _mergedKeyIndexWithParity,
        bytes32 _mergedKey
    ) public onlyCreateAccountRole returns (BloctoAccount ret) {
        // to be consistent address
        address newProxy =
            Create2.deploy(0, _salt, abi.encodePacked(BLOCTO_ACCOUNT_PROXY, abi.encode(address(initImplementation))));
        ret = BloctoAccount(payable(newProxy));
        ret.initImplementation(bloctoAccountImplementation_1_5_4);
        ret.init(
            _authorizedAddress, uint256(uint160(_cosigner)), _recoveryAddress, _mergedKeyIndexWithParity, _mergedKey
        );
        emit WalletCreated(address(ret), _authorizedAddress, false);
    }

    /// @notice create an account with multiple authorized addresses, and return its BloctoAccount. note: diretly use _salt to create account
    /// @param _authorizedAddresses the initial authorized addresses, must not be zero!
    /// @param _cosigner the initial cosigning address for `_authorizedAddress`, can be equal to `_authorizedAddress`
    /// @param _recoveryAddress the initial recovery address for the wallet, can be address(0)
    /// @param _salt salt for create account (used for address calculation in create2)
    /// @param _mergedKeyIndexWithParitys the corresponding index of mergedKeys = authVersion + _mergedIndex
    /// @param _mergedKeys the corresponding mergedKey
    function createAccount2_1_5_4(
        address[] calldata _authorizedAddresses,
        address _cosigner,
        address _recoveryAddress,
        bytes32 _salt,
        uint8[] calldata _mergedKeyIndexWithParitys,
        bytes32[] calldata _mergedKeys
    ) public onlyCreateAccountRole returns (BloctoAccount ret) {
        // to be consistent address
        address newProxy =
            Create2.deploy(0, _salt, abi.encodePacked(BLOCTO_ACCOUNT_PROXY, abi.encode(address(initImplementation))));
        ret = BloctoAccount(payable(newProxy));
        ret.initImplementation(bloctoAccountImplementation_1_5_4);
        ret.init2(
            _authorizedAddresses, uint256(uint160(_cosigner)), _recoveryAddress, _mergedKeyIndexWithParitys, _mergedKeys
        );
        // emit event only with _authorizedAddresses[0]
        emit WalletCreated(address(ret), _authorizedAddresses[0], true);
    }

    /// @notice create an account and run first transaction, it combine from createAccount_1_5_4() of this and invoke2() from CoreWallet
    /// @dev why Invoke2Data struct? Because 'CompilerError: Stack too deep.' problem, we cannot directly input (_nonce, _data, _signature)
    /// @param _authorizedAddress the initial authorized address, must not be zero!
    /// @param _cosigner the initial cosigning address for `_authorizedAddress`, can be equal to `_authorizedAddress`
    /// @param _recoveryAddress the initial recovery address for the wallet, can be address(0)
    /// @param _salt salt for create account (used for address calculation in create2)
    /// @param _mergedKeyIndexWithParity the corresponding index of mergedKeys = authVersion + _mergedIndex
    /// @param _mergedKey the corresponding mergedKey (using Schnorr merged key)
    /// @param _invoke2Data the invoke2 data {nonce, data, signature}
    function createAccountWithInvoke2_1_5_4(
        // same input as createAccount_1_5_4() of this contract
        address _authorizedAddress,
        address _cosigner,
        address _recoveryAddress,
        bytes32 _salt,
        uint8 _mergedKeyIndexWithParity,
        bytes32 _mergedKey,
        // same input as invoke2() of CoreWallet.sol
        Invoke2Data calldata _invoke2Data
    ) external onlyCreateAccountRole returns (BloctoAccount ret) {
        ret = createAccount_1_5_4(
            _authorizedAddress, _cosigner, _recoveryAddress, _salt, _mergedKeyIndexWithParity, _mergedKey
        );
        ret.invoke2(_invoke2Data.nonce, _invoke2Data.data, _invoke2Data.signature);
    }

    /// @notice create an account with multiple devices and run first transaction, it combine from createAccount2_1_5_4() of this and invoke2() from CoreWallet
    /// @dev why Invoke2Data struct?  Because 'CompilerError: Stack too deep.' problem, we cannot directly input (_nonce, _data, _signature)
    /// @param _authorizedAddresses the initial authorized addresses, must not be zero!
    /// @param _cosigner the initial cosigning address for `_authorizedAddress`, can be equal to `_authorizedAddress`
    /// @param _recoveryAddress the initial recovery address for the wallet, can be address(0)
    /// @param _salt salt for create account (used for address calculation in create2)
    /// @param _mergedKeyIndexWithParitys the corresponding index of mergedKeys = authVersion + _mergedIndex
    /// @param _mergedKeys the corresponding mergedKey
    /// @param _invoke2Data the invoke2 data {nonce, data, signature}
    function createAccount2WithInvoke2_1_5_4(
        // same input as createAccount2_1_5_4() of this contract
        address[] calldata _authorizedAddresses,
        address _cosigner,
        address _recoveryAddress,
        bytes32 _salt,
        uint8[] calldata _mergedKeyIndexWithParitys,
        bytes32[] calldata _mergedKeys,
        // same input as invoke2() of CoreWallet.sol
        Invoke2Data calldata _invoke2Data
    ) external onlyCreateAccountRole returns (BloctoAccount ret) {
        ret = createAccount2_1_5_4(
            _authorizedAddresses, _cosigner, _recoveryAddress, _salt, _mergedKeyIndexWithParitys, _mergedKeys
        );
        ret.invoke2(_invoke2Data.nonce, _invoke2Data.data, _invoke2Data.signature);
    }

    /// @notice simulate for creating an account and run first transaction, it combine from createAccount_1_5_1() of this and invoke2() from CoreWallet
    /// @param _authorizedAddress the initial authorized address, must not be zero!
    /// @param _cosigner the initial cosigning address for `_authorizedAddress`, can be equal to `_authorizedAddress`
    /// @param _recoveryAddress the initial recovery address for the wallet, can be address(0)
    /// @param _salt salt for create account (used for address calculation in create2)
    /// @param _mergedKeyIndexWithParity the corresponding index of mergedKeys = authVersion + _mergedIndex
    /// @param _mergedKey the corresponding mergedKey (using Schnorr merged key)
    /// @param _invoke2Data the invoke2 data {nonce, data, signature}
    function simulateCreateAccountWithInvoke2_1_5_4(
        // same input as createAccount_1_5_1() of this contract
        address _authorizedAddress,
        address _cosigner,
        address _recoveryAddress,
        bytes32 _salt,
        uint8 _mergedKeyIndexWithParity,
        bytes32 _mergedKey,
        // same input as invoke2() of CoreWallet.sol
        Invoke2Data calldata _invoke2Data
    ) external onlyCreateAccountRole returns (BloctoAccount ret) {
        ret = createAccount_1_5_4(
            _authorizedAddress, _cosigner, _recoveryAddress, _salt, _mergedKeyIndexWithParity, _mergedKey
        );
        // always revert
        try ret.simulateInvoke2(_invoke2Data.nonce, _invoke2Data.data, _invoke2Data.signature) {}
        catch (bytes memory reason) {
            // NOTE: this ExecutionResult from CoreWallet.sol
            // success bytes(100), bytes4 selector from keccak256("ExecutionResult(bool)") 0x2a6b3136 + btyes32 (bool, 0x01) + bytes32 (uint256) + bytes32 (uint256)
            if (
                reason.length == 100 && uint8(reason[35]) == 1
                    && bytes4(reason) == bytes4(keccak256("ExecutionResult(bool,uint256,uint256)"))
            ) {
                revert CreateAccountWithInvokeResult(true, gasleft());
            }
        }

        revert CreateAccountWithInvokeResult(false, gasleft());
    }

    /// @notice simulate for creating an account with multiple devices and run first transaction, it combine from createAccount2_1_5_1() of this and invoke2() from CoreWallet
    /// @param _authorizedAddresses the initial authorized addresses, must not be zero!
    /// @param _cosigner the initial cosigning address for `_authorizedAddress`, can be equal to `_authorizedAddress`
    /// @param _recoveryAddress the initial recovery address for the wallet, can be address(0)
    /// @param _salt salt for create account (used for address calculation in create2)
    /// @param _mergedKeyIndexWithParitys the corresponding index of mergedKeys = authVersion + _mergedIndex
    /// @param _mergedKeys the corresponding mergedKey
    /// @param _invoke2Data the invoke2 data {nonce, data, signature}
    function simulateCreateAccount2WithInvoke2_1_5_4(
        // same input as createAccount2_1_5_1() of this contract
        address[] calldata _authorizedAddresses,
        address _cosigner,
        address _recoveryAddress,
        bytes32 _salt,
        uint8[] calldata _mergedKeyIndexWithParitys,
        bytes32[] calldata _mergedKeys,
        // same input as invoke2() of CoreWallet.sol
        Invoke2Data calldata _invoke2Data
    ) external onlyCreateAccountRole returns (BloctoAccount ret) {
        ret = createAccount2_1_5_4(
            _authorizedAddresses, _cosigner, _recoveryAddress, _salt, _mergedKeyIndexWithParitys, _mergedKeys
        );
        // always revert
        try ret.simulateInvoke2(_invoke2Data.nonce, _invoke2Data.data, _invoke2Data.signature) {}
        catch (bytes memory reason) {
            // NOTE: this ExecutionResult from CoreWallet.sol
            // success bytes(100), bytes4 selector from keccak256("ExecutionResult(bool)") 0x2a6b3136 + btyes32 (bool, 0x01) + bytes32 (uint256) + bytes32 (uint256)
            if (
                reason.length == 100 && uint8(reason[35]) == 1
                    && bytes4(reason) == bytes4(keccak256("ExecutionResult(bool,uint256,uint256)"))
            ) {
                revert CreateAccountWithInvokeResult(true, gasleft());
            }
        }

        revert CreateAccountWithInvokeResult(false, gasleft());
    }
}
