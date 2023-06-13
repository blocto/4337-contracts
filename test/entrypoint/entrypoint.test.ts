import './aa.init'
import { BigNumber, Event, Wallet } from 'ethers'
import { expect } from 'chai'
import {
  EntryPoint,
  BloctoAccount,
  BloctoAccountFactory,
  BloctoAccountCloneableWallet,
  BloctoAccountCloneableWallet__factory,
  BloctoAccountFactory,
  BloctoAccountFactory__factory
} from '../../typechain'
import {
  AddressZero,
  createAccountOwner,
  fund,
  checkForGeth,
  rethrow,
  tostr,
  getAccountInitCode,
  getAccountInitCode2,
  calcGasUsage,
  ONE_ETH,
  TWO_ETH,
  deployEntryPoint,
  getBalance,
  createAddress,
  getAccountAddress,
  HashZero,
  simulationResultCatch,
  createTmpAccount,
  createAccount,
  createAuthorizedCosignerRecoverWallet,
  getMergedKey
} from '../testutils'
import { checkForBannedOps } from './entrypoint_utils'
import { DefaultsForUserOp, getUserOpHash, fillAndSignWithCoSigner } from './UserOp'
import { UserOperation } from './UserOperation'
import { PopulatedTransaction } from 'ethers/lib/ethers'
import { ethers } from 'hardhat'
import { arrayify, defaultAbiCoder, hexConcat, hexZeroPad, parseEther } from 'ethers/lib/utils'
import { BytesLike } from '@ethersproject/bytes'
import { toChecksumAddress } from 'ethereumjs-util'

describe('EntryPoint', function () {
  let entryPoint: EntryPoint
  let BloctoAccountFactory: BloctoAccountFactory

  let authorizedWallet: Wallet
  let cosignerWallet: Wallet
  let recoverWallet: Wallet
  const ethersSigner = ethers.provider.getSigner()
  let account: BloctoAccount

  let implementation: string
  let factory: BloctoAccountFactory

  const globalUnstakeDelaySec = 2
  const paymasterStake = ethers.utils.parseEther('2')

  before(async function () {
    this.timeout(20000)
    await checkForGeth()

    const chainId = await ethers.provider.getNetwork().then(net => net.chainId)

    entryPoint = await deployEntryPoint()

    // v1 implementation
    implementation = (await new BloctoAccountCloneableWallet__factory(ethersSigner).deploy(entryPoint.address)).address

    // account factory
    factory = await new BloctoAccountFactory__factory(ethersSigner).deploy(implementation, entryPoint.address);

    [authorizedWallet, cosignerWallet, recoverWallet] = createAuthorizedCosignerRecoverWallet()
    const [px, pxIndexWithParity] = getMergedKey(authorizedWallet, cosignerWallet, 0)
    account = await createAccount(
      ethersSigner,
      await authorizedWallet.getAddress(),
      await cosignerWallet.getAddress(),
      await recoverWallet.getAddress(),
      0,
      pxIndexWithParity,
      px,
      factory
    )
    await fund(account)

    // sanity: validate helper functions
    const sampleOp = await fillAndSignWithCoSigner(
      { sender: account.address },
      authorizedWallet,
      cosignerWallet,
      entryPoint
    )
    expect(getUserOpHash(sampleOp, entryPoint.address, chainId)).to.eql(await entryPoint.getUserOpHash(sampleOp))
  })

  describe('#simulateValidation', () => {
    let account1: BloctoAccount
    let authorizedWallet1: Wallet
    let cosignerWallet1: Wallet
    let recoverWallet1: Wallet

    before(async () => {
      [authorizedWallet1, cosignerWallet1, recoverWallet1] = createAuthorizedCosignerRecoverWallet()
      const [px, pxIndexWithParity] = getMergedKey(authorizedWallet, cosignerWallet, 0)
      account1 = await createAccount(
        ethersSigner,
        await authorizedWallet1.getAddress(),
        await cosignerWallet1.getAddress(),
        await recoverWallet1.getAddress(),
        0,
        pxIndexWithParity,
        px,
        factory)
    })
    it('should fail if validateUserOp fails', async () => {
      // using wrong nonce
      const op = await fillAndSignWithCoSigner(
        { sender: account.address, nonce: 1234 },
        authorizedWallet,
        cosignerWallet,
        entryPoint
      )
      await expect(entryPoint.callStatic.simulateValidation(op)).to
        .revertedWith('AA25 invalid account nonce')
    })

    it('should report signature failure without revert', async () => {
      // (this is actually a feature of the wallet, not the entrypoint)
      // using wrong owner for account1
      // (zero gas price so it doesn't fail on prefund)
      const op = await fillAndSignWithCoSigner(
        { sender: account1.address, maxFeePerGas: 0 },
        authorizedWallet,
        cosignerWallet,
        entryPoint
      )

      const { returnInfo } = await entryPoint.callStatic.simulateValidation(op).catch(simulationResultCatch)
      expect(returnInfo.sigFailed).to.be.true
    })

    it('should revert if wallet not deployed (and no initcode)', async () => {
      const op = await fillAndSignWithCoSigner(
        {
          sender: createAddress(),
          nonce: 0,
          verificationGasLimit: 1000
        },
        authorizedWallet,
        cosignerWallet,
        entryPoint
      )

      await expect(entryPoint.callStatic.simulateValidation(op)).to
        .revertedWith('AA20 account not deployed')
    })

    it('should revert on oog if not enough verificationGas', async () => {
      const op = await fillAndSignWithCoSigner(
        { sender: account.address, verificationGasLimit: 1000 },
        authorizedWallet,
        cosignerWallet,
        entryPoint
      )
      await expect(entryPoint.callStatic.simulateValidation(op)).to
        .revertedWith('AA23 reverted (or OOG)')
    })

    it('should succeed if validateUserOp succeeds', async () => {
      const op = await fillAndSignWithCoSigner(
        { sender: account1.address },
        authorizedWallet1,
        cosignerWallet1,
        entryPoint
      )
      await fund(account1)
      await entryPoint.callStatic.simulateValidation(op).catch(simulationResultCatch)
    })

    it('should return empty context if no paymaster', async () => {
      const op = await fillAndSignWithCoSigner(
        { sender: account1.address, maxFeePerGas: 0 },
        authorizedWallet1,
        cosignerWallet1,
        entryPoint
      )
      const { returnInfo } = await entryPoint.callStatic.simulateValidation(op).catch(simulationResultCatch)
      expect(returnInfo.paymasterContext).to.eql('0x')
    })

    it('should prevent overflows: fail if any numeric value is more than 120 bits', async () => {
      const op = await fillAndSignWithCoSigner(
        {
          preVerificationGas: BigNumber.from(2).pow(130),
          sender: account1.address
        },
        authorizedWallet1,
        cosignerWallet1,
        entryPoint
      )

      await expect(
        entryPoint.callStatic.simulateValidation(op)
      ).to.revertedWith('gas values overflow')
    })

    it('should not call initCode from entrypoint', async () => {
      // a possible attack: call an account's execFromEntryPoint through initCode. This might lead to stolen funds.
      const [authorizedWallet2, cosignerWallet2, recoverWallet2] = createAuthorizedCosignerRecoverWallet()
      const [px, pxIndexWithParity] = getMergedKey(authorizedWallet2, cosignerWallet2, 0)
      const account = await createAccount(
        ethersSigner,
        await authorizedWallet2.getAddress(),
        await cosignerWallet2.getAddress(),
        await recoverWallet2.getAddress(),
        0,
        pxIndexWithParity,
        px,
        factory)

      const sender = createAddress()
      const op1 = await fillAndSignWithCoSigner({
        initCode: hexConcat([
          account.address,
          account.interface.encodeFunctionData('execute', [sender, 0, '0x'])
        ]),
        sender: sender,
        verificationGasLimit: 1e5,
        maxFeePerGas: 0
      }, authorizedWallet2, cosignerWallet2, entryPoint)

      const error = await entryPoint.callStatic.simulateValidation(op1).catch(e => e)
      expect(error.message).to.match(/initCode failed or OOG/, error)
    })
  })
})
