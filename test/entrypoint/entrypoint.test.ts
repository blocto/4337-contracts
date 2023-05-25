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
  BloctoAccountFactory__factory,
  TestAggregatedAccount__factory,
  TestAggregatedAccountFactory__factory,
  TestCounter,
  TestCounter__factory,
  TestExpirePaymaster,
  TestExpirePaymaster__factory,
  TestExpiryAccount,
  TestExpiryAccount__factory,
  TestPaymasterAcceptAll,
  TestPaymasterAcceptAll__factory,
  TestRevertAccount__factory,
  TestAggregatedAccount,
  TestSignatureAggregator,
  TestSignatureAggregator__factory,
  MaliciousAccount__factory,
  TestWarmColdAccount__factory
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
  getAggregatedAccountInitCode,
  simulationResultWithAggregationCatch, decodeRevertReason,
  createAuthorizedCosignerRecoverWallet
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
    account = await createAccount(
      ethersSigner,
      await authorizedWallet.getAddress(),
      await cosignerWallet.getAddress(),
      await recoverWallet.getAddress(),
      BigNumber.from(0),
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
      account1 = await createAccount(
        ethersSigner,
        await authorizedWallet1.getAddress(),
        await cosignerWallet1.getAddress(),
        await recoverWallet1.getAddress(),
        0,
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

    // it('should return stake of sender', async () => {
    //   const stakeValue = BigNumber.from(123)
    //   const unstakeDelay = 3
    //   // const { proxy: account2 } = await createAccount(ethersSigner, await ethersSigner.getAddress(), entryPoint.address)
    //   const [authorizedWallet2, cosignerWallet2, recoverWallet2] = createAuthorizedCosignerRecoverWallet()
    //   const account2 = await createAccount(
    //     ethersSigner,
    //     await authorizedWallet2.getAddress(),
    //     await cosignerWallet2.getAddress(),
    //     await recoverWallet2.getAddress(),
    //     0,
    //     factory)

    //   await fund(account2)
    //   await account2.execute(entryPoint.address, stakeValue, entryPoint.interface.encodeFunctionData('addStake', [unstakeDelay]))
    //   // const op = await fillAndSign({ sender: account2.address }, ethersSigner, entryPoint)
    //   const op = await fillAndSignWithCoSigner(
    //     { sender: account2.address },
    //     authorizedWallet2,
    //     cosignerWallet2,
    //     entryPoint
    //   )
    //   const result = await entryPoint.callStatic.simulateValidation(op).catch(simulationResultCatch)
    //   expect(result.senderInfo).to.eql({ stake: stakeValue, unstakeDelaySec: unstakeDelay })
    // })

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

    it('should fail creation for wrong sender', async () => {
      const op1 = await fillAndSignWithCoSigner({
        initCode: getAccountInitCode(factory, authorizedWallet1.address, cosignerWallet1.address, recoverWallet1.address, 0),
        sender: '0x'.padEnd(42, '1'),
        verificationGasLimit: 3e6
      },
      authorizedWallet1,
      cosignerWallet1,
      entryPoint
      )

      await expect(entryPoint.callStatic.simulateValidation(op1))
        .to.revertedWith('AA14 initCode must return sender')
    })

    it('should report failure on insufficient verificationGas (OOG) for creation', async () => {
      const [authorizedWallet2, cosignerWallet2, recoverWallet2] = createAuthorizedCosignerRecoverWallet()
      const initCode = getAccountInitCode(factory, authorizedWallet2.address, cosignerWallet2.address, recoverWallet2.address)
      const sender = await entryPoint.callStatic.getSenderAddress(initCode).catch(e => e.errorArgs.sender)

      const op0 = await fillAndSignWithCoSigner({
        initCode: initCode,
        sender: sender,
        verificationGasLimit: 8e5,
        maxFeePerGas: 0
      },
      authorizedWallet2,
      cosignerWallet2,
      entryPoint
      )

      // must succeed with enough verification gas.
      await expect(entryPoint.callStatic.simulateValidation(op0, { gasLimit: 1e6 }))
        .to.revertedWith('ValidationResult')

      const op1 = await fillAndSignWithCoSigner({
        initCode: initCode,
        sender: sender,
        verificationGasLimit: 1e5,
        maxFeePerGas: 0
      },
      authorizedWallet2,
      cosignerWallet2,
      entryPoint
      )
      await expect(entryPoint.callStatic.simulateValidation(op1, { gasLimit: 1e6 }))
        .to.revertedWith('AA13 initCode failed or OOG')
    })

    it('should succeed for creating an account', async () => {
      const [authorizedWallet2, cosignerWallet2, recoverWallet2] = createAuthorizedCosignerRecoverWallet()
      const initCode = getAccountInitCode(factory, authorizedWallet2.address, cosignerWallet2.address, recoverWallet2.address)
      const sender = await entryPoint.callStatic.getSenderAddress(initCode).catch(e => e.errorArgs.sender)

      const op1 = await fillAndSignWithCoSigner({
        initCode: initCode,
        sender: sender,
        verificationGasLimit: 8e5,
        maxFeePerGas: 0
      },
      authorizedWallet2,
      cosignerWallet2,
      entryPoint
      )
      await fund(op1.sender)

      await entryPoint.callStatic.simulateValidation(op1).catch(simulationResultCatch)
    })

    it('should succeed for creating an account with multiple authorize address', async () => {
      const [authorizedWallet2, cosignerWallet2, recoverWallet2] = createAuthorizedCosignerRecoverWallet()
      const authorizedWallet22 = createTmpAccount()

      const addresses = hexConcat([authorizedWallet2.address, authorizedWallet22.address])

      const initCode = getAccountInitCode2(factory, addresses, cosignerWallet2.address, recoverWallet2.address)
      const sender = await entryPoint.callStatic.getSenderAddress(initCode).catch(e => e.errorArgs.sender)

      const op1 = await fillAndSignWithCoSigner({
        initCode: initCode,
        sender: sender,
        verificationGasLimit: 8e5,
        maxFeePerGas: 0
      },
      authorizedWallet2,
      cosignerWallet2,
      entryPoint
      )
      await fund(op1.sender)

      await entryPoint.callStatic.simulateValidation(op1).catch(simulationResultCatch)
    })

    it('should not call initCode from entrypoint', async () => {
      // a possible attack: call an account's execFromEntryPoint through initCode. This might lead to stolen funds.
      const [authorizedWallet2, cosignerWallet2, recoverWallet2] = createAuthorizedCosignerRecoverWallet()
      const account = await createAccount(
        ethersSigner,
        await authorizedWallet2.getAddress(),
        await cosignerWallet2.getAddress(),
        await recoverWallet2.getAddress(),
        0,
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

    it('should not use banned ops during simulateValidation', async () => {
      const [authorizedWallet2, cosignerWallet2, recoverWallet2] = createAuthorizedCosignerRecoverWallet()
      const sender = await getAccountAddress(factory, cosignerWallet2.address, recoverWallet2.address)
      const initCode = getAccountInitCode(factory, authorizedWallet2.address, cosignerWallet2.address, recoverWallet2.address)
      const op1 = await fillAndSignWithCoSigner({
        initCode: initCode,
        sender: sender
      }, authorizedWallet2, cosignerWallet2, entryPoint)

      await fund(op1.sender)
      await entryPoint.simulateValidation(op1, { gasLimit: 10e6 }).catch(e => e)
      const block = await ethers.provider.getBlock('latest')
      const hash = block.transactions[0]
      await checkForBannedOps(hash, false)
    })
  })
})
