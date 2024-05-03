import { ethers } from 'hardhat'
import { Wallet, BigNumber, ContractTransaction } from 'ethers'
import { expect } from 'chai'
import {
  BloctoAccount,
  BloctoAccount__factory,
  BloctoAccountV140__factory,
  BloctoAccountCloneableWallet__factory,
  CREATE3Factory,
  TestERC20,
  TestERC20__factory,
  BloctoAccountFactory__factory,
  BloctoAccountFactory,
  CREATE3Factory__factory,
  BloctoAccountFactoryBase,
  ModuleManager
} from '../typechain'
import { EntryPoint } from '@account-abstraction/contracts'

import {
  fund,
  createTmpAccount,
  createAccount,
  createAccountV151,
  createAccountV153,
  createAccountV154,
  deployEntryPoint,
  deployModuleManager,
  ONE_ETH,
  TWO_ETH,
  createAuthorizedCosignerRecoverWallet,
  createAuthorizedCosignerRecoverWallet2,
  txData,
  signMessage,
  getMergedKey,
  signMessageWithoutChainId,
  signForInovke2,
  get151SaltFromAddress,
  RevertFlag,
  txAppendData,
  logBytes,
  deployBloctoWalletV153,
  deployBloctoWalletV154
} from './testutils'
import '@openzeppelin/hardhat-upgrades'
import { hexZeroPad, concat } from '@ethersproject/bytes'
import { deployCREATE3Factory, getDeployCode } from '../src/create3Factory'
import { create3DeployTransparentProxy } from '../src/deployAccountFactoryWithCreate3'
import { zeroAddress } from 'ethereumjs-util'
import { parseEther, keccak256 } from 'ethers/lib/utils'
import { mod } from '@nomicfoundation/ethereumjs-evm/dist/opcodes'

const ShowGasUsage = false

function randNumber(): number {
  return Math.floor(Math.random() * (1000000000000000))
}

describe('BloctoAccount Test', function () {
  const ethersSigner = ethers.provider.getSigner(0)

  let authorizedWallet: Wallet
  let cosignerWallet: Wallet
  let recoverWallet: Wallet

  let implementation: string
  let factory: BloctoAccountFactory

  let entryPoint: EntryPoint

  let moduleManager: ModuleManager

  let create3Factory: CREATE3Factory

  let testERC20: TestERC20

  const NextVersion = '1.5.4'

  let account: BloctoAccount

  async function testCreateAccount(salt = 0, mergedKeyIndex = 0, ifactory = factory, version = NextVersion): Promise<BloctoAccount> {
    const newSalt = keccak256(concat([
      hexZeroPad(BigNumber.from(salt).toHexString(), 32),
      await cosignerWallet.getAddress(),
      await recoverWallet.getAddress()
    ]))
    const accountAddress = await factory.getAddress_1_5_1(newSalt)
    if ((await ethers.provider.getCode(accountAddress)) !== '0x') {
      console.log(`Using Existed BloctoAccount (${accountAddress})!`)
      return BloctoAccount__factory.connect(accountAddress, ethersSigner)
    }
    console.log(`Deploying to BloctoAccount (${accountAddress})...`)

    const [px, pxIndexWithParity] = getMergedKey(authorizedWallet, cosignerWallet, mergedKeyIndex)

    let retAccount = null
    switch (version) {
      case '1.4.0':
        retAccount = await createAccount(
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
        console.log('use 1.5.2')
        retAccount = await createAccountV151(
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
      case '1.5.3':
        console.log('use 1.5.3')
        retAccount = await createAccountV153(
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
      case '1.5.4':
      default:
        console.log('use 1.5.4')
        retAccount = await createAccountV154(
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
    await fund(retAccount)

    return retAccount
  }

  // use authorizedWallet and cosignerWallet to send ERC20 from wallet
  async function sendERC20(iAccount: BloctoAccount, to: string, amount: BigNumber, withChainId: boolean = true): Promise<ContractTransaction> {
    // const authorizeInAccountNonce = (await account.nonces(authorizedWallet.address)).add(1)
    let authorizeInAccountNonce: BigNumber
    if (withChainId) {
      iAccount = iAccount as BloctoAccount
      authorizeInAccountNonce = (await iAccount.nonce()).add(1)
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

  async function mint1000testERC20(target: string, leastAmount: BigNumber, erc20: TestERC20 = testERC20): Promise<BigNumber> {
    const before = await erc20.balanceOf(target)
    if (before.lt(leastAmount)) {
      console.log(`mint 1000 ${await erc20.symbol()} to ${target}`)
      const mintWait = await erc20.mint(target, parseEther('1000'))
      await mintWait.wait()
      return await before.add(parseEther('1000'))
    }
    return before
  }

  before(async function () {
    this.timeout(90000)
    console.log('test with signer: ', await ethersSigner.getAddress());
    // 3 wallet
    [authorizedWallet, cosignerWallet, recoverWallet] = createAuthorizedCosignerRecoverWallet()
    await fund(cosignerWallet.address)
    // 4337
    entryPoint = await deployEntryPoint()
    // module manager
    moduleManager = await deployModuleManager()
    // create3 factory
    create3Factory = await deployCREATE3Factory(ethersSigner)

    const v153 = await deployBloctoWalletV153(ethersSigner, create3Factory, entryPoint.address, moduleManager.address)
    const v154 = await deployBloctoWalletV154(ethersSigner, create3Factory, entryPoint.address, moduleManager.address)
    const implementation = v153.address
    // account factory
    const BloctoAccountFactory = await ethers.getContractFactory('BloctoAccountFactory')
    const BloctoAccountFactoryProxySalt = hexZeroPad(Buffer.from('BloctoAccountFactoryProxy_v140', 'utf-8'), 32)
    const accountFactoryAddress: string = await create3Factory.getDeployed(await create3Factory.signer.getAddress(), BloctoAccountFactoryProxySalt)
    if ((await ethers.provider.getCode(accountFactoryAddress)) !== '0x') {
      console.log(`Using Existed BloctoAccountFactory (${accountFactoryAddress})!`)
      factory = await BloctoAccountFactory__factory.connect(accountFactoryAddress, ethersSigner)
    } else {
      console.log(`Deploying to BloctoAccountFactory (${accountFactoryAddress})...`)
      console.log('v153: ', v153.address)
      console.log('v154: ', v154.address)
      console.log('entryPoint: ', entryPoint.address)
      factory = await create3DeployTransparentProxy(BloctoAccountFactory,
        [implementation, entryPoint.address, await ethersSigner.getAddress()],
        { initializer: 'initialize', constructorArgs: [v153.address, v154.address], unsafeAllow: ['constructor', 'state-variable-immutable'] }, create3Factory, ethersSigner, BloctoAccountFactoryProxySalt)
    }
    console.log('before deploy')
    // To consider test on REAL chain, separate factory method manipulation
    const createAccountRole = await factory.CREATE_ACCOUNT_ROLE()
    if (!(await factory.hasRole(createAccountRole, await ethersSigner.getAddress()))) {
      console.log(`Grant factory create account role to ${await ethersSigner.getAddress()}`)
      const factoryGrantRoleTx = await factory.grantRole(await factory.CREATE_ACCOUNT_ROLE(), await ethersSigner.getAddress())
      await factoryGrantRoleTx.wait()
    }
    if ((await factory.bloctoAccountImplementation151Plus()) === zeroAddress()) {
      console.log(`Set factory implementation to ${implementation}`)
      const factorySetImplementation_1_5_1Tx = await factory.setImplementation_1_5_1(implementation)
      await factorySetImplementation_1_5_1Tx.wait()
    }
    console.log('222 sfactory address: ', factory.address)
    const nowFactoryVersoin = await factory.VERSION()
    console.log(`Factory version: ${nowFactoryVersoin}`)
    if (nowFactoryVersoin !== NextVersion) {
      console.log(`\t upgrade factory(${nowFactoryVersoin}) to new version(${NextVersion})`)
      const BaseContract = await ethers.getContractFactory('BloctoAccountFactoryBase')
      await upgrades.forceImport(accountFactoryAddress, BaseContract)
      const UpgradeContract = await ethers.getContractFactory('BloctoAccountFactory')
      factory = await upgrades.upgradeProxy(factory.address, UpgradeContract, { constructorArgs: [implementation], unsafeAllow: ['constructor', 'state-variable-immutable'] })
    }

    // testERC20 deploy
    const testERC20Salt = hexZeroPad(Buffer.from('TestERC20', 'utf-8'), 32)
    const testERC200Address = await create3Factory.getDeployed(await ethersSigner.getAddress(), testERC20Salt)

    if ((await ethers.provider.getCode(testERC200Address)) !== '0x') {
      console.log(`Using Existed TestERC20 (${testERC200Address})!`)
    } else {
      console.log(`Deploying to TestERC20 (${testERC200Address})...`)
      await create3Factory.deploy(
        testERC20Salt,
        getDeployCode(new TestERC20__factory(), ['TestERC20', 'TST', 18, await ethersSigner.getAddress()])
      )
    }
    testERC20 = await TestERC20__factory.connect(testERC200Address, ethersSigner)
    // create global account
    account = await testCreateAccount(0)
  })

  describe('wallet functions', () => {
    it('should not init account again', async () => {
      const link = await BloctoAccount__factory.connect(account.address, ethersSigner)
      const fakeAddr = '0x' + 'a'.repeat(40)
      await expect(link.init(fakeAddr, fakeAddr, fakeAddr, 1, '0x' + 'a'.repeat(64))).to.revertedWith('must not already be initialized')
    })

    it('should not init2 account again', async () => {
      const link = await BloctoAccount__factory.connect(account.address, ethersSigner)
      const fakeAddr = '0x' + 'a'.repeat(40)
      const tmpbytes32 = '0x' + 'a'.repeat(64)
      await expect(link.init2(
        [fakeAddr, fakeAddr],
        fakeAddr, fakeAddr,
        [1, 1],
        [tmpbytes32, tmpbytes32])).to.revertedWith('must not already be initialized')
    })

    it('should not initImplementation again', async () => {
      const link = await BloctoAccount__factory.connect(account.address, ethersSigner)
      await expect(link.initImplementation('0x' + 'a'.repeat(40))).to.revertedWith('must not already be initialized')
    })

    it('should not initImplementation with a contract', async () => {
      const b = await new BloctoAccount__factory(ethersSigner).deploy(entryPoint.address, moduleManager.address)
      await expect(b.initImplementation('0x' + 'a'.repeat(40))).to.revertedWith('ERC1967: new implementation is not a contract')
    })

    it('should receive native token', async () => {
      const beforeRecevive = await ethers.provider.getBalance(account.address)
      const [owner] = await ethers.getSigners()

      console.log(`send 0.01 eth to blocto account(${account.address})`)
      const tx = await owner.sendTransaction({
        to: account.address,
        value: parseEther('0.01') // Sends exactly 1.0 ether
      })
      const receipt = await tx.wait()
      const receivedSelector = ethers.utils.id('Received(address,uint256)')
      expect(receipt.logs[0].topics[0]).to.equal(receivedSelector)
      expect(await ethers.provider.getBalance(account.address)).to.equal(beforeRecevive.add(parseEther('0.01')))
    })

    it('should send ERC20 token', async () => {
      // prepare
      this.timeout(60000)
      const sendAccount = account
      const receiveAccount = createTmpAccount(4)
      const before = await mint1000testERC20(account.address, ONE_ETH)

      // test send ERC20
      const beforeRecevive = await testERC20.balanceOf(receiveAccount.address)

      console.log(`sending 1 testERC20 from ${sendAccount.address} to ${receiveAccount.address} ...`)
      const tx = await sendERC20(sendAccount, receiveAccount.address, ONE_ETH)
      const receipt = await tx.wait()
      if (ShowGasUsage) {
        console.log('send erc20 gasUsed: ', receipt.gasUsed)
      }

      expect(await testERC20.balanceOf(sendAccount.address)).to.equal(before.sub(ONE_ETH))
      expect(await testERC20.balanceOf(receiveAccount.address)).to.equal(beforeRecevive.add(ONE_ETH))
    })

    it('should send native token', async () => {
      const amountEthStr = '0.01'
      // prepare
      const sendAccount = account
      const receiveAccount = createTmpAccount(6)
      await fund(sendAccount.address, amountEthStr)

      // test send native token
      const before = await ethers.provider.getBalance(sendAccount.address)
      const beforeRecevive = await ethers.provider.getBalance(receiveAccount.address)

      // sign and send
      const authorizeInAccountNonce = (await sendAccount.nonce()).add(1)

      const accountLinkCosigner = BloctoAccount__factory.connect(sendAccount.address, cosignerWallet)
      const data = txData(1, receiveAccount.address, BigNumber.from(parseEther(amountEthStr)), '0x')

      const sign = await signMessage(authorizedWallet, sendAccount.address, authorizeInAccountNonce, data)
      const invoke1CosignerSendsTx = await accountLinkCosigner.invoke1CosignerSends(sign.v, sign.r, sign.s, authorizeInAccountNonce, authorizedWallet.address, data)
      await invoke1CosignerSendsTx.wait()

      expect(await ethers.provider.getBalance(sendAccount.address)).to.equal(before.sub(parseEther(amountEthStr)))
      expect(await ethers.provider.getBalance(receiveAccount.address)).to.equal(beforeRecevive.add(parseEther(amountEthStr)))
    })

    it('should revert if invalid data length', async () => {
      // prepare
      await mint1000testERC20(account.address, ONE_ETH)
      const receiveAccount = createTmpAccount(6)
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

    it('should send erc20 with invoke2', async () => {
      const receiver = createTmpAccount(6)

      const before = await mint1000testERC20(account.address, ONE_ETH)

      const erc20TransferData = txData(1, testERC20.address, BigNumber.from(0),
        testERC20.interface.encodeFunctionData('transfer', [receiver.address, ONE_ETH]))

      const newNonce = (await account.nonce()).add(1)

      // test send ERC20
      const beforeRecevive = await testERC20.balanceOf(receiver.address)

      const sign = await signForInovke2(account.address, newNonce, erc20TransferData, authorizedWallet, cosignerWallet)
      const tx = await account.invoke2(newNonce, erc20TransferData, sign)
      const receipt = await tx.wait()
      if (ShowGasUsage) {
        console.log('send erc20 invoke2 gasUsed: ', receipt.gasUsed)
      }

      expect(await testERC20.balanceOf(account.address)).to.equal(before.sub(ONE_ETH))
      expect(await testERC20.balanceOf(receiver.address)).to.equal(beforeRecevive.add(ONE_ETH))
    })

    it('should send erc20 with invoke2 use Schnorr', async () => {
      const receiver = createTmpAccount(6)
      const before = await mint1000testERC20(account.address, ONE_ETH)

      const erc20TransferData = txData(1, testERC20.address, BigNumber.from(0),
        testERC20.interface.encodeFunctionData('transfer', [receiver.address, ONE_ETH]))

      const newNonce = (await account.nonce()).add(1)

      // test send ERC20
      const beforeRecevive = await testERC20.balanceOf(receiver.address)

      const sign = await signForInovke2(account.address, newNonce, erc20TransferData, authorizedWallet, cosignerWallet, true, 0)
      const tx = await account.invoke2(newNonce, erc20TransferData, sign)
      const receipt = await tx.wait()
      if (ShowGasUsage) {
        console.log('send erc20 invoke2 gasUsed (Schnorr): ', receipt.gasUsed)
      }

      expect(await testERC20.balanceOf(account.address)).to.equal(before.sub(ONE_ETH))
      expect(await testERC20.balanceOf(receiver.address)).to.equal(beforeRecevive.add(ONE_ETH))
    })

    it('should revert if wrong cosigner for invoke2()', async () => {
      const receiver = createTmpAccount(6)
      await mint1000testERC20(account.address, ONE_ETH)

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
      const receiver = createTmpAccount()
      await mint1000testERC20(account.address, ONE_ETH)

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
      const receiver = createTmpAccount()
      await mint1000testERC20(account.address, ONE_ETH)

      const erc20TransferData = txData(1, testERC20.address, BigNumber.from(0),
        testERC20.interface.encodeFunctionData('transfer', [receiver.address, ONE_ETH]))

      const newNonce = (await account.nonce()).add(1)

      const ret = await account.callStatic.simulateInvoke2(
        newNonce, erc20TransferData, new Uint8Array(65)
      ).catch(e => e.errorArgs)
      expect(ret.targetSuccess).to.be.true
    })

    it('should revert when send erc20 with simulateInvoke2 use fake schnorr', async () => {
      const receiver = createTmpAccount()
      await mint1000testERC20(account.address, ONE_ETH)

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

  // for Blocto Account Factory
  describe('factory functions', () => {
    let otherLinkFactory: BloctoAccountFactory

    before(async () => {
      const otherAccount = createTmpAccount(6)
      otherLinkFactory = await BloctoAccountFactory__factory.connect(factory.address, otherAccount)
    })

    it('should not initiate again', async () => {
      const factoryLink = await BloctoAccountFactory__factory.connect(factory.address, ethersSigner)
      await expect(factoryLink.initialize('0x' + 'a'.repeat(40), '0x' + 'b'.repeat(40), '0x' + 'c'.repeat(40))).to.revertedWith('Initializable: contract is already initialized')
    })

    it('should revert if sender is not grant role for createAccount', async () => {
      const [px, pxIndexWithParity] = getMergedKey(authorizedWallet, cosignerWallet, 0)
      await expect(
        createAccountV151(
          ethersSigner,
          await authorizedWallet.getAddress(),
          await cosignerWallet.getAddress(),
          await recoverWallet.getAddress(),
          BigNumber.from(767),
          pxIndexWithParity,
          px,
          otherLinkFactory
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
          otherLinkFactory
        )
      ).to.revertedWith('caller is not a create account role')
    })

    it('should revert if sender is not grant role for createAccount2', async () => {
      const [authorizedWallet2, cosignerWallet2, recoverWallet2] = createAuthorizedCosignerRecoverWallet2()
      const authorizedWallet22 = createTmpAccount()

      const [px, pxIndexWithParity] = getMergedKey(authorizedWallet, cosignerWallet, 0)
      const [px2, pxIndexWithParity2] = getMergedKey(authorizedWallet2, cosignerWallet2, 1)

      await expect(
        otherLinkFactory.createAccount2Legacy([authorizedWallet2.address, authorizedWallet22.address],
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
        otherLinkFactory.createAccount2_1_5_1([authorizedWallet2.address, authorizedWallet22.address],
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
        otherLinkFactory.createAccountWithInvoke2(
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
        otherLinkFactory.createAccount2WithInvoke2(
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
      const tmpAccount = createTmpAccount(6)
      const factoryLink = await BloctoAccountFactory__factory.connect(factory.address, tmpAccount)
      await expect(
        factoryLink.setImplementation('0x' + 'a'.repeat(40))
      ).to.revertedWith('caller is not a admin')
    })

    it('should revert if setImplementation with zero address', async () => {
      await expect(
        factory.setImplementation(zeroAddress())
      ).to.revertedWith('invalid implementation address.')
    })

    it('should revert if sender is not grant role for setImplementation_1_5_1', async () => {
      const tmpAccount = createTmpAccount(6)
      const factoryLink = await BloctoAccountFactory__factory.connect(factory.address, tmpAccount)
      await expect(
        factoryLink.setImplementation_1_5_1('0x' + 'a'.repeat(40))
      ).to.revertedWith('caller is not a admin')
    })

    it('should revert if setImplementation_1_5_1 with zero address', async () => {
      await expect(
        factory.setImplementation_1_5_1(zeroAddress())
      ).to.revertedWith('invalid implementation address.')
    })

    it('should create account and run tx from createAccountWithInvoke2', async () => {
      // prepare account auth
      const [authorizedEOA, cosignerEOA, recoverEOA] = createAuthorizedCosignerRecoverWallet2()
      const salt = randNumber()
      console.log('Using salt', salt)
      const newSalt = get151SaltFromAddress(salt, cosignerEOA.address, recoverEOA.address)
      const predictAddr151 = await factory.getAddress_1_5_1(newSalt)
      const [px, pxIndexWithParity] = getMergedKey(authorizedEOA, cosignerEOA, 0)

      // prepare account first tx
      const erc20Receiver = createTmpAccount()
      const mintTx = await testERC20.mint(predictAddr151, TWO_ETH)
      await mintTx.wait()
      const erc20TransferData = txData(1, testERC20.address, BigNumber.from(0),
        testERC20.interface.encodeFunctionData('transfer', [erc20Receiver.address, ONE_ETH]))

      const newNonce = BigNumber.from(1)
      const sign = await signForInovke2(predictAddr151, newNonce, erc20TransferData, authorizedEOA, cosignerEOA)

      // run createAccountWithInvoke2
      const before = await testERC20.balanceOf(predictAddr151)
      const beforeRecevive = await testERC20.balanceOf(erc20Receiver.address)

      console.log('running createAccountWithInvoke2...')
      const tx = await factory.createAccountWithInvoke2(
        await authorizedEOA.getAddress(),
        await cosignerEOA.getAddress(),
        await recoverEOA.getAddress(),
        newSalt,
        pxIndexWithParity,
        px,
        { nonce: newNonce, data: erc20TransferData, signature: sign }
      )

      const receipt = await tx.wait()
      expect(await testERC20.balanceOf(predictAddr151)).to.equal(before.sub(ONE_ETH))
      expect(await testERC20.balanceOf(erc20Receiver.address)).to.equal(beforeRecevive.add(ONE_ETH))

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
      const salt = randNumber()
      console.log('Using salt ', salt)
      const newSalt = get151SaltFromAddress(salt, cosignerEOA.address, recoverEOA.address)
      const predictAddr151 = await factory.getAddress_1_5_1(newSalt)
      const [px, pxIndexWithParity] = getMergedKey(authorizedEOA, cosignerEOA, mergedKeyIndex)

      // prepare account first tx
      const erc20Receiver = createTmpAccount()
      const mintTx = await testERC20.mint(predictAddr151, TWO_ETH)
      await mintTx.wait()
      const erc20TransferData = txData(1, testERC20.address, BigNumber.from(0),
        testERC20.interface.encodeFunctionData('transfer', [erc20Receiver.address, ONE_ETH]))

      const newNonce = BigNumber.from(1)
      const sign = await signForInovke2(predictAddr151, newNonce, erc20TransferData, authorizedEOA, cosignerEOA, true, mergedKeyIndex)

      // run createAccountWithInvoke2
      const before = await testERC20.balanceOf(predictAddr151)
      const beforeRecevive = await testERC20.balanceOf(erc20Receiver.address)

      const tx = await factory.createAccountWithInvoke2(
        await authorizedEOA.getAddress(),
        await cosignerEOA.getAddress(),
        await recoverEOA.getAddress(),
        newSalt,
        pxIndexWithParity,
        px,
        { nonce: newNonce, data: erc20TransferData, signature: sign }
      )
      const receipt = await tx.wait()
      expect(await testERC20.balanceOf(predictAddr151)).to.equal(before.sub(ONE_ETH))
      expect(await testERC20.balanceOf(erc20Receiver.address)).to.equal(beforeRecevive.add(ONE_ETH))

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
      const [authorizedEOA2, cosignerEOA2] = createAuthorizedCosignerRecoverWallet()
      const salt = randNumber()
      console.log('Using salt ', salt)
      const newSalt = get151SaltFromAddress(salt, cosignerEOA.address, recoverEOA.address)
      const predictAddr151 = await factory.getAddress_1_5_1(newSalt)
      const [px, pxIndexWithParity] = getMergedKey(authorizedEOA, cosignerEOA, 0)
      const [px2, pxIndexWithParity2] = getMergedKey(authorizedEOA2, cosignerEOA2, 1)

      // prepare account first tx
      const erc20Receiver = createTmpAccount()
      const mintTx = await testERC20.mint(predictAddr151, TWO_ETH)
      await mintTx.wait()
      const erc20TransferData = txData(1, testERC20.address, BigNumber.from(0),
        testERC20.interface.encodeFunctionData('transfer', [erc20Receiver.address, ONE_ETH]))

      const newNonce = BigNumber.from(1)
      const sign = await signForInovke2(predictAddr151, newNonce, erc20TransferData, authorizedEOA, cosignerEOA)

      // run createAccountWithInvoke2
      const before = await testERC20.balanceOf(predictAddr151)
      const beforeRecevive = await testERC20.balanceOf(erc20Receiver.address)

      console.log('running createAccount2WithInvoke2...')
      const tx = await factory.createAccount2WithInvoke2(
        [authorizedEOA.address, authorizedEOA2.address],
        cosignerEOA.address, recoverEOA.address,
        newSalt,
        [pxIndexWithParity, pxIndexWithParity2],
        [px, px2],
        { nonce: newNonce, data: erc20TransferData, signature: sign }
      )
      await tx.wait()

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

  // for Blocto Account Factory
  describe('consistent address check', () => {
    it('account address should be same everytime', async () => {
      if (cosignerWallet.address === '0x4F406180e1F1E4CA9C4E9dCc16aFA2039b733F58' &&
        recoverWallet.address === '0x4b2D819a543762918eaD57b08a2F85D1FD676393') {
        const initImplementation = await factory.initImplementation()
        const salt = keccak256(concat([
          ethers.utils.hexZeroPad(BigNumber.from(0).toHexString(), 32),
          cosignerWallet.address, recoverWallet.address
        ]))
        // local account
        if (factory.address === '0x591E00821444155a7076cd7254747d05D1374267') {
          expect(initImplementation).to.equal('0x6569873b0dCD1c5DE53101080996B0782f4e912c')
          expect(account.address).to.equal('0xCE4b477244c5E6aE3496524ea17bB4fde797b462')
          expect(await factory.getAddress_1_5_1(salt)).to.equal(account.address)
          // testnet account
        } else if (factory.address === '0x38DDa3Aed6e71457d573F993ee06380b1cDaF3D1') {
          // deploy using account is 0x162235eBF3381eDE497dFa523b2a77E2941583eC
          expect(initImplementation).to.equal('0x89EbeBE2bA6638729FBD2F33d200A48C81684c3c')
          expect(account.address).to.equal('0x8A04Cbb16523778BEff84f034eB80b72160B65D6')
          expect(await factory.getAddress_1_5_1(salt)).to.equal(account.address)
          // mainnet account
        } else if (factory.address === '0xF7cCFaee69cD8A0B3a62C2A0f35F95cC7e588183') {
          expect(initImplementation).to.equal('0x53a2A0aF86b0134C7A7b4bD40884dAA78c48416E')
          expect(account.address).to.equal('0xF74EFcA1bc823d65313cFB67a46d54349B2f0592')
          expect(await factory.getAddress_1_5_1(salt)).to.equal(account.address)
        } else {
          console.log('NOTE: this test is NOT check consistent address, cannot find match factory address')
        }
      } else {
        console.log('NOTE: this test is NOT check consistent address')
      }
    })

    it('account address should be same everytime of createAccount2_1_5_1', async () => {
      const [authorizedWallet2, cosignerWallet2, recoverWallet2] = createAuthorizedCosignerRecoverWallet2()
      const salt = get151SaltFromAddress(0, cosignerWallet2.address, recoverWallet2.address)
      const predictAddr151 = await factory.getAddress_1_5_1(salt)

      const [px, pxIndexWithParity] = getMergedKey(authorizedWallet, cosignerWallet, 0)
      const [px2, pxIndexWithParity2] = getMergedKey(authorizedWallet2, cosignerWallet2, 1)

      if ((await ethers.provider.getCode(predictAddr151)) === '0x') {
        console.log(`Deploying to BloctoAccount (${predictAddr151})...`)
        const tx = await factory.createAccount2_1_5_3([authorizedWallet.address, authorizedWallet2.address],
          cosignerWallet.address, recoverWallet2.address,
          salt,
          [pxIndexWithParity, pxIndexWithParity2],
          [px, px2])

        await tx.wait()
      } else {
        await expect(
          factory.createAccount2_1_5_3([authorizedWallet.address, authorizedWallet2.address],
            cosignerWallet.address, recoverWallet2.address,
            salt,
            [pxIndexWithParity, pxIndexWithParity2],
            [px, px2])
        ).to.revertedWith('execution reverted')
      }

      console.log('cosignerWallet2.address: ', cosignerWallet2.address)
      console.log('recoverWallet2.address: ', recoverWallet2.address)

      console.log('consistent predictAddr151:', predictAddr151)
      const account2_1_5_1 = await BloctoAccount__factory.connect(predictAddr151, ethersSigner)
      expect(predictAddr151).to.equal(account2_1_5_1.address)
      expect(await account2_1_5_1.VERSION()).to.equal(NextVersion)

      if (cosignerWallet2.address === '0x4eF791438972d2D41FF4BF7911E0F7372971eFcA' &&
        recoverWallet2.address === '0xFEC60025526f37BEB6134631322E98e48794d8fb') {
        const initImplementation = await factory.initImplementation()
        // local account
        if (factory.address === '0x591E00821444155a7076cd7254747d05D1374267') {
          expect(initImplementation).to.equal('0x6569873b0dCD1c5DE53101080996B0782f4e912c')
          expect(account2_1_5_1.address).to.equal('0xB454E8D70F7f876DAe90217EB1CD01a5B5a9F99d')
          // testnet account
        } else if (factory.address === '0x38DDa3Aed6e71457d573F993ee06380b1cDaF3D1') {
          expect(initImplementation).to.equal('0x89EbeBE2bA6638729FBD2F33d200A48C81684c3c')
          expect(account2_1_5_1.address).to.equal('0x14650A148F7818F0Bd5403026c5BBA460f9394d4')
          // mainnet account
        } else if (factory.address === '0xF7cCFaee69cD8A0B3a62C2A0f35F95cC7e588183') {
          expect(initImplementation).to.equal('0x53a2A0aF86b0134C7A7b4bD40884dAA78c48416E')
          expect(account2_1_5_1.address).to.equal('0x19b4b23Bdbe7deB6c95E6A952Aa7Dd2C5f192Ce5')
        } else {
          console.log('NOTE: this test is NOT check consistent address, cannot find match factory address of createAccount2_1_5_1')
        }
      } else {
        console.log('NOTE: this test is NOT check consistent address of createAccount2_1_5_1')
      }
    })
  })

  describe('point and revert flag', () => {
    // fake for fee token
    let dai: TestERC20
    const feeReceiver = createTmpAccount(7)
    const erc20Receiver = createTmpAccount(8)
    const testFee = parseEther('10')

    function fee10DAI(revertFlag: RevertFlag): Uint8Array {
      // const revertFlag = isRevert ? RevertFlag.Revert : RevertFlag.NoRevert
      return txData(revertFlag, dai.address, BigNumber.from(0),
        testERC20.interface.encodeFunctionData('transfer', [feeReceiver.address, testFee]))
    }

    // tx 1: send 10 DAI to feeReceiver, tx 2: send 1 ERC20 to erc20Receiver
    async function feeWithSendERC20(revertFlag: RevertFlag): Promise<[BigNumber, Uint8Array, string]> {
      const feeData = fee10DAI(revertFlag)

      const erc20TransferData = txAppendData(feeData, testERC20.address, BigNumber.from(0),
        testERC20.interface.encodeFunctionData('transfer', [erc20Receiver.address, ONE_ETH]))

      const newNonce = (await account.nonce()).add(1)

      const sign = await signForInovke2(account.address, newNonce, erc20TransferData, authorizedWallet, cosignerWallet, true, 0)
      return [newNonce, erc20TransferData, sign]
    }

    // tx 1: send 10 DAI to feeReceiver, tx 2: send 1 ERC20 to erc20Receiver
    async function feeWithSendERC20AndNativeToken(revertFlag: RevertFlag): Promise<[BigNumber, Uint8Array, string]> {
      const feeData = fee10DAI(revertFlag)

      const tx12Data = txAppendData(feeData, testERC20.address, BigNumber.from(0),
        testERC20.interface.encodeFunctionData('transfer', [erc20Receiver.address, ONE_ETH]))

      const tx123Data = txAppendData(tx12Data, erc20Receiver.address, parseEther('0.0001'), '')

      const newNonce = (await account.nonce()).add(1)

      const sign = await signForInovke2(account.address, newNonce, tx123Data, authorizedWallet, cosignerWallet, true, 0)
      return [newNonce, tx123Data, sign]
    }

    async function clearOutBalance(erc20: TestERC20, targetAccount: BloctoAccount): Promise<void> {
      const balance = await erc20.balanceOf(targetAccount.address)
      if (balance.gt(0)) {
        console.log(`${targetAccount.address} clear out balance(${balance.toString()}) of ${await erc20.symbol()}`)
        const erc20Receiver = createTmpAccount()
        const erc20TransferData = txData(1, erc20.address, BigNumber.from(0),
          erc20.interface.encodeFunctionData('transfer', [erc20Receiver.address, balance]))

        const newNonce = (await targetAccount.nonce()).add(1)
        const sign = await signForInovke2(targetAccount.address, newNonce, erc20TransferData, authorizedWallet, cosignerWallet, true, 0)
        await targetAccount.invoke2(newNonce, erc20TransferData, sign)
      }
    }

    before(async function () {
      // testERC20 deploy
      const fakeDAISalt = hexZeroPad(Buffer.from('FakeDAI', 'utf-8'), 32)
      const fakeDAIAddr = await create3Factory.getDeployed(await ethersSigner.getAddress(), fakeDAISalt)

      // deploy DAI if not exist
      if ((await ethers.provider.getCode(fakeDAIAddr)) !== '0x') {
        console.log(`Using Existed FakeDAI (${fakeDAIAddr})!`)
      } else {
        console.log(`Deploying to FakeDAI  (${fakeDAIAddr})...`)
        await create3Factory.deploy(
          fakeDAISalt,
          getDeployCode(new TestERC20__factory(), ['FakeDAI', 'FAKEDAI', 18, await ethersSigner.getAddress()])
        )
      }
      dai = await TestERC20__factory.connect(fakeDAIAddr, ethersSigner)

      // clear out balance
      await clearOutBalance(testERC20, account)
      await clearOutBalance(dai, account)
    })

    // -------------------Revert Test----------------------------//
    it('should revert if Fee not enough with RevertFlag.NoRevert(b00)', async () => {
      const [newNonce, erc20TransferData, sign] = await feeWithSendERC20(RevertFlag.NoRevert)
      await expect(
        account.invoke2(newNonce, erc20TransferData, sign)
      ).to.be.reverted
    })

    it('should revert if Fee not enough with RevertFlag.Revert(b01)', async () => {
      const [newNonce, erc20TransferData, sign] = await feeWithSendERC20(RevertFlag.Revert)
      await expect(
        account.invoke2(newNonce, erc20TransferData, sign)
      ).to.be.reverted
    })

    it('should revert if first tx fail with RevertFlag.PointWithRevert(b11)', async () => {
      const [newNonce, erc20TransferData, sign] = await feeWithSendERC20(RevertFlag.PointWithRevert)
      await expect(
        account.invoke2(newNonce, erc20TransferData, sign)
      ).to.be.reverted
    })

    it('should revert if second tx fail with RevertFlag.PointWithRevert(b11)', async () => {
      const actBeforeDAI = await mint1000testERC20(account.address, testFee, dai)

      const [newNonce, erc20TransferData, sign] = await feeWithSendERC20(RevertFlag.PointWithRevert)
      await expect(
        account.invoke2(newNonce, erc20TransferData, sign)
      ).to.be.reverted

      // same as before because revert
      expect(await dai.balanceOf(account.address)).to.equal(actBeforeDAI)
    })

    // -------------------Edge Case----------------------------//
    it('should NO revert if second tx fail with RevertFlag.PointWithRevert(b10)', async () => {
      const actBeforeDAI = await mint1000testERC20(account.address, testFee, dai)
      const recevierBeforeDAI = await dai.balanceOf(feeReceiver.address)

      const actBeforeTestERC20 = await testERC20.balanceOf(account.address)

      const [newNonce, erc20TransferData, sign] = await feeWithSendERC20(RevertFlag.PointNoRevert)
      const tx = await account.invoke2(newNonce, erc20TransferData, sign)
      const receipt = await tx.wait()
      if (ShowGasUsage) {
        console.log('No revert tx gasUsed: ', receipt.gasUsed)
      }
      let resultSuccess = false
      receipt.events?.forEach((event) => {
        if (event.event === 'InvocationSuccess') {
          resultSuccess = true
          expect(event.args?.result).to.equal(2)
        }
      })
      expect(resultSuccess).true
      // DAI
      expect(await dai.balanceOf(account.address)).to.equal(actBeforeDAI.sub(testFee))
      expect(await dai.balanceOf(feeReceiver.address)).to.equal(recevierBeforeDAI.add(testFee))
      // ERC20 no change
      expect(await testERC20.balanceOf(account.address)).to.equal(actBeforeTestERC20)
    })

    // note the event result is different
    it('should NO revert if second tx fail with RevertFlag.PointWithRevert(b01)', async () => {
      const actBeforeDAI = await mint1000testERC20(account.address, testFee, dai)
      const recevierBeforeDAI = await dai.balanceOf(feeReceiver.address)

      const actBeforeTestERC20 = await testERC20.balanceOf(account.address)

      const [newNonce, erc20TransferData, sign] = await feeWithSendERC20(RevertFlag.Revert)
      const tx = await account.invoke2(newNonce, erc20TransferData, sign)
      const receipt = await tx.wait()
      if (ShowGasUsage) {
        console.log('No revert tx gasUsed: ', receipt.gasUsed)
      }
      let resultSuccess = false
      receipt.events?.forEach((event) => {
        if (event.event === 'InvocationSuccess') {
          resultSuccess = true
          const result = BigNumber.from(event.args?.result)
          expect(result).to.equal(ethers.constants.MaxUint256.sub(1))
        }
      })
      expect(resultSuccess).true
      // DAI
      expect(await dai.balanceOf(account.address)).to.equal(actBeforeDAI.sub(testFee))
      expect(await dai.balanceOf(feeReceiver.address)).to.equal(recevierBeforeDAI.add(testFee))
      // ERC20 no change
      expect(await testERC20.balanceOf(account.address)).to.equal(actBeforeTestERC20)
    })

    it('should NO revert if second tx fail with RevertFlag.PointWithRevert(b00)', async () => {
      const actBeforeDAI = await mint1000testERC20(account.address, testFee, dai)
      const recevierBeforeDAI = await dai.balanceOf(feeReceiver.address)

      const actBeforeTestERC20 = await testERC20.balanceOf(account.address)

      const [newNonce, erc20TransferData, sign] = await feeWithSendERC20(RevertFlag.PointNoRevert)
      const tx = await account.invoke2(newNonce, erc20TransferData, sign)
      const receipt = await tx.wait()
      if (ShowGasUsage) {
        console.log('No revert tx gasUsed: ', receipt.gasUsed)
      }
      let resultSuccess = false
      receipt.events?.forEach((event) => {
        if (event.event === 'InvocationSuccess') {
          resultSuccess = true
          expect(event.args?.result).to.equal(2)
        }
      })
      expect(resultSuccess).true
      // DAI
      expect(await dai.balanceOf(account.address)).to.equal(actBeforeDAI.sub(testFee))
      expect(await dai.balanceOf(feeReceiver.address)).to.equal(recevierBeforeDAI.add(testFee))
      // ERC20 no change
      expect(await testERC20.balanceOf(account.address)).to.equal(actBeforeTestERC20)
    })

    // -------------------Normal Test----------------------------//
    it('should use 10 DAI as fee and send 1 ERC20 with RevertFlag b00', async () => {
      // const erc20Receiver = createTmpAccount(8)
      // mint 1000 DAI & testERC20 (at least 10 and 1)to account
      const actBeforeFee = await mint1000testERC20(account.address, testFee, dai)
      const actBefore = await mint1000testERC20(account.address, ONE_ETH, testERC20)

      const beforeFee = await dai.balanceOf(feeReceiver.address)
      const beforeRecevive = await testERC20.balanceOf(erc20Receiver.address)

      // RevertFlag use b01
      const [newNonce, erc20TransferData, sign] = await feeWithSendERC20(RevertFlag.NoRevert)

      const tx = await account.invoke2(newNonce, erc20TransferData, sign)
      const receipt = await tx.wait()
      if (ShowGasUsage) {
        console.log('send erc20 invoke2 gasUsed (Schnorr): ', receipt.gasUsed)
      }
      // erc20
      expect(await testERC20.balanceOf(account.address)).to.equal(actBefore.sub(ONE_ETH))
      expect(await testERC20.balanceOf(erc20Receiver.address)).to.equal(beforeRecevive.add(ONE_ETH))
      // fee
      expect(await dai.balanceOf(account.address)).to.equal(actBeforeFee.sub(testFee))
      expect(await dai.balanceOf(feeReceiver.address)).to.equal(beforeFee.add(testFee))
    })

    it('should use 10 DAI as fee and send 1 ERC20 with RevertFlag b01', async () => {
      // const erc20Receiver = createTmpAccount(8)
      // mint 1000 DAI & testERC20 (at least 10 and 1)to account
      const actBeforeFee = await mint1000testERC20(account.address, testFee, dai)
      const actBefore = await mint1000testERC20(account.address, ONE_ETH, testERC20)

      const beforeFee = await dai.balanceOf(feeReceiver.address)
      const beforeRecevive = await testERC20.balanceOf(erc20Receiver.address)

      // RevertFlag use b00
      const [newNonce, erc20TransferData, sign] = await feeWithSendERC20(RevertFlag.Revert)

      const tx = await account.invoke2(newNonce, erc20TransferData, sign)
      const receipt = await tx.wait()
      if (ShowGasUsage) {
        console.log('send erc20 invoke2 gasUsed (Schnorr): ', receipt.gasUsed)
      }
      // erc20
      expect(await testERC20.balanceOf(account.address)).to.equal(actBefore.sub(ONE_ETH))
      expect(await testERC20.balanceOf(erc20Receiver.address)).to.equal(beforeRecevive.add(ONE_ETH))
      // fee
      expect(await dai.balanceOf(account.address)).to.equal(actBeforeFee.sub(testFee))
      expect(await dai.balanceOf(feeReceiver.address)).to.equal(beforeFee.add(testFee))
    })

    it('should send erc20 with RevertFlag b10', async () => {
      const amount = ONE_ETH
      const actBefore = await mint1000testERC20(account.address, amount, testERC20)

      const erc20TransferData = txData(RevertFlag.PointNoRevert, testERC20.address, BigNumber.from(0),
        testERC20.interface.encodeFunctionData('transfer', [erc20Receiver.address, amount]))

      const newNonce = (await account.nonce()).add(1)
      // test send ERC20
      const beforeRecevive = await testERC20.balanceOf(erc20Receiver.address)

      const sign = await signForInovke2(account.address, newNonce, erc20TransferData, authorizedWallet, cosignerWallet)
      const tx = await account.invoke2(newNonce, erc20TransferData, sign)
      const receipt = await tx.wait()
      if (ShowGasUsage) {
        console.log('send erc20 with RevertFlag b10 gasUsed: ', receipt.gasUsed)
      }

      expect(await testERC20.balanceOf(account.address)).to.equal(actBefore.sub(amount))
      expect(await testERC20.balanceOf(erc20Receiver.address)).to.equal(beforeRecevive.add(amount))
    })

    it('should send erc20 with RevertFlag b11', async () => {
      const amount = ONE_ETH
      const actBefore = await mint1000testERC20(account.address, amount, testERC20)

      const erc20TransferData = txData(RevertFlag.PointWithRevert, testERC20.address, BigNumber.from(0),
        testERC20.interface.encodeFunctionData('transfer', [erc20Receiver.address, amount]))

      const newNonce = (await account.nonce()).add(1)
      // test send ERC20
      const beforeRecevive = await testERC20.balanceOf(erc20Receiver.address)

      const sign = await signForInovke2(account.address, newNonce, erc20TransferData, authorizedWallet, cosignerWallet)
      const tx = await account.invoke2(newNonce, erc20TransferData, sign)
      const receipt = await tx.wait()
      if (ShowGasUsage) {
        console.log('send erc20 with RevertFlag b11 gasUsed: ', receipt.gasUsed)
      }

      expect(await testERC20.balanceOf(account.address)).to.equal(actBefore.sub(amount))
      expect(await testERC20.balanceOf(erc20Receiver.address)).to.equal(beforeRecevive.add(amount))
    })

    // -------------------3 Meta TX Test----------------------------//
    // tx_1: fee,  tx_2: send ERC20 (fail), tx_3: send native token
    it('should send 3 tx with RevertFlag.PointWithRevert(b10)', async () => {
      const actBeforeDAI = await mint1000testERC20(account.address, testFee, dai)
      await clearOutBalance(testERC20, account)
      await fund(account)

      const beforeFee = await dai.balanceOf(feeReceiver.address)
      const beforeNativeToken = await dai.balanceOf(erc20Receiver.address)
      const actBeforeNativeToken = await ethers.provider.getBalance(account.address)

      const [newNonce, erc20TransferData, sign] = await feeWithSendERC20AndNativeToken(RevertFlag.PointNoRevert)
      const tx = await account.invoke2(newNonce, erc20TransferData, sign)
      const receipt = await tx.wait()
      if (ShowGasUsage) {
        console.log('No revert tx gasUsed: ', receipt.gasUsed)
      }
      let resultSuccess = false
      receipt.events?.forEach((event) => {
        if (event.event === 'InvocationSuccess') {
          resultSuccess = true
          expect(event.args?.result).to.equal(2)
        }
      })
      expect(resultSuccess).true
      // DAI
      expect(await dai.balanceOf(account.address)).to.equal(actBeforeDAI.sub(testFee))
      expect(await dai.balanceOf(feeReceiver.address)).to.equal(beforeFee.add(testFee))
      // Native Token
      expect(await ethers.provider.getBalance(account.address)).to.equal(actBeforeNativeToken.sub(parseEther('0.0001')))
      expect(await ethers.provider.getBalance(erc20Receiver.address)).to.equal(beforeNativeToken.add(parseEther('0.0001')))
    })
  })

  describe('simulate create account', () => {
    // simulate factory
    it('should simulate create account and run tx from createAccountWithInvoke2', async () => {
      // prepare account auth
      const [authorizedEOA, cosignerEOA, recoverEOA] = createAuthorizedCosignerRecoverWallet2()
      const salt = randNumber()
      const newSalt = get151SaltFromAddress(salt, cosignerEOA.address, recoverEOA.address)
      const predictAddr151 = await factory.getAddress_1_5_1(newSalt)
      const [px, pxIndexWithParity] = getMergedKey(authorizedEOA, cosignerEOA, 0)

      // prepare account first tx
      const erc20Receiver = createTmpAccount()
      const mintTx = await testERC20.mint(predictAddr151, TWO_ETH)
      await mintTx.wait()
      const erc20TransferData = txData(1, testERC20.address, BigNumber.from(0),
        testERC20.interface.encodeFunctionData('transfer', [erc20Receiver.address, ONE_ETH]))

      const newNonce = BigNumber.from(1)
      const sign = await signForInovke2(predictAddr151, newNonce, erc20TransferData, authorizedEOA, cosignerEOA)

      console.log('simulating createAccountWithInvoke2...')
      const errorArgs = await factory.callStatic.simulateCreateAccountWithInvoke2_1_5_4(
        await authorizedEOA.getAddress(),
        await cosignerEOA.getAddress(),
        await recoverEOA.getAddress(),
        newSalt,
        pxIndexWithParity,
        px,
        { nonce: newNonce, data: erc20TransferData, signature: sign },
        { gasLimit: 8e6 }
      ).catch(e => e.errorArgs)
      // targetSuccess should be true
      expect(errorArgs.targetSuccess).to.be.true
      expect(errorArgs.gasLeft).to.gt(0)
      // use around 2e5 gas
      expect(errorArgs.gasLeft).to.lt(8e6)
      // the account should NOT be created
      expect(await ethers.provider.getCode(predictAddr151)).to.equal('0x')
    })

    it('should simulate create account and run tx from createAccount2WithInvoke2', async () => {
      // prepare account auth
      const [authorizedEOA, cosignerEOA, recoverEOA] = createAuthorizedCosignerRecoverWallet()
      const [authorizedEOA2, cosignerEOA2] = createAuthorizedCosignerRecoverWallet()
      const salt = randNumber()
      const newSalt = get151SaltFromAddress(salt, cosignerEOA.address, recoverEOA.address)
      const predictAddr151 = await factory.getAddress_1_5_1(newSalt)
      const [px, pxIndexWithParity] = getMergedKey(authorizedEOA, cosignerEOA, 0)
      const [px2, pxIndexWithParity2] = getMergedKey(authorizedEOA2, cosignerEOA2, 1)

      // prepare account first tx
      const erc20Receiver = createTmpAccount()
      const mintTx = await testERC20.mint(predictAddr151, TWO_ETH)
      await mintTx.wait()
      const erc20TransferData = txData(1, testERC20.address, BigNumber.from(0),
        testERC20.interface.encodeFunctionData('transfer', [erc20Receiver.address, ONE_ETH]))

      const newNonce = BigNumber.from(1)
      const sign = await signForInovke2(predictAddr151, newNonce, erc20TransferData, authorizedEOA, cosignerEOA)

      console.log('simulating createAccount2WithInvoke2...')
      const errorArgs = await factory.callStatic.simulateCreateAccount2WithInvoke2_1_5_4(
        [authorizedEOA.address, authorizedEOA2.address],
        cosignerEOA.address, recoverEOA.address,
        newSalt,
        [pxIndexWithParity, pxIndexWithParity2],
        [px, px2],
        { nonce: newNonce, data: erc20TransferData, signature: sign },
        { gasLimit: 1e6 }
      ).catch(e => e.errorArgs)
      // targetSuccess should be true
      expect(errorArgs.targetSuccess).to.be.true
      expect(errorArgs.gasLeft).to.gt(0)
      // use around 2e5 gas
      expect(errorArgs.gasLeft).to.lt(8e5)
      // the account should NOT be created
      expect(await ethers.provider.getCode(predictAddr151)).to.equal('0x')
    })
  })
})
