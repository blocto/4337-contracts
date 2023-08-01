// acknowledgement https://github.com/dapperlabs/dapper-contracts/blob/master/test/wallet.test.js
// update it from js to ts and fit ethers
import { ethers } from 'hardhat'
import { Wallet, BigNumber } from 'ethers'
import { expect } from 'chai'
import {
  BloctoAccount,
  BloctoAccount__factory,
  BloctoAccountCloneableWallet__factory,
  CREATE3Factory,
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

const ShowLog = false

function log (...args: any): void {
  if (ShowLog) console.log(...args)
}

describe('BloctoAccount CoreWallet Test', function () {
  const ethersSigner = ethers.provider.getSigner()
  const WalletSalt = 123456

  let authorizedWallet: Wallet
  let cosignerWallet: Wallet
  let recoverWallet: Wallet

  let implementation: string
  let factory: BloctoAccountFactory

  let entryPoint: EntryPoint

  let create3Factory: CREATE3Factory

  let testERC20: TettERC20

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

  async function invokeWithCosigner (account: BloctoAccount, data: Uint8Array,
    authorized: Wallet = authorizedWallet, cosigner: Wallet = cosignerWallet): Promise<void> {
    const newNonce: BigNumber = (await account.nonce()).add(1)
    const accountLinkCosigner = BloctoAccount__factory.connect(account.address, cosigner)

    const sign = await signMessage(authorized, account.address, newNonce, data)
    await accountLinkCosigner.invoke1CosignerSends(sign.v, sign.r, sign.s, newNonce, authorized.address, data)
  }

  // use authorizedWallet and cosignerWallet to send ERC20 from cosigner
  async function sendERC20ByCosigner (account: BloctoAccount, to: string, amount: BigNumber, withChainId: boolean = true,
    authorized: Wallet = authorizedWallet, cosigner: Wallet = cosignerWallet): Promise<void> {
    // const authorizeInAccountNonce = (await account.nonces(authorizedWallet.address)).add(1)
    const authorizeInAccountNonce = (await account.nonce()).add(1)
    const accountLinkCosigner = BloctoAccount__factory.connect(account.address, cosigner)
    const data = txData(1, testERC20.address, BigNumber.from(0),
      testERC20.interface.encodeFunctionData('transfer', [to, amount]))

    const sign = withChainId ? await signMessage(authorized, account.address, authorizeInAccountNonce, data) : await signMessageWithoutChainId(authorized, account.address, authorizeInAccountNonce, data)
    await accountLinkCosigner.invoke1CosignerSends(sign.v, sign.r, sign.s, authorizeInAccountNonce, authorized.address, data)
  }

  // use authorizedWallet and cosignerWallet to send ERC20 from authorized
  async function sendERC20ByAuthorized (account: BloctoAccount, to: string, amount: BigNumber, withChainId: boolean = true,
    authorized: Wallet = authorizedWallet, cosigner: Wallet = cosignerWallet): Promise<void> {
    const authorizeInAccountNonce = (await account.nonce())
    const accountLinkAuthorized = BloctoAccount__factory.connect(account.address, authorized)
    const data = txData(1, testERC20.address, BigNumber.from(0),
      testERC20.interface.encodeFunctionData('transfer', [to, amount]))

    const sign = withChainId ? await signMessage(cosigner, account.address, authorizeInAccountNonce, data, authorized.address) : await signMessageWithoutChainId(cosigner, account.address, authorizeInAccountNonce, data)
    await accountLinkAuthorized.invoke1SignerSends(sign.v, sign.r, sign.s, data)
  }

  // use authorizedWallet and cosignerWallet to setDelegate from cosigner
  async function setDelegateByCosigner (account: BloctoAccount, interfaceId: string, delegateAddr: string,
    authorized: Wallet = authorizedWallet, cosigner: Wallet = cosignerWallet): Promise<void> {
    // const authorizeInAccountNonce = (await account.nonces(authorizedWallet.address)).add(1)
    const authorizeInAccountNonce = (await account.nonce()).add(1)
    const accountLinkCosigner = BloctoAccount__factory.connect(account.address, cosigner)

    const data = txData(1, account.address, BigNumber.from(0),
      account.interface.encodeFunctionData('setDelegate', [interfaceId, delegateAddr]))

    const sign = await signMessage(authorized, account.address, authorizeInAccountNonce, data)
    await accountLinkCosigner.invoke1CosignerSends(sign.v, sign.r, sign.s, authorizeInAccountNonce, authorized.address, data)
  }

  before(async function () {
    // 3 account
    [authorizedWallet, cosignerWallet, recoverWallet] = createAuthorizedCosignerRecoverWallet()
    await fund(authorizedWallet.address)
    await fund(cosignerWallet.address)
    // 4337
    entryPoint = await deployEntryPoint()

    // create3 factory
    create3Factory = await deployCREATE3Factory(ethersSigner)

    const accountSalt = hexZeroPad(Buffer.from('BloctoAccount_v140', 'utf-8'), 32)
    implementation = await create3Factory.getDeployed(await ethersSigner.getAddress(), accountSalt)
    expect((await ethers.provider.getCode(implementation))).to.equal('0x')

    await create3Factory.deploy(
      accountSalt,
      getDeployCode(new BloctoAccountCloneableWallet__factory(), [entryPoint.address])
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

  describe('emergency recovery performed (emergencyRecovery)', () => {
    let account: BloctoAccount

    const [authorizedWallet2, cosignerWallet2, recoverWallet2] = createAuthorizedCosignerRecoverWallet()
    let curAuthVersion: BigNumber
    // let accountLinkCosigner2: BloctoAccount

    before(async function () {
      // account for test
      account = await testCreateAccount(WalletSalt)
      const [px2, pxIndexWithParity2] = getMergedKey(authorizedWallet2, cosignerWallet2, 1)
      // must call with recovery address
      curAuthVersion = await account.authVersion()
      // fund
      await fund(recoverWallet.address)
      await fund(cosignerWallet2.address)
      const accountLinkRecovery = BloctoAccount__factory.connect(account.address, recoverWallet)
      const res = await accountLinkRecovery.emergencyRecovery(authorizedWallet2.address, cosignerWallet2.address, pxIndexWithParity2, px2)
      const receipt = await res.wait()
      // 81313
      log('emergencyRecovery gas used: ', receipt.gasUsed.toString())
    })

    it('backup key is different (check new authorized & cosigner)', async () => {
      expect(authorizedWallet.address).not.equal(authorizedWallet2.address)
      expect(cosignerWallet.address).not.equal(cosignerWallet2.address)
    })
    it('should be able to perform transactions with backup key (send ERC20)', async () => {
      // prepare
      const receiveAccount = createTmpAccount()
      await testERC20.mint(account.address, TWO_ETH)

      // test send ERC20
      const before = await testERC20.balanceOf(account.address)
      const beforeRecevive = await testERC20.balanceOf(receiveAccount.address)

      await sendERC20ByCosigner(account, receiveAccount.address, ONE_ETH, true, authorizedWallet2, cosignerWallet2)

      expect(await testERC20.balanceOf(account.address)).to.equal(before.sub(ONE_ETH))
      expect(await testERC20.balanceOf(receiveAccount.address)).to.equal(beforeRecevive.add(ONE_ETH))
    })

    it('should not be able to perform transactions with old key', async function () {
      const receiveAccount = createTmpAccount()
      await expect(sendERC20ByCosigner(account, receiveAccount.address, ONE_ETH, true, authorizedWallet, cosignerWallet)).to.revertedWith('authorized addresses must be equal')
    })

    it('should see that the auth version has incremented', async function () {
      const authVersionIncrementor = await account.AUTH_VERSION_INCREMENTOR()
      const res = curAuthVersion.add(authVersionIncrementor)
      expect(await account.authVersion()).to.equal(res)
    })

    it('should be able to recover gas for previous version', async function () {
      // call recover gas
      // anyone can call recover gas
      const anyAccount = createTmpAccount()
      await fund(anyAccount.address)
      const accountLinkAny = BloctoAccount__factory.connect(account.address, anyAccount)
      const res = await accountLinkAny.recoverGas(1, [authorizedWallet.address])
      log('recoverGas gas used: ', (await res.wait()).gasUsed)
    })

    it('should be able to set a new recovery address', async function () {
      const setRecoveryAddressData = txData(1, account.address, BigNumber.from(0),
        account.interface.encodeFunctionData('setRecoveryAddress', [recoverWallet2.address]))

      await invokeWithCosigner(account, setRecoveryAddressData, authorizedWallet2, cosignerWallet2)

      expect(await account.recoveryAddress()).to.equal(recoverWallet2.address)
    })
  })

  describe('emergency recovery 2 performed (emergencyRecovery2)', () => {
    let account: BloctoAccount

    const [authorizedWallet2, cosignerWallet2, recoverWallet2] = createAuthorizedCosignerRecoverWallet()
    let curAuthVersion: BigNumber
    // let accountLinkCosigner2: BloctoAccount

    before(async function () {
      account = await testCreateAccount(WalletSalt + 2)
      const [px2, pxIndexWithParity2] = getMergedKey(authorizedWallet2, cosignerWallet2, 1)
      // must call with recovery address
      curAuthVersion = await account.authVersion()
      // fund
      await fund(recoverWallet.address)
      await fund(cosignerWallet2.address)
      const accountLinkRecovery = BloctoAccount__factory.connect(account.address, recoverWallet)
      const res = await accountLinkRecovery.emergencyRecovery2(authorizedWallet2.address, cosignerWallet2.address, recoverWallet2.address, pxIndexWithParity2, px2)
      const receipt = await res.wait()
      // 81313
      log('emergencyRecovery gas used: ', receipt.gasUsed.toString())
    })

    it('backup key is different (check new authorized & cosigner)', async () => {
      expect(authorizedWallet.address).not.equal(authorizedWallet2.address)
      expect(cosignerWallet.address).not.equal(cosignerWallet2.address)
    })
    it('should be able to perform transactions with backup key (send ERC20)', async () => {
      // prepare
      const receiveAccount = createTmpAccount()
      await testERC20.mint(account.address, TWO_ETH)

      // test send ERC20
      const before = await testERC20.balanceOf(account.address)
      const beforeRecevive = await testERC20.balanceOf(receiveAccount.address)

      await sendERC20ByCosigner(account, receiveAccount.address, ONE_ETH, true, authorizedWallet2, cosignerWallet2)

      expect(await testERC20.balanceOf(account.address)).to.equal(before.sub(ONE_ETH))
      expect(await testERC20.balanceOf(receiveAccount.address)).to.equal(beforeRecevive.add(ONE_ETH))
    })

    it('should not be able to perform transactions with old key', async function () {
      const receiveAccount = createTmpAccount()
      await expect(sendERC20ByCosigner(account, receiveAccount.address, ONE_ETH, true, authorizedWallet, cosignerWallet)).to.revertedWith('authorized addresses must be equal')
    })

    it('should see that the auth version has incremented', async function () {
      const authVersionIncrementor = await account.AUTH_VERSION_INCREMENTOR()
      const res = curAuthVersion.add(authVersionIncrementor)
      expect(await account.authVersion()).to.equal(res)
    })

    it('should be able to recover gas for previous version', async function () {
      // call recover gas
      // anyone can call recover gas
      const anyAccount = createTmpAccount()
      await fund(anyAccount.address)
      const accountLinkAny = BloctoAccount__factory.connect(account.address, anyAccount)
      const res = await accountLinkAny.recoverGas(1, [authorizedWallet.address])
      log('recoverGas gas used: ', (await res.wait()).gasUsed)
    })

    it('should be able to set a new recovery address', async function () {
      const setRecoveryAddressData = txData(1, account.address, BigNumber.from(0),
        account.interface.encodeFunctionData('setRecoveryAddress', [recoverWallet2.address]))

      await invokeWithCosigner(account, setRecoveryAddressData, authorizedWallet2, cosignerWallet2)

      expect(await account.recoveryAddress()).to.equal(recoverWallet2.address)
    })
  })

  describe('authorized wallet send tx', () => {
    const BloctoAccountSalt = 224230
    let account: BloctoAccount
    const [authorizedWallet2, cosignerWallet2, recoverWallet2] = createAuthorizedCosignerRecoverWallet()

    before(async function () {
      const [px2, pxIndexWithParity2] = getMergedKey(authorizedWallet2, cosignerWallet2, 1)
      account = await createAccount(
        ethersSigner,
        await authorizedWallet2.getAddress(),
        await cosignerWallet2.getAddress(),
        await recoverWallet2.getAddress(),
        BigNumber.from(BloctoAccountSalt),
        pxIndexWithParity2,
        px2,
        factory
      )

      // fund
      await fund(account)
      await fund(authorizedWallet2.address)
      await fund(cosignerWallet2.address)
    })

    it('should be able to perform transactions with authorized key (send ERC20)', async () => {
      // prepare
      const receiveAccount = createTmpAccount()
      await testERC20.mint(account.address, TWO_ETH)

      // test send ERC20
      const before = await testERC20.balanceOf(account.address)
      const beforeRecevive = await testERC20.balanceOf(receiveAccount.address)

      await sendERC20ByAuthorized(account, receiveAccount.address, ONE_ETH, true, authorizedWallet2, cosignerWallet2)

      expect(await testERC20.balanceOf(account.address)).to.equal(before.sub(ONE_ETH))
      expect(await testERC20.balanceOf(receiveAccount.address)).to.equal(beforeRecevive.add(ONE_ETH))
    })

    describe('isValidSignature test', () => {
      it('shoule return 0 for wrong authorized signature', async () => {
        const sig = '0x' + '2'.repeat(130)
        expect(await account.isValidSignature('0x' + '1'.repeat(64), sig)).to.equal('0x00000000')
      })
      it('shoule return 0 for wrong authorized with cosigner signature', async () => {
        const sig = '0x' + '2'.repeat(260)
        expect(await account.isValidSignature('0x' + '1'.repeat(64), sig)).to.equal('0x00000000')
      })

      it('shoule return 0 for wrong signature length', async () => {
        const sig = '0x' + '2'.repeat(360)
        expect(await account.isValidSignature('0x' + '1'.repeat(64), sig)).to.equal('0x00000000')
      })

      it('shoule return 0 for none zero authorized but zero for cosigner', async () => {
        const fakeHash = '0x' + '1'.repeat(64)
        const signWithAuthorized = await authorizedWallet.signMessage(ethers.utils.arrayify(fakeHash))

        const sig = signWithAuthorized + '1'.repeat(130)
        expect(await account.isValidSignature(fakeHash, sig)).to.equal('0x00000000')
      })
    })
  })

  describe('authorized wallet same as cosigner wallet send tx', () => {
    const BloctoAccountSalt = 224230
    let account: BloctoAccount
    const [authorizedWallet2, , recoverWallet2] = createAuthorizedCosignerRecoverWallet()

    before(async function () {
      const [px2, pxIndexWithParity2] = getMergedKey(authorizedWallet2, authorizedWallet2, 1)
      account = await createAccount(
        ethersSigner,
        await authorizedWallet2.getAddress(),
        await authorizedWallet2.getAddress(),
        await recoverWallet2.getAddress(),
        BigNumber.from(BloctoAccountSalt),
        pxIndexWithParity2,
        px2,
        factory
      )

      // fund
      await fund(account)
      await fund(authorizedWallet2.address)
    })

    it('should be able to perform transactions with authorized key (send ERC20)', async () => {
      // prepare
      const receiveAccount = createTmpAccount()
      await testERC20.mint(account.address, TWO_ETH)

      const data = txData(1, testERC20.address, BigNumber.from(0),
        testERC20.interface.encodeFunctionData('transfer', [receiveAccount.address, ONE_ETH]))

      const accountLinkAuthorized = BloctoAccount__factory.connect(account.address, authorizedWallet2)

      // test send ERC20
      const before = await testERC20.balanceOf(account.address)
      const beforeRecevive = await testERC20.balanceOf(receiveAccount.address)

      await accountLinkAuthorized.invoke0(data)
      expect(await testERC20.balanceOf(account.address)).to.equal(before.sub(ONE_ETH))
      expect(await testERC20.balanceOf(receiveAccount.address)).to.equal(beforeRecevive.add(ONE_ETH))
    })

    it('should be able to receive native token', async () => {
      // prepare
      const beforeRecevive = await ethers.provider.getBalance(account.address)
      const tx = await ethersSigner.sendTransaction({
        to: account.address,
        value: ONE_ETH // Sends exactly 1.0 ether
      })
      const receipt = await tx.wait()
      const receivedSelector = ethers.utils.id('Received(address,uint256)')
      expect(receipt.logs[0].topics[0]).to.equal(receivedSelector)
      expect(await ethers.provider.getBalance(account.address)).to.equal(beforeRecevive.add(ONE_ETH))
    })
  })

  describe('wallet delegate function', () => {
    const BloctoAccountSalt = 224230
    let account: BloctoAccount
    const [authorizedWallet2, cosignerWallet2, recoverWallet2] = createAuthorizedCosignerRecoverWallet()

    before(async function () {
      const [px2, pxIndexWithParity2] = getMergedKey(authorizedWallet2, authorizedWallet2, 1)
      account = await createAccount(
        ethersSigner,
        await authorizedWallet2.getAddress(),
        await cosignerWallet2.getAddress(),
        await recoverWallet2.getAddress(),
        BigNumber.from(BloctoAccountSalt),
        pxIndexWithParity2,
        px2,
        factory
      )

      // fund
      await fund(account)
      await fund(cosignerWallet2.address)
    })

    it('should be able to delegate function', async () => {
      await testERC20.mint(account.address, TWO_ETH)

      const interfaceId = testERC20.interface.encodeFunctionData('senderBalance')
      await setDelegateByCosigner(account, interfaceId, testERC20.address, authorizedWallet2, cosignerWallet2)

      const accountERC20 = TestERC20__factory.connect(account.address, authorizedWallet2)
      expect(await accountERC20.senderBalance()).to.equal(TWO_ETH)
    })

    it('should be able to delegate function 2', async () => {
      await testERC20.mint(account.address, TWO_ETH)
      await fund(authorizedWallet2.address)
      await fund(authorizedWallet2.address)

      const interfaceId = testERC20.interface.encodeFunctionData('payableLookBalance')
      await setDelegateByCosigner(account, interfaceId, testERC20.address, authorizedWallet2, cosignerWallet2)

      const accountERC20 = TestERC20__factory.connect(account.address, authorizedWallet2)
      const beforeRecevive = await ethers.provider.getBalance(account.address)
      await accountERC20.payableLookBalance({ value: ONE_ETH })
      expect(await ethers.provider.getBalance(account.address)).to.equal(beforeRecevive.add(ONE_ETH))
    })
  })
})
