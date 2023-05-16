import { ethers } from 'hardhat'
import { Wallet, BigNumber } from 'ethers'
import { expect } from 'chai'
import {
  BloctoAccount,
  BloctoAccount__factory,
  BloctoAccountCloneableWallet,
  BloctoAccountCloneableWallet__factory,
  BloctoAccountFactory,
  BloctoAccountFactory__factory,
  TestERC20,
  TestERC20__factory,
  TestBloctoAccountCloneableWalletV140,
  TestBloctoAccountCloneableWalletV140__factory
} from '../typechain'
import { EntryPoint } from '@account-abstraction/contracts'
import {
  fund,
  createAccount,
  createAddress,
  createAccountOwner,
  deployEntryPoint,
  getBalance,
  isDeployed,
  ONE_ETH,
  TWO_ETH,
  HashZero,
  createAuthorizedCosignerRecoverWallet,
  getSetEntryPointCode,
  txData,
  signMessage,
  signUpgrade
} from './testutils'
// import { fillUserOpDefaults, getUserOpHash, signMessage, signUpgrade } from './UserOp'

describe('BloctoAccount Upgrade Test', function () {
  const ethersSigner = ethers.provider.getSigner()

  let authorizedWallet: Wallet
  let cosignerWallet: Wallet
  let recoverWallet: Wallet

  let implementation: string
  let factory: BloctoAccountFactory

  let entryPoint: EntryPoint

  let erc20: TestERC20

  async function testCreateAccount (salt: string): Promise<BloctoAccount> {
    const account = await createAccount(
      ethersSigner,
      await authorizedWallet.getAddress(),
      await cosignerWallet.getAddress(),
      await recoverWallet.getAddress(),
      salt,
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
    factory = await new BloctoAccountFactory__factory(ethersSigner).deploy(implementation);

    // 3 wallet
    [authorizedWallet, cosignerWallet, recoverWallet] = createAuthorizedCosignerRecoverWallet()
    await fund(cosignerWallet.address)

    // test erc20
    erc20 = await new TestERC20__factory(ethersSigner).deploy('Test ERC20', 'T20', 18)
  })

  describe('should upgrade to different version implementation', () => {
    const AccountSalt = '0x4eb84e5765b53776863ffa7c4965af012ded5be4000000000000000000000002'
    const MockEntryPointV070 = '0x000000000000000000000000000000000000E070'
    let account: BloctoAccount
    let implementationV140: TestBloctoAccountCloneableWalletV140

    async function upgradeAccountToV140 (): Promise<void> {
      const authorizeInAccountNonce = (await account.nonces(authorizedWallet.address)).add(1)
      const accountLinkCosigner = BloctoAccount__factory.connect(account.address, cosignerWallet)
      const upgradeToData = txData(1, account.address, BigNumber.from(0),
        account.interface.encodeFunctionData('upgradeTo', [implementationV140.address]))

      const sign = await signMessage(authorizedWallet, account.address, authorizeInAccountNonce, upgradeToData)
      await accountLinkCosigner.invoke1CosignerSends(sign.v, sign.r, sign.s, authorizeInAccountNonce, authorizedWallet.address, upgradeToData)
    }

    before(async () => {
      account = await testCreateAccount(AccountSalt)
      // mock new entry point version 0.7.0
      implementationV140 = await new TestBloctoAccountCloneableWalletV140__factory(ethersSigner).deploy(MockEntryPointV070)
      await factory.setImplementation(implementationV140.address)
    })

    it('upgrade fail if not by contract self', async () => {
      // upgrade revert even though upgrade by cosigner
      await expect(account.connect(cosignerWallet).upgradeTo(implementationV140.address))
        .to.revertedWith('must be called from `invoke()')
    })

    it('upgrade test', async () => {
      expect(await account.VERSION()).to.eql('1.3.0')
      await upgradeAccountToV140()
      // accountV140 = BloctoAccount__factory.connect(account.address, ethersSigner)
      expect(await account.VERSION()).to.eql('1.4.0')
    })

    it('factory getAddress some be same', async () => {
      const addrFromFacotry = await factory.getAddress(
        await cosignerWallet.getAddress(),
        await recoverWallet.getAddress(),
        AccountSalt)
      expect(addrFromFacotry).to.eql(account.address)
    })

    it('new account get new version', async () => {
      const randomSalt = '0x33384e5765b53776863ffa7c4965af012ded5be4000000000000000000000005'
      const accountNew = await createAccount(
        ethersSigner,
        await authorizedWallet.getAddress(),
        await cosignerWallet.getAddress(),
        await recoverWallet.getAddress(),
        randomSalt,
        factory
      )
      expect(await accountNew.VERSION()).to.eql('1.4.0')
    })

    it('should entrypoint be v070 address', async () => {
      expect(await account.entryPoint()).to.eql(MockEntryPointV070)
    })
  })
})
