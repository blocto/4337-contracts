import { ethers } from 'hardhat'
import { Wallet, BigNumber } from 'ethers'
import { expect } from 'chai'
import {
  BloctoAccount,
  BloctoAccount__factory,
  BloctoAccountCloneableWallet__factory,
  BloctoAccountFactory,
  BloctoAccountFactory__factory,
  TestBloctoAccountCloneableWalletV200,
  TestBloctoAccountCloneableWalletV200__factory
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
  getMergedKey
} from './testutils'

describe('BloctoAccount Upgrade Test', function () {
  const ethersSigner = ethers.provider.getSigner()

  let authorizedWallet: Wallet
  let cosignerWallet: Wallet
  let recoverWallet: Wallet

  let implementation: string
  let factory: BloctoAccountFactory

  let entryPoint: EntryPoint

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

  before(async function () {
    // 4337
    entryPoint = await deployEntryPoint()

    // v1 implementation
    implementation = (await new BloctoAccountCloneableWallet__factory(ethersSigner).deploy(entryPoint.address)).address

    // account factory
    factory = await new BloctoAccountFactory__factory(ethersSigner).deploy(implementation, entryPoint.address);

    // 3 wallet
    [authorizedWallet, cosignerWallet, recoverWallet] = createAuthorizedCosignerRecoverWallet()
    await fund(cosignerWallet.address)
  })

  describe('wallet function', () => {
    const AccountSalt = 123
    let account: BloctoAccount
    before(async () => {
      account = await testCreateAccount(AccountSalt)
    })

    it('test gas', async () => {

    })

    it('should receive native token', async () => {
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

  describe('should upgrade to different version implementation', () => {
    const AccountSalt = 12345
    const MockEntryPointV070 = '0x000000000000000000000000000000000000E070'
    let account: BloctoAccount
    let implementationV200: TestBloctoAccountCloneableWalletV200

    async function upgradeAccountToV200 (): Promise<void> {
      const authorizeInAccountNonce = (await account.nonces(authorizedWallet.address)).add(1)
      const accountLinkCosigner = BloctoAccount__factory.connect(account.address, cosignerWallet)
      const upgradeToData = txData(1, account.address, BigNumber.from(0),
        account.interface.encodeFunctionData('upgradeTo', [implementationV200.address]))

      const sign = await signMessage(authorizedWallet, account.address, authorizeInAccountNonce, upgradeToData)
      await accountLinkCosigner.invoke1CosignerSends(sign.v, sign.r, sign.s, authorizeInAccountNonce, authorizedWallet.address, upgradeToData)
    }

    before(async () => {
      account = await testCreateAccount(AccountSalt)
      // mock new entry point version 0.7.0
      implementationV200 = await new TestBloctoAccountCloneableWalletV200__factory(ethersSigner).deploy(MockEntryPointV070)
      await factory.setImplementation(implementationV200.address)
    })

    it('upgrade fail if not by contract self', async () => {
      // upgrade revert even though upgrade by cosigner
      await expect(account.connect(cosignerWallet).upgradeTo(implementationV200.address))
        .to.revertedWith('must be called from `invoke()')
    })

    it('upgrade test', async () => {
      await upgradeAccountToV200()
      expect(await account.VERSION()).to.eql('2.0.0')
    })

    it('factory getAddress some be same', async () => {
      const addrFromFacotry = await factory.getAddress(
        await cosignerWallet.getAddress(),
        await recoverWallet.getAddress(),
        AccountSalt)
      expect(addrFromFacotry).to.eql(account.address)
    })

    it('new account get new version', async () => {
      const randomSalt = 54326346
      const accountNew = await testCreateAccount(randomSalt)

      expect(await accountNew.VERSION()).to.eql('2.0.0')
    })

    it('should entrypoint be v070 address', async () => {
      expect(await account.entryPoint()).to.eql(MockEntryPointV070)
    })
  })
})
