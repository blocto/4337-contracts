import { ethers } from 'hardhat'
import { Wallet, BigNumber } from 'ethers'
import { expect } from 'chai'
import {
  BloctoAccount,
  BloctoAccount__factory,
  BloctoAccountCloneableWallet,
  BloctoAccountCloneableWallet__factory,
  BloctoAccount4337CloneableWallet,
  BloctoAccount4337CloneableWallet__factory,
  BloctoAccountFactory,
  BloctoAccountFactory__factory,
  TestERC20,
  TestERC20__factory,
  TestBloctoAccountV2,
  TestBloctoAccountV2__factory,
  BloctoAccount4337,
  BloctoAccount4337__factory
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
    // v1 implementation
    implementation = (await new BloctoAccountCloneableWallet__factory(ethersSigner).deploy()).address

    // account factory
    factory = await new BloctoAccountFactory__factory(ethersSigner).deploy(implementation);

    // 3 wallet
    [authorizedWallet, cosignerWallet, recoverWallet] = createAuthorizedCosignerRecoverWallet()
    await fund(cosignerWallet.address)

    // test erc20
    erc20 = await new TestERC20__factory(ethersSigner).deploy('Test ERC20', 'T20', 18)

    // 4337
    entryPoint = await deployEntryPoint()
  })

  describe('should upgrade with method2 invokeCosignerUpgrade', () => {
    // random value for account
    const AccountSalt = '0x4eb84e5765b53776863ffa7c4965af012ded5be4000000000000000000000001'
    let account: BloctoAccount
    let implementationV2: TestBloctoAccountV2

    async function upgradeAccountToImplementationV2 (): Promise<void> {
      const authorizeInAccountNonce = (await account.nonces(authorizedWallet.address)).add(1)
      const accountLinkCosigner = BloctoAccount__factory.connect(account.address, cosignerWallet)
      const sign = await signUpgrade(authorizedWallet, account.address, authorizeInAccountNonce, implementationV2.address)
      await accountLinkCosigner.invokeCosignerUpgrade(sign.v, sign.r, sign.s, authorizeInAccountNonce, authorizedWallet.address, implementationV2.address)
    }

    before(async () => {
      account = await testCreateAccount(AccountSalt)
      implementationV2 = await new TestBloctoAccountV2__factory(ethersSigner).deploy()
    })

    it('version check', async () => {
      expect(await account.VERSION()).to.eql('1.3.0')
      await upgradeAccountToImplementationV2()
      expect(await account.VERSION()).to.eql('1.3.1')
    })
  })
  describe('should upgrade to 4337 with method1 upgradeTo', () => {
    const AccountSalt = '0x4eb84e5765b53776863ffa7c4965af012ded5be4000000000000000000000002'
    let account: BloctoAccount
    let account4337: BloctoAccount4337
    let implementation4337: BloctoAccount4337CloneableWallet

    async function upgradeAccountToImplementation4337 (): Promise<void> {
      const authorizeInAccountNonce = (await account.nonces(authorizedWallet.address)).add(1)
      const accountLinkCosigner = BloctoAccount__factory.connect(account.address, cosignerWallet)
      const upgradeToData = txData(1, account.address, BigNumber.from(0),
        account.interface.encodeFunctionData('upgradeTo', [implementation4337.address]))

      const sign = await signMessage(authorizedWallet, account.address, authorizeInAccountNonce, upgradeToData)
      await accountLinkCosigner.invoke1CosignerSends(sign.v, sign.r, sign.s, authorizeInAccountNonce, authorizedWallet.address, upgradeToData)
    }

    before(async () => {
      account = await testCreateAccount(AccountSalt)
      implementation4337 = await new BloctoAccount4337CloneableWallet__factory(ethersSigner).deploy()
      await factory.setImplementation(implementation4337.address)
    })

    it('upgrade fail if not by contract self', async () => {
      // upgrade revert even though upgrade by cosigner
      await expect(account.connect(cosignerWallet).upgradeTo(implementation4337.address))
        .to.revertedWith('BloctoAccount: only self')
    })

    it('upgrade test', async () => {
      expect(await account.VERSION()).to.eql('1.3.0')
      await upgradeAccountToImplementation4337()
      account4337 = BloctoAccount4337__factory.connect(account.address, ethersSigner)
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

    it('should be v060 address', async () => {
      expect(await account4337.entryPoint()).to.eql(await implementation4337.EntryPointV060())
    })
  })
})
