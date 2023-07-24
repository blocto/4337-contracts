import { ethers } from 'hardhat'
import { Wallet, BigNumber, BaseContract } from 'ethers'
import { expect } from 'chai'
import {
  BloctoAccount,
  BloctoAccountV140,
  BloctoAccount__factory,
  BloctoAccountV140__factory,
  BloctoAccountCloneableWallet__factory,
  BloctoAccountCloneableWalletV140__factory,
  CREATE3Factory,
  TestBloctoAccountCloneableWalletV200,
  TestBloctoAccountCloneableWalletV200__factory,
  TestERC20,
  TestERC20__factory
} from '../typechain'
import { EntryPoint } from '@account-abstraction/contracts'
import {
  fund,
  createTmpAccount,
  createAccount,
  deployEntryPoint,
  ONE_ETH,
  createAuthorizedCosignerRecoverWallet,
  txData,
  signMessage,
  getMergedKey,
  signMessageWithoutChainId,
  TWO_ETH
} from './testutils'
import '@openzeppelin/hardhat-upgrades'
import { hexZeroPad } from '@ethersproject/bytes'
import { deployCREATE3Factory, getDeployCode } from '../src/create3Factory'
import { create3DeployTransparentProxy } from '../src/deployAccountFactoryWithCreate3'

describe('BloctoAccount Upgrade Test', function () {
  const ethersSigner = ethers.provider.getSigner()

  let authorizedWallet: Wallet
  let cosignerWallet: Wallet
  let recoverWallet: Wallet

  let implementation: string
  let factory: BloctoAccountFactory

  let entryPoint: EntryPoint

  let create3Factory: CREATE3Factory

  let testERC20: TettERC20

  const NowVersion = '1.4.0'
  const NextVersion = '1.5.0'

  async function testCreateAccount (salt = 0, mergedKeyIndex = 0): Promise<BloctoAccount> {
    const [px, pxIndexWithParity] = getMergedKey(authorizedWallet, cosignerWallet, mergedKeyIndex)

    const account = await createAccount(
      ethersSigner,
      await authorizedWallet.getAddress(),
      await cosignerWallet.getAddress(),
      await recoverWallet.getAddress(),
      BigNumber.from(salt),
      pxIndexWithParity,
      px,
      factory
    )
    await fund(account)

    return account
  }

  // use authorizedWallet and cosignerWallet to upgrade wallet
  // withChainId(true) -> for after v1.5.0 , else(false) -> for beforfe v1.4.0
  async function upgradeAccountToNewVersion (account: BloctoAccount, newImplementationAddr: string, withChainId: boolean = true): Promise<void> {
    // const accountV140 = account as BloctoAccountV140
    // const originalNonce = withChainId ? (await account.nonce()) : (await account.nonces(authorizedWallet.address))
    let newNonce: BigNumber
    if (withChainId) {
      account = account as BloctoAccount
      newNonce = (await account.nonce()).add(1)
    } else {
      const accountV140 = await BloctoAccountV140__factory.connect(account.address, cosignerWallet)
      newNonce = (await accountV140.nonces(authorizedWallet.address)).add(1)
    }

    const accountLinkCosigner = BloctoAccount__factory.connect(account.address, cosignerWallet)
    const upgradeToData = txData(1, account.address, BigNumber.from(0),
      account.interface.encodeFunctionData('upgradeTo', [newImplementationAddr]))

    const sign = withChainId ? await signMessage(authorizedWallet, account.address, newNonce, upgradeToData) : await signMessageWithoutChainId(authorizedWallet, account.address, newNonce, upgradeToData)
    await accountLinkCosigner.invoke1CosignerSends(sign.v, sign.r, sign.s, newNonce, authorizedWallet.address, upgradeToData)
  }

  // use authorizedWallet and cosignerWallet to send ERC20 from wallet
  async function sendERC20 (account: BloctoAccount, to: string, amount: BigNumber, withChainId: boolean = true): Promise<void> {
    // const authorizeInAccountNonce = (await account.nonces(authorizedWallet.address)).add(1)
    const authorizeInAccountNonce = (await account.nonce()).add(1)
    const accountLinkCosigner = BloctoAccount__factory.connect(account.address, cosignerWallet)
    const data = txData(1, testERC20.address, BigNumber.from(0),
      testERC20.interface.encodeFunctionData('transfer', [to, amount]))

    const sign = withChainId ? await signMessage(authorizedWallet, account.address, authorizeInAccountNonce, data) : await signMessageWithoutChainId(authorizedWallet, account.address, authorizeInAccountNonce, data)
    await accountLinkCosigner.invoke1CosignerSends(sign.v, sign.r, sign.s, authorizeInAccountNonce, authorizedWallet.address, data)
  }

  before(async function () {
    // 3 wallet
    [authorizedWallet, cosignerWallet, recoverWallet] = createAuthorizedCosignerRecoverWallet()
    await fund(cosignerWallet.address)
    // 4337
    entryPoint = await deployEntryPoint()

    // create3 factory
    create3Factory = await deployCREATE3Factory(ethersSigner)

    // v1 implementation
    // implementation = (await new BloctoAccountCloneableWallet__factory(ethersSigner).deploy(entryPoint.address)).address
    // maybe add version
    const accountSalt = hexZeroPad(Buffer.from('BloctoAccount_v140', 'utf-8'), 32)
    implementation = await create3Factory.getDeployed(await ethersSigner.getAddress(), accountSalt)
    expect((await ethers.provider.getCode(implementation))).to.equal('0x')

    await create3Factory.deploy(
      accountSalt,
      getDeployCode(new BloctoAccountCloneableWalletV140__factory(), [entryPoint.address])
    )

    expect((await ethers.provider.getCode(implementation))).not.equal('0x')

    // account factory
    const BloctoAccountFactory = await ethers.getContractFactory('BloctoAccountFactoryV140')
    factory = await create3DeployTransparentProxy(BloctoAccountFactory,
      [implementation, entryPoint.address, await ethersSigner.getAddress()],
      { initializer: 'initialize' }, create3Factory, ethersSigner)
    await factory.grantRole(await factory.CREATE_ACCOUNT_ROLE(), await ethersSigner.getAddress())

    // testERC20 deploy
    testERC20 = await new TestERC20__factory(ethersSigner).deploy('TestERC20', 'TST', 18)
  })

  // upgrade from v140
  let accountV140: BloctoAccountV140
  let account: BloctoAccount
  it('creat previous version account', async () => {
    expect(await factory.VERSION()).to.eql(NowVersion)

    accountV140 = await testCreateAccount(140) as unknown as BloctoAccountV140
    expect(await accountV140.VERSION()).to.eql(NowVersion)
  })

  it('should delpoy new cloneble wallet and upgrade factory ', async () => {
    // deploy BloctoAccount next version
    const accountSalt = hexZeroPad(Buffer.from('BloctoAccount_next_version', 'utf-8'), 32)
    implementation = await create3Factory.getDeployed(await ethersSigner.getAddress(), accountSalt)
    expect((await ethers.provider.getCode(implementation))).to.equal('0x')

    await create3Factory.deploy(
      accountSalt,
      getDeployCode(new BloctoAccountCloneableWallet__factory(), [entryPoint.address])
    )

    expect((await ethers.provider.getCode(implementation))).not.equal('0x')

    // deploy BloctoAccountFactory next version
    const UpgradeContract = await ethers.getContractFactory('BloctoAccountFactory')
    factory = await upgrades.upgradeProxy(factory.address, UpgradeContract)
    await factory.setImplementation(implementation)
    expect(await factory.VERSION()).to.eql(NextVersion)
  })

  it('should upgrade by account', async () => {
    await upgradeAccountToNewVersion(accountV140, implementation, false)
    account = accountV140 as unknown as BloctoAccount
    expect(await account.VERSION()).to.eql(NextVersion)
  })

  describe('wallet function', () => {
    const AccountSalt = 123

    it('should receive native token', async () => {
      const account = await testCreateAccount(AccountSalt)
      const beforeRecevive = await ethers.provider.getBalance(account.address)
      const [owner] = await ethers.getSigners()

      const tx = await owner.sendTransaction({
        to: account.address,
        value: ONE_ETH // Sends exactly 1.0 ether
      })
      const receipt = await tx.wait()
      const receivedSelector = ethers.utils.id('Received(address,uint256)')
      expect(receipt.logs[0].topics[0]).to.equal(receivedSelector)
      expect(await ethers.provider.getBalance(account.address)).to.equal(beforeRecevive.add(ONE_ETH))
    })

    it('should send ERC20 token', async () => {
      // prepare
      const sendAccount = await testCreateAccount(2001)
      const receiveAccount = await testCreateAccount(2002)
      await testERC20.mint(sendAccount.address, TWO_ETH)

      // test send ERC20
      const before = await testERC20.balanceOf(sendAccount.address)
      const beforeRecevive = await testERC20.balanceOf(receiveAccount.address)

      await sendERC20(sendAccount, receiveAccount.address, ONE_ETH)

      expect(await testERC20.balanceOf(sendAccount.address)).to.equal(before.sub(ONE_ETH))
      expect(await testERC20.balanceOf(receiveAccount.address)).to.equal(beforeRecevive.add(ONE_ETH))
    })

    it('should create account with multiple authorized address', async () => {
      const [authorizedWallet2, cosignerWallet2, recoverWallet2] = createAuthorizedCosignerRecoverWallet()
      const authorizedWallet22 = createTmpAccount()

      const [px, pxIndexWithParity] = getMergedKey(authorizedWallet, cosignerWallet, 0)
      const [px2, pxIndexWithParity2] = getMergedKey(authorizedWallet2, cosignerWallet2, 1)

      const tx = await factory.createAccount2([authorizedWallet2.address, authorizedWallet22.address],
        cosignerWallet2.address, recoverWallet2.address,
        754264557, // random salt
        [pxIndexWithParity, pxIndexWithParity2],
        [px, px2])

      const receipt = await tx.wait()
      console.log('createAccount with multiple authorized address gasUsed: ', receipt.gasUsed)
      let findWalletCreated = false
      receipt.events?.forEach((event) => {
        if (event.event === 'WalletCreated' &&
            event.args?.authorizedAddress === authorizedWallet2.address) {
          findWalletCreated = true
        }
      })
      expect(findWalletCreated).true
    })
  })

  describe('should upgrade account to different implementation version', () => {
    const AccountSalt = 12345
    const MockEntryPointV070 = '0x000000000000000000000000000000000000E070'
    let accountV200: BloctoAccount
    let implementationV200: TestBloctoAccountCloneableWalletV200

    before(async () => {
      accountV200 = await testCreateAccount(AccountSalt)
      // mock new entry point version 0.7.0
      implementationV200 = await new TestBloctoAccountCloneableWalletV200__factory(ethersSigner).deploy(MockEntryPointV070)
    })

    it('new factory get new version and same account address', async () => {
      const beforeAccountAddr = await factory.getAddress(await cosignerWallet.getAddress(), await recoverWallet.getAddress(), AccountSalt)
      const UpgradeContract = await ethers.getContractFactory('TestBloctoAccountFactoryV200')
      const factoryV200 = await upgrades.upgradeProxy(factory.address, UpgradeContract)

      factory.setImplementation(implementationV200.address)
      expect(await factory.VERSION()).to.eql('2.0.0')

      const afterAccountAddr = await factoryV200.getAddress(await cosignerWallet.getAddress(), await recoverWallet.getAddress(), AccountSalt)
      expect(beforeAccountAddr).to.eql(afterAccountAddr)
    })

    it('upgrade fail if not by contract self', async () => {
      // upgrade revert even though upgrade by cosigner
      await expect(accountV200.connect(cosignerWallet).upgradeTo(implementationV200.address))
        .to.revertedWith('must be called from `invoke()')
    })

    it('upgrade test', async () => {
      await upgradeAccountToNewVersion(accountV200, implementationV200.address)
      expect(await accountV200.VERSION()).to.eql('2.0.0')
    })

    it('factory getAddress sould be same', async () => {
      const addrFromFacotry = await factory.getAddress(
        await cosignerWallet.getAddress(),
        await recoverWallet.getAddress(),
        AccountSalt)
      expect(addrFromFacotry).to.eql(accountV200.address)
    })

    it('new account get new version', async () => {
      const randomSalt = 54326346
      const accountNew = await testCreateAccount(randomSalt)

      expect(await accountNew.VERSION()).to.eql('2.0.0')
    })

    it('should entrypoint be v070 address', async () => {
      expect(await accountV200.entryPoint()).to.eql(MockEntryPointV070)
    })
  })

  describe('should upgrade factory to different version implementation', () => {
    const TestSalt = 135341

    it('new factory get new version but same account address', async () => {
      const beforeAccountAddr = await factory.getAddress(await cosignerWallet.getAddress(), await recoverWallet.getAddress(), TestSalt)

      const UpgradeContract = await ethers.getContractFactory('TestBloctoAccountFactoryV200')
      const factoryV200 = await upgrades.upgradeProxy(factory.address, UpgradeContract)

      expect(await factoryV200.VERSION()).to.eql('2.0.0')

      const afterAccountAddr = await factoryV200.getAddress(await cosignerWallet.getAddress(), await recoverWallet.getAddress(), TestSalt)
      expect(beforeAccountAddr).to.eql(afterAccountAddr)
    })
  })

  describe('should create account if account has create account role', () => {
    it('shoule crate account with grant role', async () => {
      // create account
      const createAccountWallet = await createTmpAccount()
      await fund(createAccountWallet.address)
      // grant account role
      await factory.grantRole(await factory.CREATE_ACCOUNT_ROLE(), await createAccountWallet.address)
      // create account with createAccountWallet
      const factoryWithCreateAccount = await factory.connect(createAccountWallet)
      const mergedKeyIndex = 0
      const [px, pxIndexWithParity] = getMergedKey(authorizedWallet, cosignerWallet, mergedKeyIndex)

      await createAccount(
        ethersSigner,
        await authorizedWallet.getAddress(),
        await cosignerWallet.getAddress(),
        await recoverWallet.getAddress(),
        BigNumber.from(6346346),
        pxIndexWithParity,
        px,
        factoryWithCreateAccount
      )
    })
  })
})
