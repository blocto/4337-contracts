import { ethers } from 'hardhat'
import { Wallet, BigNumber, ContractTransaction } from 'ethers'
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
  TestERC20__factory,
  BloctoAccountFactory__factory,
  BloctoAccountFactory
} from '../typechain'
import { EntryPoint } from '@account-abstraction/contracts'

import {
  fund,
  createTmpAccount,
  createAccount,
  createAccountV151,
  deployEntryPoint,
  ONE_ETH,
  TWO_ETH,
  FIVE_ETH,
  createAuthorizedCosignerRecoverWallet,
  txData,
  signMessage,
  getMergedKey,
  signMessageWithoutChainId,
  rethrow,
  signForInovke2,
  get151SaltFromAddress
} from './testutils'
import '@openzeppelin/hardhat-upgrades'
import { hexZeroPad } from '@ethersproject/bytes'
import { deployCREATE3Factory, getDeployCode } from '../src/create3Factory'
import { create3DeployTransparentProxy } from '../src/deployAccountFactoryWithCreate3'
import { fillSignWithEIP191V0 } from './entrypoint/UserOp'
import { keccak256, zeroAddress } from 'ethereumjs-util'

const ShowGasUsage = false

describe('BloctoAccount Upgrade Test', function () {
  const ethersSigner = ethers.provider.getSigner()

  let authorizedWallet: Wallet
  let cosignerWallet: Wallet
  let recoverWallet: Wallet

  let implementation: string
  let implementationNextVersion: string
  let factory: BloctoAccountFactory

  let entryPoint: EntryPoint

  let create3Factory: CREATE3Factory

  let testERC20: TestERC20

  const NowVersion = '1.4.0'
  const NextVersion = '1.5.2'

  async function testCreateAccount (salt = 0, mergedKeyIndex = 0, ifactory = factory, version = NextVersion): Promise<BloctoAccount> {
    const [px, pxIndexWithParity] = getMergedKey(authorizedWallet, cosignerWallet, mergedKeyIndex)

    let account = null
    switch (version) {
      case '1.4.0':
        account = await createAccount(
          ethersSigner,
          await authorizedWallet.getAddress(),
          await cosignerWallet.getAddress(),
          await recoverWallet.getAddress(),
          BigNumber.from(salt),
          pxIndexWithParity,
          px,
          ifactory
        )
        break
      case '1.5.1':
      case '1.5.2':
      default:
        account = await createAccountV151(
          ethersSigner,
          await authorizedWallet.getAddress(),
          await cosignerWallet.getAddress(),
          await recoverWallet.getAddress(),
          BigNumber.from(salt),
          pxIndexWithParity,
          px,
          ifactory
        )
        break
    }
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
  async function sendERC20 (account: BloctoAccount, to: string, amount: BigNumber, withChainId: boolean = true): Promise<ContractTransaction> {
    // const authorizeInAccountNonce = (await account.nonces(authorizedWallet.address)).add(1)
    let authorizeInAccountNonce: BigNumber
    if (withChainId) {
      account = account as BloctoAccount
      authorizeInAccountNonce = (await account.nonce()).add(1)
    } else {
      const accountV140 = await BloctoAccountV140__factory.connect(account.address, cosignerWallet)
      authorizeInAccountNonce = (await accountV140.nonces(authorizedWallet.address)).add(1)
    }

    const accountLinkCosigner = BloctoAccount__factory.connect(account.address, cosignerWallet)
    const data = txData(1, testERC20.address, BigNumber.from(0),
      testERC20.interface.encodeFunctionData('transfer', [to, amount]))

    const sign = withChainId ? await signMessage(authorizedWallet, account.address, authorizeInAccountNonce, data) : await signMessageWithoutChainId(authorizedWallet, account.address, authorizeInAccountNonce, data)
    return await accountLinkCosigner.invoke1CosignerSends(sign.v, sign.r, sign.s, authorizeInAccountNonce, authorizedWallet.address, data)
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

    // next version Blocto Wallet
    const nextVersoinCloneableAccountSalt = hexZeroPad(Buffer.from('BloctoAccount_next_version', 'utf-8'), 32)
    implementationNextVersion = await create3Factory.getDeployed(await ethersSigner.getAddress(), nextVersoinCloneableAccountSalt)
    expect((await ethers.provider.getCode(implementationNextVersion))).to.equal('0x')
    await create3Factory.deploy(
      nextVersoinCloneableAccountSalt,
      getDeployCode(new BloctoAccountCloneableWallet__factory(), [entryPoint.address])
    )
    expect((await ethers.provider.getCode(implementationNextVersion))).not.equal('0x')
  })

  // upgrade from v140
  let accountV140: BloctoAccountV140
  let account: BloctoAccount
  it('create previous version account', async () => {
    expect(await factory.VERSION()).to.eql(NowVersion)

    accountV140 = await testCreateAccount(140, 0, factory, '1.4.0') as unknown as BloctoAccountV140
    expect(await accountV140.VERSION()).to.eql(NowVersion)
  })

  it('should send ERC20 token in accountV140', async () => {
    // prepare
    const receiveAccount = await testCreateAccount(236, 0, factory, '1.4.0')
    await testERC20.mint(accountV140.address, TWO_ETH)

    // test send ERC20
    const before = await testERC20.balanceOf(accountV140.address)
    const beforeRecevive = await testERC20.balanceOf(receiveAccount.address)

    await sendERC20(accountV140 as unknown as BloctoAccount, receiveAccount.address, ONE_ETH, false)

    expect(await testERC20.balanceOf(accountV140.address)).to.equal(before.sub(ONE_ETH))
    expect(await testERC20.balanceOf(receiveAccount.address)).to.equal(beforeRecevive.add(ONE_ETH))
  })

  it('should storage slot 3 is 0', async () => {
    // storage slot 3 data (v150 nonce location)
    const slot3Data = await ethers.provider.getStorageAt(accountV140.address, 3)
    // next version(v150) should be 0
    expect(slot3Data).to.equal(BigNumber.from(0))

    // storage slot 3 map data (v140 nonces location)
    const slot3MapHash = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(['address', 'uint'], [authorizedWallet.address, 3])
    )
    const slot3MapData = await ethers.provider.getStorageAt(accountV140.address, slot3MapHash)
    // because we send tx one time (sendERC20), so nonce is 1
    expect(slot3MapData).to.equal(BigNumber.from(1))
  })

  it('should not deploy again with create3', async () => {
    const accountSalt = hexZeroPad(Buffer.from('BloctoAccount_v140', 'utf-8'), 32)

    await expect(
      create3Factory.deploy(
        accountSalt,
        getDeployCode(new BloctoAccountCloneableWalletV140__factory(), [entryPoint.address])
      )
    ).to.be.revertedWith('DEPLOYMENT_FAILED')
  })

  it('should delpoy new cloneable wallet and upgrade factory ', async () => {
    implementation = implementationNextVersion

    // deploy BloctoAccountFactory next version
    const UpgradeContract = await ethers.getContractFactory('BloctoAccountFactory')
    factory = await upgrades.upgradeProxy(factory.address, UpgradeContract)
    await factory.setImplementation_1_5_1(implementationNextVersion)
    expect(await factory.VERSION()).to.eql(NextVersion)
  })

  it('should upgrade by account', async () => {
    await upgradeAccountToNewVersion(accountV140, implementation, false)
    account = accountV140 as unknown as BloctoAccount
    expect(await account.VERSION()).to.eql(NextVersion)
  })

  describe('wallet functions', () => {
    const AccountSalt = 123

    it('should not init account again', async () => {
      const account = await testCreateAccount(201)
      const tmpAccount = createTmpAccount()
      const link = await BloctoAccount__factory.connect(account.address, tmpAccount)
      const fakeAddr = '0x' + 'a'.repeat(40)
      await expect(link.init(fakeAddr, fakeAddr, fakeAddr, 1, '0x' + 'a'.repeat(64))).to.revertedWith('must not already be initialized')
    })

    it('should not init2 account again', async () => {
      const account = await testCreateAccount(209)
      const tmpAccount = createTmpAccount()
      const link = await BloctoAccount__factory.connect(account.address, tmpAccount)
      const fakeAddr = '0x' + 'a'.repeat(40)
      const tmpbytes32 = '0x' + 'a'.repeat(64)
      await expect(link.init2(
        [fakeAddr, fakeAddr],
        fakeAddr, fakeAddr,
        [1, 1],
        [tmpbytes32, tmpbytes32])).to.revertedWith('must not already be initialized')
    })

    it('should not initImplementation again', async () => {
      const account = await testCreateAccount(222)
      const tmpAccount = createTmpAccount()
      const link = await BloctoAccount__factory.connect(account.address, tmpAccount)
      await expect(link.initImplementation('0x' + 'a'.repeat(40))).to.revertedWith('must not already be initialized')
    })

    it('should initImplementation with a contract', async () => {
      const b = await new BloctoAccount__factory(ethersSigner).deploy(entryPoint.address)
      await expect(b.initImplementation('0x' + 'a'.repeat(40))).to.revertedWith('ERC1967: new implementation is not a contract')
    })

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

    it('should receive native token in upgrade account', async () => {
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

    it('should receive 0 native token', async () => {
      const account = await testCreateAccount(249)
      const [owner] = await ethers.getSigners()

      await owner.sendTransaction({
        to: account.address,
        value: 0 // Sends exactly 0.0 ether
      })
    })

    it('should send ERC20 token', async () => {
      // prepare
      const sendAccount = await testCreateAccount(2001)
      const receiveAccount = await testCreateAccount(2002)
      await testERC20.mint(sendAccount.address, TWO_ETH)

      // test send ERC20
      const before = await testERC20.balanceOf(sendAccount.address)
      const beforeRecevive = await testERC20.balanceOf(receiveAccount.address)

      const tx = await sendERC20(sendAccount, receiveAccount.address, ONE_ETH)
      if (ShowGasUsage) {
        const receipt = await tx.wait()
        console.log('send erc20 gasUsed: ', receipt.gasUsed)
      }

      expect(await testERC20.balanceOf(sendAccount.address)).to.equal(before.sub(ONE_ETH))
      expect(await testERC20.balanceOf(receiveAccount.address)).to.equal(beforeRecevive.add(ONE_ETH))
    })

    it('should send native token', async () => {
      // prepare
      const sendAccount = await testCreateAccount(2001352)
      const receiveAccount = await testCreateAccount(2002353)
      await fund(sendAccount.address, '5')

      // test send native token
      const before = await ethers.provider.getBalance(sendAccount.address)
      const beforeRecevive = await ethers.provider.getBalance(receiveAccount.address)

      // sign and send
      const authorizeInAccountNonce = (await sendAccount.nonce()).add(1)

      const accountLinkCosigner = BloctoAccount__factory.connect(sendAccount.address, cosignerWallet)
      const data = txData(1, receiveAccount.address, BigNumber.from(TWO_ETH), '0x')

      const sign = await signMessage(authorizedWallet, sendAccount.address, authorizeInAccountNonce, data)
      await accountLinkCosigner.invoke1CosignerSends(sign.v, sign.r, sign.s, authorizeInAccountNonce, authorizedWallet.address, data)

      expect(await ethers.provider.getBalance(sendAccount.address)).to.equal(before.sub(TWO_ETH))
      expect(await ethers.provider.getBalance(receiveAccount.address)).to.equal(beforeRecevive.add(TWO_ETH))
    })

    it('should send ERC20 token in upgrade account', async () => {
      // prepare
      const receiveAccount = await testCreateAccount(279)
      await testERC20.mint(account.address, TWO_ETH)
      // test send ERC20
      const before = await testERC20.balanceOf(account.address)
      const beforeRecevive = await testERC20.balanceOf(receiveAccount.address)
      await sendERC20(account, receiveAccount.address, ONE_ETH)

      expect(await account.VERSION()).to.equal(NextVersion)
      expect(await testERC20.balanceOf(account.address)).to.equal(before.sub(ONE_ETH))
      expect(await testERC20.balanceOf(receiveAccount.address)).to.equal(beforeRecevive.add(ONE_ETH))
    })

    it('should revert if invalid data length', async () => {
      // prepare
      const account = await testCreateAccount(276)
      await testERC20.mint(account.address, TWO_ETH)
      const receiveAccount = await testCreateAccount(277)
      const authorizeInAccountNonce = (await account.nonce()).add(1)
      const accountLinkCosigner = BloctoAccount__factory.connect(account.address, cosignerWallet)
      const data = txData(1, testERC20.address, BigNumber.from(0),
        testERC20.interface.encodeFunctionData('transfer', [receiveAccount.address, ONE_ETH]))

      const newData = data.slice(0, 70)
      const sign = await signMessage(authorizedWallet, account.address, authorizeInAccountNonce, newData)

      await expect(
        accountLinkCosigner.invoke1CosignerSends(sign.v, sign.r, sign.s, authorizeInAccountNonce, authorizedWallet.address, newData)
      ).to.revertedWith('data field too short')
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
      // console.log('createAccount with multiple authorized address gasUsed: ', receipt.gasUsed)
      let findWalletCreated = false
      receipt.events?.forEach((event) => {
        if (event.event === 'WalletCreated' &&
            event.args?.authorizedAddress === authorizedWallet2.address) {
          findWalletCreated = true
        }
      })
      expect(findWalletCreated).true
    })

    it('should create account with version 1.5.2', async () => {
      const [authorizedWallet2, cosignerWallet2, recoverWallet2] = createAuthorizedCosignerRecoverWallet()

      const [px, pxIndexWithParity] = getMergedKey(authorizedWallet2, cosignerWallet2, 0)

      const tx = await factory.createAccount_1_5_1(authorizedWallet2.address,
        cosignerWallet2.address, recoverWallet2.address,
        ethers.utils.hexZeroPad('0x409', 32), // random salt
        pxIndexWithParity,
        px)

      const receipt = await tx.wait()
      // console.log('createAccount with multiple authorized address gasUsed: ', receipt.gasUsed)
      let findWalletCreated = false
      receipt.events?.forEach((event) => {
        if (event.event === 'WalletCreated' &&
            event.args?.authorizedAddress === authorizedWallet2.address) {
          findWalletCreated = true
        }
      })
      expect(findWalletCreated).true
    })

    it('should predict version 1.5.2 address', async () => {
      const [authorizedWallet2, cosignerWallet2, recoverWallet2] = createAuthorizedCosignerRecoverWallet()

      const [px, pxIndexWithParity] = getMergedKey(authorizedWallet2, cosignerWallet2, 0)
      const salt = BigNumber.from(431)

      const forKeccak = ethers.utils.hexConcat([
        ethers.utils.hexZeroPad(salt.toHexString(), 32),
        cosignerWallet2.address, recoverWallet2.address
      ])

      const newSalt = keccak256(Buffer.from(ethers.utils.arrayify(forKeccak)))
      const tx = await factory.createAccount_1_5_1(authorizedWallet2.address,
        cosignerWallet2.address, recoverWallet2.address,
        newSalt,
        pxIndexWithParity,
        px)

      const predictAddr = await factory.getAddress(cosignerWallet2.address, recoverWallet2.address, salt)
      const receipt = await tx.wait()
      // console.log('createAccount with multiple authorized address gasUsed: ', receipt.gasUsed)
      let findWalletCreated = false
      receipt.events?.forEach((event) => {
        if (event.event === 'WalletCreated' &&
            event.args?.authorizedAddress === authorizedWallet2.address &&
            event.args?.wallet === predictAddr) {
          findWalletCreated = true
        }
      })

      expect(findWalletCreated).true
    })

    it('should create account with multiple authorized address of version v1.5.2', async () => {
      const [authorizedWallet2, cosignerWallet2, recoverWallet2] = createAuthorizedCosignerRecoverWallet()
      const authorizedWallet22 = createTmpAccount()

      const [px, pxIndexWithParity] = getMergedKey(authorizedWallet, cosignerWallet, 0)
      const [px2, pxIndexWithParity2] = getMergedKey(authorizedWallet2, cosignerWallet2, 1)

      const salt = 467
      const newSalt = get151SaltFromAddress(salt, cosignerWallet2.address, recoverWallet2.address)

      const predictAddr = await factory.getAddress(cosignerWallet2.address, recoverWallet2.address, BigNumber.from(salt))
      const predictAddr151 = await factory.getAddress_1_5_1(newSalt)

      const tx = await factory.createAccount2_1_5_1([authorizedWallet2.address, authorizedWallet22.address],
        cosignerWallet2.address, recoverWallet2.address,
        newSalt, // random salt
        [pxIndexWithParity, pxIndexWithParity2],
        [px, px2])

      const receipt = await tx.wait()
      // console.log('createAccount with multiple authorized address gasUsed: ', receipt.gasUsed)
      let findWalletCreated = false
      receipt.events?.forEach((event) => {
        if (event.event === 'WalletCreated' &&
            event.args?.authorizedAddress === authorizedWallet2.address &&
            event.args?.wallet === predictAddr &&
            event.args?.wallet === predictAddr151) {
          findWalletCreated = true
        }
      })
      expect(findWalletCreated).true
    })

    it('should send erc20 with invoke2', async () => {
      const account = await testCreateAccount(496)
      const receiver = createTmpAccount()
      await testERC20.mint(account.address, TWO_ETH)

      const erc20TransferData = txData(1, testERC20.address, BigNumber.from(0),
        testERC20.interface.encodeFunctionData('transfer', [receiver.address, ONE_ETH]))

      const newNonce = (await account.nonce()).add(1)

      // test send ERC20
      const before = await testERC20.balanceOf(account.address)
      const beforeRecevive = await testERC20.balanceOf(receiver.address)

      const sign = await signForInovke2(account.address, newNonce, erc20TransferData, authorizedWallet, cosignerWallet)
      const tx = await account.invoke2(newNonce, erc20TransferData, sign)
      if (ShowGasUsage) {
        const receipt = await tx.wait()
        console.log('send erc20 invoke2 gasUsed: ', receipt.gasUsed)
      }

      expect(await testERC20.balanceOf(account.address)).to.equal(before.sub(ONE_ETH))
      expect(await testERC20.balanceOf(receiver.address)).to.equal(beforeRecevive.add(ONE_ETH))
    })

    it('should send erc20 with invoke2 use Schnorr', async () => {
      const account = await testCreateAccount(540)
      const receiver = createTmpAccount()
      await testERC20.mint(account.address, TWO_ETH)

      const erc20TransferData = txData(1, testERC20.address, BigNumber.from(0),
        testERC20.interface.encodeFunctionData('transfer', [receiver.address, ONE_ETH]))

      const newNonce = (await account.nonce()).add(1)

      // test send ERC20
      const before = await testERC20.balanceOf(account.address)
      const beforeRecevive = await testERC20.balanceOf(receiver.address)

      const sign = await signForInovke2(account.address, newNonce, erc20TransferData, authorizedWallet, cosignerWallet, true, 0)
      const tx = await account.invoke2(newNonce, erc20TransferData, sign)
      if (ShowGasUsage) {
        const receipt = await tx.wait()
        console.log('send erc20 invoke2 gasUsed (Schnorr): ', receipt.gasUsed)
      }

      expect(await testERC20.balanceOf(account.address)).to.equal(before.sub(ONE_ETH))
      expect(await testERC20.balanceOf(receiver.address)).to.equal(beforeRecevive.add(ONE_ETH))
    })

    it('should revert if wrong cosigner for invoke2()', async () => {
      const account = await testCreateAccount(516)
      const receiver = createTmpAccount()
      await testERC20.mint(account.address, TWO_ETH)

      const erc20TransferData = txData(1, testERC20.address, BigNumber.from(0),
        testERC20.interface.encodeFunctionData('transfer', [receiver.address, ONE_ETH]))

      const newNonce = (await account.nonce()).add(1)

      const sign = await signForInovke2(account.address, newNonce, erc20TransferData, authorizedWallet, receiver)
      // await account.invoke2(newNonce, erc20TransferData, sign)
      await expect(
        account.invoke2(newNonce, erc20TransferData, sign)
      ).to.revertedWith('invalid signature')
    })

    it('should revert if wrong nonce for invoke2()', async () => {
      const account = await testCreateAccount(533)
      const receiver = createTmpAccount()
      await testERC20.mint(account.address, TWO_ETH)

      const erc20TransferData = txData(1, testERC20.address, BigNumber.from(0),
        testERC20.interface.encodeFunctionData('transfer', [receiver.address, ONE_ETH]))

      const newNonce = (await account.nonce()).add(1000)

      const sign = await signForInovke2(account.address, newNonce, erc20TransferData, authorizedWallet, cosignerWallet)
      // await account.invoke2(newNonce, erc20TransferData, sign)
      await expect(
        account.invoke2(newNonce, erc20TransferData, sign)
      ).to.revertedWith('must use valid nonce')
    })

    it('should revert when send erc20 with simulateInvoke2', async () => {
      const account = await testCreateAccount(551)
      const receiver = createTmpAccount()
      await testERC20.mint(account.address, TWO_ETH)

      const erc20TransferData = txData(1, testERC20.address, BigNumber.from(0),
        testERC20.interface.encodeFunctionData('transfer', [receiver.address, ONE_ETH]))

      const newNonce = (await account.nonce()).add(1)

      const ret = await account.callStatic.simulateInvoke2(
        newNonce, erc20TransferData, new Uint8Array(65)
      ).catch(e => e.errorArgs)
      expect(ret.targetSuccess).to.be.true
    })

    it('should revert when send erc20 with simulateInvoke2 use fake schnorr', async () => {
      const account = await testCreateAccount(624)
      const receiver = createTmpAccount()
      await testERC20.mint(account.address, TWO_ETH)

      const erc20TransferData = txData(1, testERC20.address, BigNumber.from(0),
        testERC20.interface.encodeFunctionData('transfer', [receiver.address, ONE_ETH]))

      const newNonce = (await account.nonce()).add(1)

      const fakeSchnorrSign = '2'.repeat(128) + '80'
      const schnorrAry = Uint8Array.from(Buffer.from(fakeSchnorrSign, 'hex')) // Buffer.from(fakeSchnorrSign, 'hex')

      const ret = await account.callStatic.simulateInvoke2(
        newNonce, erc20TransferData, schnorrAry
      ).catch(e => e.errorArgs)
      expect(ret.targetSuccess).to.be.true
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

      await factory.setImplementation_1_5_1(implementationV200.address)
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
      const randomSalt = 538
      const accountNew = await testCreateAccount(randomSalt)

      expect(await accountNew.VERSION()).to.eql('2.0.0')
    })

    it('should entrypoint be v070 address', async () => {
      expect(await accountV200.entryPoint()).to.eql(MockEntryPointV070)
    })
  })

  describe('4337 functions', () => {
    let account: BloctoAccount
    let factory: BloctoAccountFactory

    before(async () => {
      const accountContractSalt = hexZeroPad(Buffer.from('BloctoAccount_test_4337', 'utf-8'), 32)
      await create3Factory.deploy(
        accountContractSalt,
        getDeployCode(new BloctoAccountCloneableWallet__factory(), [entryPoint.address])
      )

      implementation = await create3Factory.getDeployed(await ethersSigner.getAddress(), accountContractSalt)
      expect((await ethers.provider.getCode(implementation))).not.equal('0x')
      const BloctoAccountFactory = await ethers.getContractFactory('BloctoAccountFactory')
      const create3Salt = hexZeroPad(Buffer.from('AccountFactory_test_4337', 'utf-8'), 32)
      factory = await create3DeployTransparentProxy(BloctoAccountFactory,
        [implementation, entryPoint.address, await ethersSigner.getAddress()],
        { initializer: 'initialize' }, create3Factory, ethersSigner, create3Salt)
      await factory.grantRole(await factory.CREATE_ACCOUNT_ROLE(), await ethersSigner.getAddress())
      await factory.setImplementation_1_5_1(implementation)

      account = await testCreateAccount(433700, 0, factory)
    })

    it('should execute transfer ERC20 from entrypoint', async () => {
      const receiver = createTmpAccount()
      const beneficiaryAddress = createTmpAccount().address
      await testERC20.mint(account.address, TWO_ETH)
      const erc20Transfer = await testERC20.populateTransaction.transfer(receiver.address, ONE_ETH)
      const accountExecFromEntryPoint = await account.populateTransaction.execute(testERC20.address, 0, erc20Transfer.data!)

      const op1 = await fillSignWithEIP191V0({
        callData: accountExecFromEntryPoint.data,
        sender: account.address,
        callGasLimit: 2e6,
        verificationGasLimit: 1e5
      }, authorizedWallet, cosignerWallet, entryPoint, account.address)

      // start test
      // test send ERC20
      const beforeRecevive = await testERC20.balanceOf(receiver.address)
      await entryPoint.handleOps([op1], beneficiaryAddress).catch((rethrow())).then(async r => r!.wait())

      expect(await testERC20.balanceOf(receiver.address)).to.equal(beforeRecevive.add(ONE_ETH))
    })

    it('should revert execute transfer ERC20 from entrypoint with error signature', async () => {
      const [authorizedWallet2, cosignerWallet2] = createAuthorizedCosignerRecoverWallet()
      const receiver = createTmpAccount()
      const beneficiaryAddress = createTmpAccount().address
      await testERC20.mint(account.address, TWO_ETH)
      const erc20Transfer = await testERC20.populateTransaction.transfer(receiver.address, ONE_ETH)
      const accountExecFromEntryPoint = await account.populateTransaction.execute(testERC20.address, 0, erc20Transfer.data!)

      const op1 = await fillSignWithEIP191V0({
        callData: accountExecFromEntryPoint.data,
        sender: account.address,
        callGasLimit: 2e6,
        verificationGasLimit: 1e5
      }, authorizedWallet2, cosignerWallet2, entryPoint, account.address)

      // start test
      await expect(entryPoint.handleOps([op1], beneficiaryAddress)).to.be.reverted
    })

    it('should execute approve ERC20 from entrypoint', async () => {
      const approveAddr = createTmpAccount()
      const beneficiaryAddress = createTmpAccount().address
      const erc20 = await testERC20.populateTransaction.approve(approveAddr.address, FIVE_ETH)
      const accountExecFromEntryPoint = await account.populateTransaction.execute(testERC20.address, 0, erc20.data!)

      const op1 = await fillSignWithEIP191V0({
        callData: accountExecFromEntryPoint.data,
        sender: account.address,
        callGasLimit: 2e6,
        verificationGasLimit: 1e5
      }, authorizedWallet, cosignerWallet, entryPoint, account.address)

      // start test
      // test send ERC20
      expect(await testERC20.allowance(account.address, approveAddr.address)).to.equal(0)

      await entryPoint.handleOps([op1], beneficiaryAddress).catch((rethrow())).then(async r => r!.wait())

      expect(await testERC20.allowance(account.address, approveAddr.address)).to.equal(FIVE_ETH)
    })

    it('should revert execute transfer ERC20 from entrypoint', async () => {
      const account2 = await testCreateAccount(433702, 0, factory)
      const beneficiaryAddress = createTmpAccount().address
      // 0xf2fde38a: any non-exist function
      const accountExecFromEntryPoint = await account2.populateTransaction.execute(testERC20.address, 0, '0xf2fde38a')

      const op1 = await fillSignWithEIP191V0({
        callData: accountExecFromEntryPoint.data,
        sender: account2.address,
        callGasLimit: 500,
        verificationGasLimit: 1e5
      }, authorizedWallet, cosignerWallet, entryPoint, account.address)

      // start test
      await expect(entryPoint.handleOps([op1], beneficiaryAddress)).to.revertedWith('VM Exception while processing transaction: reverted with an unrecognized custom error')
    })

    it('should executeBatch transfer ERC20 from entrypoint', async () => {
      const receiver1 = createTmpAccount()
      const receiver2 = createTmpAccount()
      const beneficiaryAddress = createTmpAccount().address
      await testERC20.mint(account.address, TWO_ETH)
      const erc20Transfer1 = await testERC20.populateTransaction.transfer(receiver1.address, ONE_ETH)
      const erc20Transfer2 = await testERC20.populateTransaction.transfer(receiver2.address, ONE_ETH)
      const accountExecFromEntryPoint = await account.populateTransaction.executeBatch(
        [testERC20.address, testERC20.address],
        [0, 0], [erc20Transfer1.data!, erc20Transfer2.data!])

      const op1 = await fillSignWithEIP191V0({
        callData: accountExecFromEntryPoint.data,
        sender: account.address,
        callGasLimit: 2e6,
        verificationGasLimit: 1e5
      }, authorizedWallet, cosignerWallet, entryPoint, account.address)

      // start test
      // test send ERC20
      const beforeRecevive1 = await testERC20.balanceOf(receiver1.address)
      const beforeRecevive2 = await testERC20.balanceOf(receiver2.address)

      await entryPoint.handleOps([op1], beneficiaryAddress).catch((rethrow())).then(async r => r!.wait())

      expect(await testERC20.balanceOf(receiver1.address)).to.equal(beforeRecevive1.add(ONE_ETH))
      expect(await testERC20.balanceOf(receiver2.address)).to.equal(beforeRecevive2.add(ONE_ETH))
    })

    it('should deposit & getDeposit by anyone', async () => {
      const depositor = createTmpAccount()
      await fund(depositor.address, '2')
      const accountLinkDepositor = await BloctoAccount__factory.connect(account.address, depositor)
      const beforeDeposit = await account.getDeposit()
      await accountLinkDepositor.addDeposit({ value: ONE_ETH })
      expect(await account.getDeposit()).to.equal(beforeDeposit.add(ONE_ETH))
    })

    it('should withdraw deposit', async () => {
      const beneficiary = createTmpAccount()
      const depositor = createTmpAccount()
      await fund(depositor.address, '2')
      const accountLinkDepositor = await BloctoAccount__factory.connect(account.address, depositor)
      await accountLinkDepositor.addDeposit({ value: ONE_ETH })

      const withdrawDepositToTx = await account.populateTransaction.withdrawDepositTo(beneficiary.address, ONE_ETH)
      const accountExecFromEntryPoint = await account.populateTransaction.execute(account.address, 0, withdrawDepositToTx.data!)

      const op1 = await fillSignWithEIP191V0({
        callData: accountExecFromEntryPoint.data,
        sender: account.address,
        callGasLimit: 2e6,
        verificationGasLimit: 1e5
      }, authorizedWallet, cosignerWallet, entryPoint, account.address)

      const beforeRecevive = await ethers.provider.getBalance(beneficiary.address)
      await entryPoint.handleOps([op1], depositor.address).catch((rethrow())).then(async r => r!.wait())
      expect(await ethers.provider.getBalance(beneficiary.address)).to.equal(beforeRecevive.add(ONE_ETH))
    })

    it('should revert withdraw deposit if call from other address', async () => {
      const tmpAccount = createTmpAccount()
      const accountLink = await BloctoAccount__factory.connect(account.address, tmpAccount)
      await expect(accountLink.withdrawDepositTo(tmpAccount.address, ONE_ETH)).to.revertedWith('must be called from `invoke()`')
    })
  })

  // for Blocto Account Factory
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

  // for Blocto Account Factory
  describe('factory functions', () => {
    let factory: BloctoAccountFactory
    let factoryCreateAccountRole: BloctoAccountFactory
    const createAccountRoleEOA = createTmpAccount()

    before(async () => {
      factory = await new BloctoAccountFactory__factory(ethersSigner).deploy()
    })

    it('should implementation not be zero address', async () => {
      await expect(factory.initialize(zeroAddress(), entryPoint.address, await ethersSigner.getAddress())).to.revertedWith('Invalid implementation address.')
    })

    it('should init factory', async () => {
      await factory.initialize(implementation, entryPoint.address, await ethersSigner.getAddress())
    })

    it('should not initiate again', async () => {
      const tmpAccount = createTmpAccount()
      const factoryLink = await BloctoAccountFactory__factory.connect(factory.address, tmpAccount)
      await expect(factoryLink.initialize('0x' + 'a'.repeat(40), '0x' + 'b'.repeat(40), '0x' + 'c'.repeat(40))).to.revertedWith('Initializable: contract is already initialized')
    })

    it('should revert if sender is not grant role for createAccount', async () => {
      const [px, pxIndexWithParity] = getMergedKey(authorizedWallet, cosignerWallet, 0)
      await expect(
        createAccount(
          ethersSigner,
          await authorizedWallet.getAddress(),
          await cosignerWallet.getAddress(),
          await recoverWallet.getAddress(),
          BigNumber.from(767),
          pxIndexWithParity,
          px,
          factory
        )
      ).to.revertedWith('caller is not a create account role')
    })

    it('should revert if sender is not grant role for createAccount of version 1.5.2', async () => {
      const [px, pxIndexWithParity] = getMergedKey(authorizedWallet, cosignerWallet, 0)
      await expect(
        createAccountV151(
          ethersSigner,
          await authorizedWallet.getAddress(),
          await cosignerWallet.getAddress(),
          await recoverWallet.getAddress(),
          BigNumber.from(785),
          pxIndexWithParity,
          px,
          factory
        )
      ).to.revertedWith('caller is not a create account role')
    })

    it('should revert if sender is not grant role for createAccount2', async () => {
      const [authorizedWallet2, cosignerWallet2, recoverWallet2] = createAuthorizedCosignerRecoverWallet()
      const authorizedWallet22 = createTmpAccount()

      const [px, pxIndexWithParity] = getMergedKey(authorizedWallet, cosignerWallet, 0)
      const [px2, pxIndexWithParity2] = getMergedKey(authorizedWallet2, cosignerWallet2, 1)

      await expect(
        factory.createAccount2([authorizedWallet2.address, authorizedWallet22.address],
          cosignerWallet2.address, recoverWallet2.address,
          510, // random salt
          [pxIndexWithParity, pxIndexWithParity2],
          [px, px2])
      ).to.revertedWith('caller is not a create account role')
    })

    it('should revert if sender is not grant role for createAccount2 of version 1.5.2', async () => {
      const [authorizedWallet2, cosignerWallet2, recoverWallet2] = createAuthorizedCosignerRecoverWallet()
      const authorizedWallet22 = createTmpAccount()

      const [px, pxIndexWithParity] = getMergedKey(authorizedWallet, cosignerWallet, 0)
      const [px2, pxIndexWithParity2] = getMergedKey(authorizedWallet2, cosignerWallet2, 1)

      await expect(
        factory.createAccount2_1_5_1([authorizedWallet2.address, authorizedWallet22.address],
          cosignerWallet2.address, recoverWallet2.address,
          ethers.utils.hexZeroPad('0x817', 32),
          [pxIndexWithParity, pxIndexWithParity2],
          [px, px2])
      ).to.revertedWith('caller is not a create account role')
    })

    it('should revert if sender is not grant role for createAccount of version 1.5.2', async () => {
      const erc20Receiver = createTmpAccount()
      const erc20TransferData = txData(1, testERC20.address, BigNumber.from(0),
        testERC20.interface.encodeFunctionData('transfer', [erc20Receiver.address, ONE_ETH]))

      const [px, pxIndexWithParity] = getMergedKey(authorizedWallet, cosignerWallet, 0)
      await expect(
        factory.createAccountWithInvoke2(
          authorizedWallet.address,
          cosignerWallet.address,
          recoverWallet.address,
          ethers.utils.hexZeroPad('0x817', 32),
          pxIndexWithParity,
          px,
          { nonce: BigNumber.from(1), data: erc20TransferData, signature: ethers.utils.hexZeroPad('0xaaa', 64) }
        )
      ).to.revertedWith('caller is not a create account role')
    })
    it('should revert if sender is not grant role for createAccount2WithInvoke2()', async () => {
      const [authorizedWallet2, cosignerWallet2, recoverWallet2] = createAuthorizedCosignerRecoverWallet()
      const authorizedWallet22 = createTmpAccount()

      const [px, pxIndexWithParity] = getMergedKey(authorizedWallet, cosignerWallet, 0)
      const [px2, pxIndexWithParity2] = getMergedKey(authorizedWallet2, cosignerWallet2, 1)

      const erc20Receiver = createTmpAccount()
      const erc20TransferData = txData(1, testERC20.address, BigNumber.from(0),
        testERC20.interface.encodeFunctionData('transfer', [erc20Receiver.address, ONE_ETH]))

      await expect(
        factory.createAccount2WithInvoke2(
          [authorizedWallet2.address, authorizedWallet22.address],
          cosignerWallet2.address, recoverWallet2.address,
          ethers.utils.hexZeroPad('0x817', 32),
          [pxIndexWithParity, pxIndexWithParity2],
          [px, px2],
          { nonce: BigNumber.from(1), data: erc20TransferData, signature: ethers.utils.hexZeroPad('0xaaa', 64) }
        )
      ).to.revertedWith('caller is not a create account role')
    })

    it('should revert if sender is not grant role for setImplementation', async () => {
      const tmpAccount = createTmpAccount()
      const factoryLink = await BloctoAccountFactory__factory.connect(factory.address, tmpAccount)
      await expect(
        factoryLink.setImplementation('0x' + 'a'.repeat(40))
      ).to.revertedWith('caller is not a create account role')
    })

    it('should revert if setImplementation with zero address', async () => {
      await expect(
        factory.setImplementation(zeroAddress())
      ).to.revertedWith('invalid implementation address.')
    })

    it('should revert if sender is not grant role for setImplementation_1_5_1', async () => {
      const tmpAccount = createTmpAccount()
      const factoryLink = await BloctoAccountFactory__factory.connect(factory.address, tmpAccount)
      await expect(
        factoryLink.setImplementation_1_5_1('0x' + 'a'.repeat(40))
      ).to.revertedWith('caller is not a create account role')
    })

    it('should revert if setImplementation_1_5_1 with zero address', async () => {
      await expect(
        factory.setImplementation_1_5_1(zeroAddress())
      ).to.revertedWith('invalid implementation address.')
    })

    // it's not good for set implementation same as implementation150Plus
    it('should set implementation', async () => {
      await factory.setImplementation(implementation)
      expect(
        await factory.bloctoAccountImplementation()
      ).to.equal(implementation)
    })

    it('should set implementation of version 1.5.2', async () => {
      await factory.setImplementation_1_5_1(implementationNextVersion)
      expect(
        await factory.bloctoAccountImplementation151Plus()
      ).to.equal(implementationNextVersion)
    })

    it('should grant create account role', async () => {
      await factory.grantRole(await factory.CREATE_ACCOUNT_ROLE(), createAccountRoleEOA.address)
      expect(await factory.hasRole(await factory.CREATE_ACCOUNT_ROLE(), createAccountRoleEOA.address)).true
      await fund(createAccountRoleEOA.address)
      factoryCreateAccountRole = BloctoAccountFactory__factory.connect(factory.address, createAccountRoleEOA)
    })

    it('should create account and run tx from createAccountWithInvoke2', async () => {
      // prepare account auth
      const [authorizedEOA, cosignerEOA, recoverEOA] = createAuthorizedCosignerRecoverWallet()
      const salt = 983
      const newSalt = get151SaltFromAddress(salt, cosignerEOA.address, recoverEOA.address)
      const predictAddr151 = await factoryCreateAccountRole.getAddress_1_5_1(newSalt)
      const [px, pxIndexWithParity] = getMergedKey(authorizedEOA, cosignerEOA, 0)

      // prepare account first tx
      const erc20Receiver = createTmpAccount()
      await testERC20.mint(predictAddr151, TWO_ETH)
      const erc20TransferData = txData(1, testERC20.address, BigNumber.from(0),
        testERC20.interface.encodeFunctionData('transfer', [erc20Receiver.address, ONE_ETH]))

      const newNonce = BigNumber.from(1)
      const sign = await signForInovke2(predictAddr151, newNonce, erc20TransferData, authorizedEOA, cosignerEOA)

      // run createAccountWithInvoke2
      const before = await testERC20.balanceOf(predictAddr151)
      const beforeRecevive = await testERC20.balanceOf(erc20Receiver.address)

      const tx = await factoryCreateAccountRole.createAccountWithInvoke2(
        await authorizedEOA.getAddress(),
        await cosignerEOA.getAddress(),
        await recoverEOA.getAddress(),
        newSalt,
        pxIndexWithParity,
        px,
        { nonce: newNonce, data: erc20TransferData, signature: sign }
      )

      expect(await testERC20.balanceOf(predictAddr151)).to.equal(before.sub(ONE_ETH))
      expect(await testERC20.balanceOf(erc20Receiver.address)).to.equal(beforeRecevive.add(ONE_ETH))

      const receipt = await tx.wait()
      if (ShowGasUsage) {
        console.log('createAccountWithInvoke2 gasUsed', receipt.gasUsed.toString())
      }
      let findWalletCreated = false
      receipt.events?.forEach((event) => {
        if (event.event === 'WalletCreated' &&
            event.args?.authorizedAddress === authorizedEOA.address &&
            event.args?.wallet === predictAddr151) {
          findWalletCreated = true
        }
      })
      expect(findWalletCreated).true
    })

    it('should create account and run tx from createAccountWithInvoke2 use Schnorr', async () => {
      // prepare account auth
      const mergedKeyIndex = 0
      const [authorizedEOA, cosignerEOA, recoverEOA] = createAuthorizedCosignerRecoverWallet()
      const salt = 1120
      const newSalt = get151SaltFromAddress(salt, cosignerEOA.address, recoverEOA.address)
      const predictAddr151 = await factoryCreateAccountRole.getAddress_1_5_1(newSalt)
      const [px, pxIndexWithParity] = getMergedKey(authorizedEOA, cosignerEOA, mergedKeyIndex)

      // prepare account first tx
      const erc20Receiver = createTmpAccount()
      await testERC20.mint(predictAddr151, TWO_ETH)
      const erc20TransferData = txData(1, testERC20.address, BigNumber.from(0),
        testERC20.interface.encodeFunctionData('transfer', [erc20Receiver.address, ONE_ETH]))

      const newNonce = BigNumber.from(1)
      const sign = await signForInovke2(predictAddr151, newNonce, erc20TransferData, authorizedEOA, cosignerEOA, true, mergedKeyIndex)

      // run createAccountWithInvoke2
      const before = await testERC20.balanceOf(predictAddr151)
      const beforeRecevive = await testERC20.balanceOf(erc20Receiver.address)

      const tx = await factoryCreateAccountRole.createAccountWithInvoke2(
        await authorizedEOA.getAddress(),
        await cosignerEOA.getAddress(),
        await recoverEOA.getAddress(),
        newSalt,
        pxIndexWithParity,
        px,
        { nonce: newNonce, data: erc20TransferData, signature: sign }
      )

      expect(await testERC20.balanceOf(predictAddr151)).to.equal(before.sub(ONE_ETH))
      expect(await testERC20.balanceOf(erc20Receiver.address)).to.equal(beforeRecevive.add(ONE_ETH))

      const receipt = await tx.wait()
      if (ShowGasUsage) {
        console.log('createAccountWithInvoke2 gasUsed use Schnorr', receipt.gasUsed.toString())
      }
      let findWalletCreated = false
      receipt.events?.forEach((event) => {
        if (event.event === 'WalletCreated' &&
            event.args?.authorizedAddress === authorizedEOA.address &&
            event.args?.wallet === predictAddr151) {
          findWalletCreated = true
        }
      })
      expect(findWalletCreated).true
    })

    it('should create account and run tx from createAccount2WithInvoke2', async () => {
      // prepare account auth
      const [authorizedEOA, cosignerEOA, recoverEOA] = createAuthorizedCosignerRecoverWallet()
      const [authorizedEOA2, cosignerEOA2, _] = createAuthorizedCosignerRecoverWallet()
      const salt = 935
      const newSalt = get151SaltFromAddress(salt, cosignerEOA.address, recoverEOA.address)
      const predictAddr151 = await factoryCreateAccountRole.getAddress_1_5_1(newSalt)
      const [px, pxIndexWithParity] = getMergedKey(authorizedEOA, cosignerEOA, 0)
      const [px2, pxIndexWithParity2] = getMergedKey(authorizedEOA2, cosignerEOA2, 1)

      // prepare account first tx
      const erc20Receiver = createTmpAccount()
      await testERC20.mint(predictAddr151, TWO_ETH)
      const erc20TransferData = txData(1, testERC20.address, BigNumber.from(0),
        testERC20.interface.encodeFunctionData('transfer', [erc20Receiver.address, ONE_ETH]))

      const newNonce = BigNumber.from(1)
      const sign = await signForInovke2(predictAddr151, newNonce, erc20TransferData, authorizedEOA, cosignerEOA)

      // run createAccountWithInvoke2
      const before = await testERC20.balanceOf(predictAddr151)
      const beforeRecevive = await testERC20.balanceOf(erc20Receiver.address)

      const tx = await factoryCreateAccountRole.createAccount2WithInvoke2(
        [authorizedEOA.address, authorizedEOA2.address],
        cosignerEOA.address, recoverEOA.address,
        newSalt,
        [pxIndexWithParity, pxIndexWithParity2],
        [px, px2],
        { nonce: newNonce, data: erc20TransferData, signature: sign }
      )

      expect(await testERC20.balanceOf(predictAddr151)).to.equal(before.sub(ONE_ETH))
      expect(await testERC20.balanceOf(erc20Receiver.address)).to.equal(beforeRecevive.add(ONE_ETH))

      const receipt = await tx.wait()
      let findWalletCreated = false
      receipt.events?.forEach((event) => {
        if (event.event === 'WalletCreated' &&
            event.args?.authorizedAddress === authorizedEOA.address &&
            event.args?.wallet === predictAddr151) {
          findWalletCreated = true
        }
      })
      expect(findWalletCreated).true
    })
  })

  describe('should create account if account has create account role', () => {
    it('shoule crate account with grant role', async () => {
      // create account
      const createAccountWallet = await createTmpAccount()
      await fund(createAccountWallet.address)
      // grant account role
      await factory.grantRole(await factory.CREATE_ACCOUNT_ROLE(), createAccountWallet.address)
      expect(await factory.hasRole(await factory.CREATE_ACCOUNT_ROLE(), createAccountWallet.address)).true

      // create account with createAccountWallet
      const factoryWithCreateAccount = BloctoAccountFactory__factory.connect(factory.address, createAccountWallet)
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

  describe('EOA entrypoint for _call fail test', () => {
    let account: BloctoAccount
    let accountLinkEntrypoint: BloctoAccount
    let factory: BloctoAccountFactory
    const entrypointEOA = createTmpAccount()

    before(async () => {
      const accountContractSalt = hexZeroPad(Buffer.from('test_call_account', 'utf-8'), 32)
      await create3Factory.deploy(
        accountContractSalt,
        getDeployCode(new BloctoAccountCloneableWallet__factory(), [entrypointEOA.address])
      )

      implementation = await create3Factory.getDeployed(await ethersSigner.getAddress(), accountContractSalt)
      expect((await ethers.provider.getCode(implementation))).not.equal('0x')
      const BloctoAccountFactory = await ethers.getContractFactory('BloctoAccountFactory')
      const create3Salt = hexZeroPad(Buffer.from('test_call_factory', 'utf-8'), 32)
      factory = await create3DeployTransparentProxy(BloctoAccountFactory,
        [implementation, entrypointEOA.address, await ethersSigner.getAddress()],
        { initializer: 'initialize' }, create3Factory, ethersSigner, create3Salt)
      await factory.grantRole(await factory.CREATE_ACCOUNT_ROLE(), await ethersSigner.getAddress())

      // create account with entrypoint EOA
      const mergedKeyIndex = 0
      const [px, pxIndexWithParity] = getMergedKey(authorizedWallet, cosignerWallet, mergedKeyIndex)

      account = await createAccount(
        ethersSigner,
        await authorizedWallet.getAddress(),
        await cosignerWallet.getAddress(),
        await recoverWallet.getAddress(),
        BigNumber.from(6346346),
        pxIndexWithParity,
        px,
        factory
      )

      accountLinkEntrypoint = await BloctoAccount__factory.connect(account.address, entrypointEOA)
    })

    it('should revert for execute non exist function', async () => {
      // const accountLinkEntrypoint = await BloctoAccount__factory.connect(account.address, entrypointEOA)
      await expect(accountLinkEntrypoint.execute(testERC20.address, 0, '0xf2fde38a'))
        .to.be.reverted
    })

    it('should revert for execute batch with wrong array length', async () => {
      const receiver1 = await createTmpAccount()
      const receiver2 = await createTmpAccount()
      const erc20Transfer1 = await testERC20.populateTransaction.transfer(receiver1.address, ONE_ETH)
      const erc20Transfer2 = await testERC20.populateTransaction.transfer(receiver2.address, ONE_ETH)
      await expect(
        accountLinkEntrypoint.executeBatch(
          [testERC20.address],
          [0, 0], [erc20Transfer1.data!, erc20Transfer2.data!])
      ).to.be.revertedWith('wrong array lengths')
    })

    it('should revert for execute batch with wrong array length 2', async () => {
      const receiver1 = await createTmpAccount()
      const erc20Transfer1 = await testERC20.populateTransaction.transfer(receiver1.address, ONE_ETH)
      await expect(
        accountLinkEntrypoint.executeBatch(
          [testERC20.address, testERC20.address],
          [0, 0], [erc20Transfer1.data!])
      ).to.be.revertedWith('wrong array lengths')
    })
  })
})
