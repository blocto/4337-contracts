// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import "@openzeppelin/contracts/utils/Create2.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import "../BloctoAccountProxy.sol";
import "./BloctoAccount.sol";

// BloctoAccountFactory for creating BloctoAccountProxy
contract BloctoAccountFactory is Initializable, AccessControlUpgradeable {
    /// @notice this is the version of this contract.
    string public constant VERSION = "1.5.2";
    /// @notice create account role for using createAccount() and createAccount2()
    bytes32 public constant CREATE_ACCOUNT_ROLE = keccak256("CREATE_ACCOUNT_ROLE");
    bytes constant BLOCTO_ACCOUNT_PROXY =
        hex"608060405234801561001057600080fd5b5060405161011538038061011583398101604081905261002f91610056565b7f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc55610086565b60006020828403121561006857600080fd5b81516001600160a01b038116811461007f57600080fd5b9392505050565b6081806100946000396000f3fe60806040527f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc543660008037600080366000845af490503d6000803e8080156046573d6000f35b3d6000fdfea26469706673582212202a8d56f372c20fe0a7e4476872c9243a02a5a811e1c4bb3f654e57857b05090164736f6c63430008110033";
    bytes constant BLOCTO_ACCOUNT_PROXY_V140 =
        hex"608060405234801561001057600080fd5b5060405161011538038061011583398101604081905261002f91610056565b7f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc55610086565b60006020828403121561006857600080fd5b81516001600160a01b038116811461007f57600080fd5b9392505050565b6081806100946000396000f3fe60806040527f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc543660008037600080366000845af490503d6000803e8080156046573d6000f35b3d6000fdfea2646970667358221220293a9dbad4bc6c8db46c15ab5db6e19b4e92ad39539181ac03316bbae4512cd364736f6c63430008110033";

    /// @notice the init implementation address of BloctoAccountCloneableWallet, never change for cosistent address
    address public initImplementation;
    /// @notice the implementation address of BloctoAccountCloneableWallet
    address public bloctoAccountImplementation;
    /// @notice the address from EIP-4337 official implementation
    IEntryPoint public entryPoint;
    /// @notice the implementation address of BloctoAccountCloneableWallet
    address public bloctoAccountImplementation151Plus;

    event WalletCreated(address wallet, address authorizedAddress, bool full);

    struct Invoke2Data {
        uint256 nonce;
        bytes data;
        bytes signature;
    }

    /// @notice initialize
    /// @param _bloctoAccountImplementation the implementation address for BloctoAccountCloneableWallet
    /// @param _entryPoint the entrypoint address from EIP-4337 official implementation
    function initialize(address _bloctoAccountImplementation, IEntryPoint _entryPoint, address _admin)
        public
        initializer
    {
        require(_bloctoAccountImplementation != address(0), "Invalid implementation address.");
        initImplementation = _bloctoAccountImplementation;
        bloctoAccountImplementation = _bloctoAccountImplementation;
        entryPoint = _entryPoint;
        _setupRole(DEFAULT_ADMIN_ROLE, _admin);
    }

    /// @notice only the admin can update admin functioins
    modifier onlyAdmin() {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "caller is not a admin");
        _;
    }

    /// @notice only the create account role can call create accout functions
    modifier onlyCreateAccountRole() {
        require(hasRole(CREATE_ACCOUNT_ROLE, msg.sender), "caller is not a create account role");
        _;
    }

    /// @notice create an account, and return its BloctoAccount.
    /// @param _authorizedAddress the initial authorized address, must not be zero!
    /// @param _cosigner the initial cosigning address for `_authorizedAddress`, can be equal to `_authorizedAddress`
    /// @param _recoveryAddress the initial recovery address for the wallet, can be address(0)
    /// @param _salt salt for create account (used for address calculation in create2)
    /// @param _mergedKeyIndexWithParity the corresponding index of mergedKeys = authVersion + _mergedIndex
    /// @param _mergedKey the corresponding mergedKey (using Schnorr merged key)
    function createAccountLegacy(
        address _authorizedAddress,
        address _cosigner,
        address _recoveryAddress,
        uint256 _salt,
        uint8 _mergedKeyIndexWithParity,
        bytes32 _mergedKey
    ) external onlyCreateAccountRole returns (BloctoAccount ret) {
        bytes32 salt = keccak256(abi.encodePacked(_salt, _cosigner, _recoveryAddress));
        // to be consistent address
        address newProxy = Create2.deploy(
            0, salt, abi.encodePacked(BLOCTO_ACCOUNT_PROXY_V140, abi.encode(address(initImplementation)))
        );
        ret = BloctoAccount(payable(newProxy));
        ret.initImplementation(bloctoAccountImplementation);
        ret.init(
            _authorizedAddress, uint256(uint160(_cosigner)), _recoveryAddress, _mergedKeyIndexWithParity, _mergedKey
        );
        emit WalletCreated(address(ret), _authorizedAddress, false);
    }

    /// @notice create an account with multiple authorized addresses, and return its BloctoAccount.
    /// @param _authorizedAddresses the initial authorized addresses, must not be zero!
    /// @param _cosigner the initial cosigning address for `_authorizedAddress`, can be equal to `_authorizedAddress`
    /// @param _recoveryAddress the initial recovery address for the wallet, can be address(0)
    /// @param _salt salt for create account (used for address calculation in create2)
    /// @param _mergedKeyIndexWithParitys the corresponding index of mergedKeys = authVersion + _mergedIndex
    /// @param _mergedKeys the corresponding mergedKey
    function createAccount2Legacy(
        address[] calldata _authorizedAddresses,
        address _cosigner,
        address _recoveryAddress,
        uint256 _salt,
        uint8[] calldata _mergedKeyIndexWithParitys,
        bytes32[] calldata _mergedKeys
    ) external onlyCreateAccountRole returns (BloctoAccount ret) {
        bytes32 salt = keccak256(abi.encodePacked(_salt, _cosigner, _recoveryAddress));
        // to be consistent address
        address newProxy = Create2.deploy(
            0, salt, abi.encodePacked(BLOCTO_ACCOUNT_PROXY_V140, abi.encode(address(initImplementation)))
        );
        ret = BloctoAccount(payable(newProxy));
        ret.initImplementation(bloctoAccountImplementation);
        ret.init2(
            _authorizedAddresses, uint256(uint160(_cosigner)), _recoveryAddress, _mergedKeyIndexWithParitys, _mergedKeys
        );
        // emit event only with _authorizedAddresses[0]
        emit WalletCreated(address(ret), _authorizedAddresses[0], true);
    }

    /// @notice calculate the counterfactual address of this account as it would be returned by createAccount()
    /// @param _cosigner the initial cosigning address
    /// @param _recoveryAddress the initial recovery address for the wallet
    /// @param _salt salt for create account (used for address calculation in create2)
    function getAddressLegacy(address _cosigner, address _recoveryAddress, uint256 _salt)
        public
        view
        returns (address)
    {
        bytes32 salt = keccak256(abi.encodePacked(_salt, _cosigner, _recoveryAddress));
        return Create2.computeAddress(
            bytes32(salt),
            keccak256(abi.encodePacked(BLOCTO_ACCOUNT_PROXY_V140, abi.encode(address(initImplementation))))
        );
    }

    /// @notice set the implementation
    /// @param _bloctoAccountImplementation update the implementation address of BloctoAccountCloneableWallet for createAccount and createAccount2
    function setImplementation(address _bloctoAccountImplementation) external onlyAdmin {
        require(_bloctoAccountImplementation != address(0), "invalid implementation address.");
        bloctoAccountImplementation = _bloctoAccountImplementation;
    }

    /// @notice set the implementation for bloctoAccountImplementation151Plus
    /// @param _bloctoAccountImplementation151Plus update the implementation address of BloctoAccountCloneableWallet for createAccount and createAccount2
    function setImplementation_1_5_1(address _bloctoAccountImplementation151Plus) external onlyAdmin {
        require(_bloctoAccountImplementation151Plus != address(0), "invalid implementation address.");
        bloctoAccountImplementation151Plus = _bloctoAccountImplementation151Plus;
    }

    /// @notice create an account, and return its BloctoAccount. note: diretly use _salt to create account
    /// @param _authorizedAddress the initial authorized address, must not be zero!
    /// @param _cosigner the initial cosigning address for `_authorizedAddress`, can be equal to `_authorizedAddress`
    /// @param _recoveryAddress the initial recovery address for the wallet, can be address(0)
    /// @param _salt salt for create account (used for address calculation in create2)
    /// @param _mergedKeyIndexWithParity the corresponding index of mergedKeys = authVersion + _mergedIndex
    /// @param _mergedKey the corresponding mergedKey (using Schnorr merged key)
    function createAccount_1_5_1(
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
        ret.initImplementation(bloctoAccountImplementation151Plus);
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
    function createAccount2_1_5_1(
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
        ret.initImplementation(bloctoAccountImplementation151Plus);
        ret.init2(
            _authorizedAddresses, uint256(uint160(_cosigner)), _recoveryAddress, _mergedKeyIndexWithParitys, _mergedKeys
        );
        // emit event only with _authorizedAddresses[0]
        emit WalletCreated(address(ret), _authorizedAddresses[0], true);
    }

    /// @notice calculate the counterfactual address of this account as it would be returned by createAccount_1_5_1()
    /// @param _salt salt for create account (used for address calculation in create2)
    function getAddress_1_5_1(bytes32 _salt) public view returns (address) {
        return Create2.computeAddress(
            _salt, keccak256(abi.encodePacked(BLOCTO_ACCOUNT_PROXY, abi.encode(address(initImplementation))))
        );
    }

    /// @notice create an account and run first transaction, it combine from createAccount_1_5_1() of this and invoke2() from CoreWallet
    /// @dev why Invoke2Data struct? Because 'CompilerError: Stack too deep.' problem, we cannot directly input (_nonce, _data, _signature)
    /// @param _authorizedAddress the initial authorized address, must not be zero!
    /// @param _cosigner the initial cosigning address for `_authorizedAddress`, can be equal to `_authorizedAddress`
    /// @param _recoveryAddress the initial recovery address for the wallet, can be address(0)
    /// @param _salt salt for create account (used for address calculation in create2)
    /// @param _mergedKeyIndexWithParity the corresponding index of mergedKeys = authVersion + _mergedIndex
    /// @param _mergedKey the corresponding mergedKey (using Schnorr merged key)
    /// @param _invoke2Data the invoke2 data {nonce, data, signature}
    function createAccountWithInvoke2(
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
        ret = createAccount_1_5_1(
            _authorizedAddress, _cosigner, _recoveryAddress, _salt, _mergedKeyIndexWithParity, _mergedKey
        );
        ret.invoke2(_invoke2Data.nonce, _invoke2Data.data, _invoke2Data.signature);
    }

    /// @notice create an account with multiple devices and run first transaction, it combine from createAccount2_1_5_1() of this and invoke2() from CoreWallet
    /// @dev why Invoke2Data struct?  Because 'CompilerError: Stack too deep.' problem, we cannot directly input (_nonce, _data, _signature)
    /// @param _authorizedAddresses the initial authorized addresses, must not be zero!
    /// @param _cosigner the initial cosigning address for `_authorizedAddress`, can be equal to `_authorizedAddress`
    /// @param _recoveryAddress the initial recovery address for the wallet, can be address(0)
    /// @param _salt salt for create account (used for address calculation in create2)
    /// @param _mergedKeyIndexWithParitys the corresponding index of mergedKeys = authVersion + _mergedIndex
    /// @param _mergedKeys the corresponding mergedKey
    /// @param _invoke2Data the invoke2 data {nonce, data, signature}
    function createAccount2WithInvoke2(
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
        ret = createAccount2_1_5_1(
            _authorizedAddresses, _cosigner, _recoveryAddress, _salt, _mergedKeyIndexWithParitys, _mergedKeys
        );
        ret.invoke2(_invoke2Data.nonce, _invoke2Data.data, _invoke2Data.signature);
    }
}
