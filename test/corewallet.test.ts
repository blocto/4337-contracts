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
import { hexZeroPad, Signature } from '@ethersproject/bytes'
import { deployCREATE3Factory, getDeployCode } from '../src/create3Factory'
import { create3DeployTransparentProxy } from '../src/deployAccountFactoryWithCreate3'
import { zeroAddress } from 'ethereumjs-util'

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

  describe('emergency recovery performed - emergencyRecovery', () => {
    let account: BloctoAccount

    const [authorizedWallet2, cosignerWallet2, recoverWallet2] = createAuthorizedCosignerRecoverWallet()
    let curAuthVersion: BigNumber
    let accountLinkRecovery: BloctoAccount
    const [px2, pxIndexWithParity2] = getMergedKey(authorizedWallet2, cosignerWallet2, 1)

    before(async function () {
      // account for test
      account = await testCreateAccount(WalletSalt)

      // must call with recovery address
      curAuthVersion = await account.authVersion()
      // fund
      await fund(recoverWallet.address)
      await fund(recoverWallet2.address)
      await fund(cosignerWallet2.address)
      accountLinkRecovery = BloctoAccount__factory.connect(account.address, recoverWallet)
    })

    it('should not be able to emergencyRecovery with wrong key', async () => {
      const tmpAccount = await createTmpAccount()
      const accountLinkWrongRecovery = BloctoAccount__factory.connect(account.address, tmpAccount)
      const [px2, pxIndexWithParity2] = getMergedKey(authorizedWallet2, cosignerWallet2, 1)

      await expect(
        accountLinkWrongRecovery.emergencyRecovery(authorizedWallet2.address, cosignerWallet2.address, pxIndexWithParity2, px2)
      ).to.be.revertedWith('sender must be recovery address')
    })

    it('should be able to emergencyRecovery', async () => {
      // const [px2, pxIndexWithParity2] = getMergedKey(authorizedWallet2, cosignerWallet2, 1)
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

    it('should not authorized with zero address', async () => {
      await expect(
        accountLinkRecovery.emergencyRecovery(zeroAddress(), cosignerWallet2.address, pxIndexWithParity2, px2)
      ).to.revertedWith('authorized address must not be zero')
    })

    it('should not authorized same as recovery', async () => {
      await expect(
        accountLinkRecovery.emergencyRecovery(recoverWallet.address, cosignerWallet2.address, pxIndexWithParity2, px2)
      ).to.revertedWith('do not use the recovery address as an authorized address')
    })

    it('should not init cosigner is zero address', async () => {
      await expect(
        accountLinkRecovery.emergencyRecovery(authorizedWallet2.address, zeroAddress(), pxIndexWithParity2, px2)
      ).to.revertedWith('cosigner address must not be zero')
    })
  })

  describe('emergency recovery 2 performed - emergencyRecovery2', () => {
    let account: BloctoAccount
    let accountLinkRecovery: BloctoAccount

    const [authorizedWallet2, cosignerWallet2, recoverWallet2] = createAuthorizedCosignerRecoverWallet()
    let curAuthVersion: BigNumber
    const [px2, pxIndexWithParity2] = getMergedKey(authorizedWallet2, cosignerWallet2, 1)
    // let accountLinkCosigner2: BloctoAccount

    before(async function () {
      account = await testCreateAccount(WalletSalt + 2)
      // const [px2, pxIndexWithParity2] = getMergedKey(authorizedWallet2, cosignerWallet2, 1)
      // must call with recovery address
      curAuthVersion = await account.authVersion()
      // fund
      await fund(recoverWallet.address)
      await fund(recoverWallet2.address)
      await fund(cosignerWallet2.address)
      accountLinkRecovery = BloctoAccount__factory.connect(account.address, recoverWallet)
      const res = await accountLinkRecovery.emergencyRecovery2(authorizedWallet2.address, cosignerWallet2.address, recoverWallet2.address, pxIndexWithParity2, px2)
      const receipt = await res.wait()
      // 81313
      log('emergencyRecovery gas used: ', receipt.gasUsed.toString())
    })

    it('should not perform emergencyRecovery2 if wrong key', async () => {
      await expect(
        accountLinkRecovery.emergencyRecovery2(authorizedWallet2.address, cosignerWallet2.address, recoverWallet2.address, pxIndexWithParity2, px2)
      ).to.revertedWith('sender must be recovery address')
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

    it('should be able to set a new recovery address', async function () {
      const setRecoveryAddressData = txData(1, account.address, BigNumber.from(0),
        account.interface.encodeFunctionData('setRecoveryAddress', [recoverWallet2.address]))

      await invokeWithCosigner(account, setRecoveryAddressData, authorizedWallet2, cosignerWallet2)

      expect(await account.recoveryAddress()).to.equal(recoverWallet2.address)
    })

    it('should not authorized with zero address', async () => {
      accountLinkRecovery = BloctoAccount__factory.connect(account.address, recoverWallet2)
      await expect(
        accountLinkRecovery.emergencyRecovery2(zeroAddress(), cosignerWallet2.address, recoverWallet2.address, pxIndexWithParity2, px2)
      ).to.revertedWith('authorized address must not be zero')
    })

    it('should not authorized same as recovery', async () => {
      await expect(
        accountLinkRecovery.emergencyRecovery2(recoverWallet2.address, cosignerWallet2.address, recoverWallet2.address, pxIndexWithParity2, px2)
      ).to.revertedWith('do not use the recovery address as an authorized address')
    })

    it('should not cosigner same as recovery', async () => {
      await expect(
        accountLinkRecovery.emergencyRecovery2(authorizedWallet2.address, recoverWallet.address, recoverWallet.address, pxIndexWithParity2, px2)
      ).to.revertedWith('do not use the recovery address as a cosigner')
    })

    it('should not cosigner is zero address', async () => {
      await expect(
        accountLinkRecovery.emergencyRecovery2(authorizedWallet2.address, zeroAddress(), recoverWallet2.address, pxIndexWithParity2, px2)
      ).to.revertedWith('cosigner address must not be zero')
    })
    it('should not recovery is zero address', async () => {
      await expect(
        accountLinkRecovery.emergencyRecovery2(authorizedWallet2.address, cosignerWallet2.address, zeroAddress(), pxIndexWithParity2, px2)
      ).to.revertedWith('cosigner address must not be zero')
    })
  })

  describe('recoverGas function', () => {
    let account: BloctoAccount
    let accountLinkAny: BloctoAccount

    const [authorizedWallet2, cosignerWallet2, recoverWallet2] = createAuthorizedCosignerRecoverWallet()
    before(async function () {
      account = await testCreateAccount(WalletSalt + 359)

      // emergencyRecovery2 one time
      const [px2, pxIndexWithParity2] = getMergedKey(authorizedWallet2, cosignerWallet2, 1)
      const accountLinkRecovery = BloctoAccount__factory.connect(account.address, recoverWallet)
      await accountLinkRecovery.emergencyRecovery2(authorizedWallet2.address, cosignerWallet2.address, recoverWallet2.address, pxIndexWithParity2, px2)

      const anyAccount = createTmpAccount()
      await fund(anyAccount.address)
      accountLinkAny = BloctoAccount__factory.connect(account.address, anyAccount)
    })

    it('should not be able to recover gas for wrong version', async function () {
      const authVersion = await account.authVersion()
      await expect(
        accountLinkAny.recoverGas(authVersion, [authorizedWallet.address])
      ).to.revertedWith('invalid version number')
    })

    it('should not be able to recover gas for now version', async function () {
      let authVersion = await account.authVersion()
      authVersion = authVersion.shr(160)
      await expect(
        accountLinkAny.recoverGas(authVersion, [authorizedWallet.address])
      ).to.revertedWith('only recover gas from expired authVersions')
    })

    it('should be able to recover gas for previous version', async function () {
      let authVersion = await account.authVersion()
      authVersion = authVersion.shr(160).sub(1)
      const res = await accountLinkAny.recoverGas(authVersion, [authorizedWallet.address])
      log('recoverGas gas used: ', (await res.wait()).gasUsed)
    })
  })

  describe('setRecoveryAddress function', () => {
    let account: BloctoAccount
    const [, , recoverWallet2] = createAuthorizedCosignerRecoverWallet()
    before(async function () {
      // account for test
      account = await testCreateAccount(368)
    })

    it('should not be able to set a new recovery address by wrong key', async function () {
      const tmpAccount = createTmpAccount()
      const setRecoveryAddressData = txData(1, account.address, BigNumber.from(0),
        account.interface.encodeFunctionData('setRecoveryAddress', [recoverWallet2.address]))

      await expect(
        invokeWithCosigner(account, setRecoveryAddressData, tmpAccount, cosignerWallet)
      ).to.revertedWith('invalid authorization')
    })

    it('should not be able to directly call setRecoveryAddress', async function () {
      const accountLinkCosigner = BloctoAccount__factory.connect(account.address, cosignerWallet)

      await expect(
        accountLinkCosigner.setRecoveryAddress(recoverWallet2.address)
      ).to.revertedWith('must be called from `invoke()`')
    })

    it('should not recovery address be zero address', async function () {
      const setRecoveryAddressData = txData(1, account.address, BigNumber.from(0),
        account.interface.encodeFunctionData('setRecoveryAddress', [zeroAddress()]))

      await expect(
        invokeWithCosigner(account, setRecoveryAddressData, authorizedWallet, cosignerWallet)
      ).to.revertedWith('recovery address must not be zero')
    })

    it('should not use an authorized address as the recovery address ', async function () {
      const setRecoveryAddressData = txData(1, account.address, BigNumber.from(0),
        account.interface.encodeFunctionData('setRecoveryAddress', [authorizedWallet.address]))

      await expect(
        invokeWithCosigner(account, setRecoveryAddressData, authorizedWallet, cosignerWallet)
      ).to.revertedWith('do not use an authorized address as the recovery address')
    })

    it('should not be able to directly set a new recovery address', async function () {
      const accountLinkCosigner = BloctoAccount__factory.connect(account.address, cosignerWallet)

      await expect(
        accountLinkCosigner.setRecoveryAddress(recoverWallet2.address)
      ).to.revertedWith('must be called from `invoke()`')
    })

    it('should be able to set a new recovery address', async function () {
      const setRecoveryAddressData = txData(1, account.address, BigNumber.from(0),
        account.interface.encodeFunctionData('setRecoveryAddress', [recoverWallet2.address]))

      await invokeWithCosigner(account, setRecoveryAddressData, authorizedWallet, cosignerWallet)

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

    it('should not be able to use invoke0', async () => {
      // prepare
      const receiveAccount = createTmpAccount()
      await testERC20.mint(account.address, TWO_ETH)

      const data = txData(1, testERC20.address, BigNumber.from(0),
        testERC20.interface.encodeFunctionData('transfer', [receiveAccount.address, ONE_ETH]))

      const accountLinkAuthorized = BloctoAccount__factory.connect(account.address, authorizedWallet2)

      await expect(
        accountLinkAuthorized.invoke0(data)
      ).to.revertedWith('invalid authorization')
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
      // only one signature
      it('shoule return 0 for wrong authorized signature', async () => {
        const sig = '0x' + '2'.repeat(130)
        expect(await account.isValidSignature('0x' + '1'.repeat(64), sig)).to.equal('0x00000000')
      })

      it('shoule revert if too big authorized signature', async () => {
        const sig = '0x' + 'a'.repeat(128) + '00'
        await expect(
          account.isValidSignature('0x' + '1'.repeat(64), sig)
        ).to.revertedWith('s of signature[0] is too large')
      })

      // two signature
      it('shoule return 0 for wrong authorized with cosigner signature', async () => {
        const sig = '0x' + '2'.repeat(260)
        expect(await account.isValidSignature('0x' + '1'.repeat(64), sig)).to.equal('0x00000000')
      })

      it('shoule revert if too big authorized signature - 2 signature', async () => {
        const sig = '0x' + 'a'.repeat(128) + '00' + '1'.repeat(130)
        await expect(
          account.isValidSignature('0x' + '1'.repeat(64), sig)
        ).to.revertedWith('s of signature[0] is too large')
      })

      it('shoule revert if too big cosigner signature - 2 signature', async () => {
        const sig = '0x' + '1'.repeat(130) + 'a'.repeat(128) + '00'
        await expect(
          account.isValidSignature('0x' + '1'.repeat(64), sig)
        ).to.revertedWith('s of signature[1] is too large')
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

    it('should not be able to delegate function with wrong key', async () => {
      const tmpAccount = createTmpAccount()
      const interfaceId = testERC20.interface.encodeFunctionData('senderBalance')

      await expect(
        setDelegateByCosigner(account, interfaceId, testERC20.address, authorizedWallet2, tmpAccount)
      ).to.revertedWith('must be called from `invoke()`')
    })

    it('should not be able to directly call delegate function', async () => {
      const interfaceId = testERC20.interface.encodeFunctionData('senderBalance')

      await expect(
        account.setDelegate(interfaceId, testERC20.address)
      ).to.revertedWith('must be called from `invoke()`')
    })

    it('should not be able to delegate to COMPOSITE_PLACEHOLDER', async () => {
      const composite = await account.COMPOSITE_PLACEHOLDER()

      const interfaceId = testERC20.interface.encodeFunctionData('senderBalance')
      await setDelegateByCosigner(account, interfaceId, composite, authorizedWallet2, cosignerWallet2)

      const accountERC20 = TestERC20__factory.connect(account.address, authorizedWallet2)
      await expect(
        accountERC20.senderBalance()
      ).to.revertedWith('invalid transaction')
    })

    it('should be able to delegate function with payable', async () => {
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

    // it('unknown function and data length = 0', async () => {
    //   await testERC20.mint(account.address, TWO_ETH)

    //   const interfaceId = testERC20.interface.encodeFunctionData('senderBalance')
    //   await setDelegateByCosigner(account, interfaceId, testERC20.address, authorizedWallet2, cosignerWallet2)

    //   const accountERC20 = TestERC20__factory.connect(account.address, authorizedWallet2)
    //   expect(await accountERC20.senderBalance()).to.equal(TWO_ETH)
    // })
  })

  describe('init function test', () => {
    let account: BloctoAccount
    before(async function () {
      const fakeEntrypoint = createTmpAccount()
      account = await new BloctoAccount__factory(ethersSigner).deploy(fakeEntrypoint.address)
    })
    it('should not init authorized with zero address', async () => {
      const fakeAddr = '0x' + 'a'.repeat(40)
      await expect(account.init(zeroAddress(), fakeAddr, fakeAddr, 1, '0x' + 'a'.repeat(64))).to.revertedWith('authorized addresses must not be zero')
    })

    it('should not init authorized same as recovery', async () => {
      const fakeAddr = '0x' + 'a'.repeat(40)
      const diffFakeAddr = '0x' + 'b'.repeat(40)
      await expect(account.init(fakeAddr, diffFakeAddr, fakeAddr, 1, '0x' + 'a'.repeat(64))).to.revertedWith('do not use the recovery address as an authorized address')
    })

    it('should not init cosigner same as recovery', async () => {
      const fakeAddr = '0x' + 'a'.repeat(40)
      const diffFakeAddr = '0x' + 'b'.repeat(40)
      await expect(account.init(diffFakeAddr, fakeAddr, fakeAddr, 1, '0x' + 'a'.repeat(64))).to.revertedWith('do not use the recovery address as a cosigner')
    })

    it('should not init cosigner is zero address', async () => {
      const fakeAddr = '0x' + 'a'.repeat(40)
      const diffFakeAddr = '0x' + 'b'.repeat(40)
      await expect(account.init(diffFakeAddr, zeroAddress(), fakeAddr, 1, '0x' + 'a'.repeat(64))).to.revertedWith('cosigner address must not be zero')
    })
  })

  describe('init2 function test', () => {
    let account: BloctoAccount
    const [authorizedWallet2, cosignerWallet2, recoverWallet2] = createAuthorizedCosignerRecoverWallet()

    before(async function () {
      const fakeEntrypoint = createTmpAccount()
      account = await new BloctoAccount__factory(ethersSigner).deploy(fakeEntrypoint.address)
    })

    it('should not init2 authorized zero length array', async () => {
      await expect(
        account.init2(
          [],
          cosignerWallet2.address, recoverWallet2.address,
          [],
          [])
      ).to.revertedWith('invalid authorizedAddresses array')
    })

    it('should not init2 array length fail', async () => {
      await expect(
        account.init2(
          [authorizedWallet.address, authorizedWallet2.address],
          cosignerWallet2.address, recoverWallet2.address,
          [],
          [])
      ).to.revertedWith('array length not match')
    })

    it('should not init2 array length fail 2', async () => {
      const [, pxIndexWithParity] = getMergedKey(authorizedWallet, cosignerWallet, 0)
      const [, pxIndexWithParity2] = getMergedKey(authorizedWallet2, cosignerWallet2, 1)

      await expect(
        account.init2(
          [authorizedWallet.address, authorizedWallet2.address],
          cosignerWallet2.address, recoverWallet2.address,
          [pxIndexWithParity, pxIndexWithParity2],
          [])
      ).to.revertedWith('array length not match')
    })

    it('should not init2 cosigner address be zero', async () => {
      const [px, pxIndexWithParity] = getMergedKey(authorizedWallet, cosignerWallet, 0)
      const [px2, pxIndexWithParity2] = getMergedKey(authorizedWallet2, cosignerWallet2, 1)

      await expect(
        account.init2(
          [authorizedWallet.address, authorizedWallet2.address],
          zeroAddress(), recoverWallet2.address,
          [pxIndexWithParity, pxIndexWithParity2],
          [px, px2])
      ).to.revertedWith('cosigner address must not be zero')
    })

    it('should not init2 authorized address be zero', async () => {
      const [px, pxIndexWithParity] = getMergedKey(authorizedWallet, cosignerWallet, 0)
      const [px2, pxIndexWithParity2] = getMergedKey(authorizedWallet2, cosignerWallet2, 1)

      await expect(
        account.init2(
          [zeroAddress(), authorizedWallet2.address],
          cosignerWallet2.address, recoverWallet2.address,
          [pxIndexWithParity, pxIndexWithParity2],
          [px, px2])
      ).to.revertedWith('authorized addresses must not be zero')
    })

    it('should not init2 use the recovery address as an cosigner address', async () => {
      const [px, pxIndexWithParity] = getMergedKey(authorizedWallet, cosignerWallet, 0)
      const [px2, pxIndexWithParity2] = getMergedKey(authorizedWallet2, cosignerWallet2, 1)

      await expect(
        account.init2(
          [authorizedWallet.address, authorizedWallet2.address],
          recoverWallet2.address, recoverWallet2.address,
          [pxIndexWithParity, pxIndexWithParity2],
          [px, px2])
      ).to.revertedWith('do not use the recovery address as a cosigner')
    })

    it('should not init2 use the recovery address as an authorized address', async () => {
      const [px, pxIndexWithParity] = getMergedKey(authorizedWallet, cosignerWallet, 0)
      const [px2, pxIndexWithParity2] = getMergedKey(authorizedWallet2, cosignerWallet2, 1)

      await expect(
        account.init2(
          [authorizedWallet.address, recoverWallet2.address],
          cosignerWallet2.address, recoverWallet2.address,
          [pxIndexWithParity, pxIndexWithParity2],
          [px, px2])
      ).to.revertedWith('do not use the recovery address as an authorized address')
    })
  })

  describe('invoke1CosignerSends function', () => {
    let account: BloctoAccount
    let newNonce: BigNumber
    let sign: Signature
    let anyData: Uint8Array
    const [authorizedWallet2, , recoverWallet2] = createAuthorizedCosignerRecoverWallet()

    before(async function () {
      const fakeEntrypoint = createTmpAccount()
      account = await new BloctoAccount__factory(ethersSigner).deploy(fakeEntrypoint.address)

      newNonce = (await account.nonce()).add(1)

      anyData = txData(1, account.address, BigNumber.from(0),
        account.interface.encodeFunctionData('setRecoveryAddress', [recoverWallet2.address]))
      sign = await signMessage(authorizedWallet2, account.address, newNonce, anyData)
    })

    it('should revert if v of signature is invalid', async () => {
      await expect(
        account.invoke1CosignerSends(0, sign.r, sign.s, newNonce, authorizedWallet2.address, anyData)
      ).to.revertedWith('invalid signature version')
    })

    it('should revert if s of signature is invalid', async () => {
      await expect(
        account.invoke1CosignerSends(sign.v, sign.r, '0x' + '8'.repeat(64), newNonce, authorizedWallet2.address, anyData)
      ).to.revertedWith('s of signature is too large')
    })

    it('should revert if signature is invalid', async () => {
      const fake32bytes = '0x' + '1'.repeat(64)
      await expect(
        account.invoke1CosignerSends(sign.v, fake32bytes, fake32bytes, newNonce, authorizedWallet2.address, anyData)
      ).to.revertedWith('invalid signature')
    })

    it('should revert if nonce is invalid', async () => {
      await expect(
        account.invoke1CosignerSends(sign.v, sign.r, sign.s, newNonce.add(11), authorizedWallet2.address, anyData)
      ).to.revertedWith('must use valid nonce for signer')
    })

    it('should revert if not authorized addresses must be equal', async () => {
      const anyAccount = createTmpAccount()
      const sign = await signMessage(anyAccount, account.address, newNonce, anyData)
      await expect(
        account.invoke1CosignerSends(sign.v, sign.r, sign.s, newNonce, authorizedWallet2.address, anyData)
      ).to.revertedWith('authorized addresses must be equal')
    })
  })

  describe('invoke1SignerSends function', () => {
    let account: BloctoAccount
    // let accountLinkAuthorized: BloctoAccount
    let authorizeInAccountNonce: BigNumber
    let sign: Signature
    let anyData: Uint8Array
    const [authorizedWallet2, cosignerWallet2, recoverWallet2] = createAuthorizedCosignerRecoverWallet()

    before(async function () {
      const [px2, pxIndexWithParity2] = getMergedKey(authorizedWallet2, cosignerWallet2, 1)
      account = await createAccount(
        ethersSigner,
        await authorizedWallet2.getAddress(),
        await cosignerWallet2.getAddress(),
        await recoverWallet2.getAddress(),
        BigNumber.from(850),
        pxIndexWithParity2,
        px2,
        factory
      )
      // accountLinkAuthorized = BloctoAccount__factory.connect(account.address, authorizedWallet2)
      anyData = txData(1, account.address, BigNumber.from(0),
        account.interface.encodeFunctionData('setRecoveryAddress', [recoverWallet2.address]))

      authorizeInAccountNonce = (await account.nonce())

      sign = await signMessage(cosignerWallet2, account.address, authorizeInAccountNonce, anyData, authorizedWallet2.address)
    })

    it('should revert if v of signature is invalid', async () => {
      await expect(
        account.invoke1SignerSends(0, sign.r, sign.s, anyData)
      ).to.revertedWith('invalid signature version')
    })

    it('should revert if s of signature is invalid', async () => {
      await expect(
        account.invoke1SignerSends(sign.v, sign.r, '0x' + '8'.repeat(64), anyData)
      ).to.revertedWith('s of signature is too large')
    })

    it('should revert if signature is invalid', async () => {
      const fake32bytes = '0x' + '1'.repeat(64)
      await expect(
        account.invoke1SignerSends(sign.v, fake32bytes, fake32bytes, anyData)
      ).to.revertedWith('invalid signature')
    })

    it('should revert if not authorized addresses must be equal', async () => {
      const anyAccount = createTmpAccount()
      const sign = await signMessage(anyAccount, account.address, authorizeInAccountNonce, anyData, authorizedWallet2.address)
      await expect(
        account.invoke1SignerSends(sign.v, sign.r, sign.s, anyData)
      ).to.revertedWith('invalid authorization')
    })
  })
})
