// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import "@openzeppelin/contracts/utils/Create2.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import "../BloctoAccountProxy.sol";
import "./BloctoAccount.sol";

import {BLAST, IBlastPoints, GAS_COLLECTOR} from "./BlastConstant.sol";

// BloctoAccountFactory for creating BloctoAccountProxy
contract BloctoAccountFactoryBase is Initializable, AccessControlUpgradeable {
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

    /// @notice use from  v1.5.3, result for simulateCreateAccountWithInvoke2 & simulateCreateAccount2WithInvoke2
    error CreateAccountWithInvokeResult(bool targetSuccess, uint256 gasLeft);

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

        // contract balance will grow automatically
        BLAST.configureAutomaticYield();
        // let GAS_COLLECTOR collect gas
        BLAST.configureClaimableGas();
        BLAST.configureGovernor(GAS_COLLECTOR);
    }

    /// @notice configure blast for yield, gas, and points
    /// @param pointsOperator blast points contract operator address, should be EOA from https://docs.blast.io/airdrop/api#configuring-a-points-operator
    function configureBlastPoints(address blastPointsAddr, address pointsOperator) external onlyAdmin {
        // operator should be EOA
        IBlastPoints(blastPointsAddr).configurePointsOperator(pointsOperator);
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
}
