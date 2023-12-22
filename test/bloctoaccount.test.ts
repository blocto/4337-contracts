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
  createAuthorizedCosignerRecoverWallet,
  createAuthorizedCosignerRecoverWallet2,
  txData,
  signMessage,
  getMergedKey,
  signMessageWithoutChainId,
  signForInovke2,
  get151SaltFromAddress
} from './testutils'
import '@openzeppelin/hardhat-upgrades'
import { hexZeroPad, concat } from '@ethersproject/bytes'
import { deployCREATE3Factory, getDeployCode } from '../src/create3Factory'
import { create3DeployTransparentProxy } from '../src/deployAccountFactoryWithCreate3'
import { zeroAddress } from 'ethereumjs-util'
import { parseEther, keccak256 } from 'ethers/lib/utils'

const ShowGasUsage = false

function randNumber (): number {
  return Math.floor(Math.random() * (1000000000000000))
}

describe('BloctoAccount Test', function () {
  const ethersSigner = ethers.provider.getSigner()

  let authorizedWallet: Wallet
  let cosignerWallet: Wallet
  let recoverWallet: Wallet

  let implementation: string
  let factory: BloctoAccountFactory

  let entryPoint: EntryPoint

  let create3Factory: CREATE3Factory

  let testERC20: TestERC20

  // const NowVersion = '1.5.2'
  const NextVersion = '1.5.2'

  let account: BloctoAccount

  async function testCreateAccount (salt = 0, mergedKeyIndex = 0, ifactory = factory, version = NextVersion): Promise<BloctoAccount> {
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

  async function mint1000testERC20 (target: string, leastAmount: BigNumber): Promise<BigNumber> {
    const before = await testERC20.balanceOf(target)
    if (before.lt(leastAmount)) {
      console.log(`mint 1000 testERC20 to ${target}`)
      const mintWait = await testERC20.mint(target, parseEther('1000'))
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

    // create3 factory
    create3Factory = await deployCREATE3Factory(ethersSigner)

    const accountSalt = hexZeroPad(Buffer.from('BloctoAccount', 'utf-8'), 32)
    implementation = await create3Factory.getDeployed(await ethersSigner.getAddress(), accountSalt)

    if ((await ethers.provider.getCode(implementation)) !== '0x') {
      console.log(`Using Existed BloctoAccountCloneableWallet (${implementation})!`)
    } else {
      console.log(`Deploying to BloctoAccountCloneableWallet (${implementation})...`)
      const bloctoAccountCloneableWalletDeployTx = await create3Factory.deploy(
        accountSalt,
        getDeployCode(new BloctoAccountCloneableWallet__factory(), [entryPoint.address])
      )
      await bloctoAccountCloneableWalletDeployTx.wait()
    }
    // account factory
    const BloctoAccountFactory = await ethers.getContractFactory('BloctoAccountFactory')
    const BloctoAccountFactoryProxySalt = hexZeroPad(Buffer.from('BlotoAccountFactoryProxy', 'utf-8'), 32)
    const accountFactoryAddress: string = await create3Factory.getDeployed(await create3Factory.signer.getAddress(), BloctoAccountFactoryProxySalt)
    if ((await ethers.provider.getCode(accountFactoryAddress)) !== '0x') {
      console.log(`Using Existed BloctoAccountFactory (${accountFactoryAddress})!`)
      factory = await BloctoAccountFactory__factory.connect(accountFactoryAddress, ethersSigner)
    } else {
      console.log(`Deploying to BloctoAccountFactory (${accountFactoryAddress})...`)
      factory = await create3DeployTransparentProxy(BloctoAccountFactory,
        [implementation, entryPoint.address, await ethersSigner.getAddress()],
        { initializer: 'initialize' }, create3Factory, ethersSigner, BloctoAccountFactoryProxySalt)
    }
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

    account = await testCreateAccount(212)
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
      const b = await new BloctoAccount__factory(ethersSigner).deploy(entryPoint.address)
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
        createAccount(
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
        otherLinkFactory.createAccount2([authorizedWallet2.address, authorizedWallet22.address],
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
      const [authorizedEOA2, cosignerEOA2, _] = createAuthorizedCosignerRecoverWallet()
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
})
