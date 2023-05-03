import './aa.init'
import { Wallet } from 'ethers'
import { expect } from 'chai'
import {
  BloctoAccount,
  BloctoAccountFactory,
  TestCounter,
  TestCounter__factory
} from '../typechain'
import { EntryPoint } from '@account-abstraction/contracts'

import {
  fund,
  checkForGeth,
  tostr,
  calcGasUsage,
  deployEntryPoint,
  createAddress,
  simulationResultCatch,
  createAccount,
  createAuthorizedCosignerRecoverWallet
} from './testutils'
import { fillAndSignWithCoSigner, getUserOpHash } from './UserOp'
import { PopulatedTransaction } from 'ethers/lib/ethers'
import { ethers } from 'hardhat'

describe('EntryPoint', function () {
  let entryPoint: EntryPoint

  let authorizedWallet: Wallet
  let cosignerWallet: Wallet
  let recoverWallet: Wallet
  const ethersSigner = ethers.provider.getSigner()
  let account: BloctoAccount

  before(async function () {
    this.timeout(20000)
    await checkForGeth()

    const chainId = await ethers.provider.getNetwork().then(net => net.chainId)

    entryPoint = await deployEntryPoint();

    [authorizedWallet, cosignerWallet, recoverWallet] = createAuthorizedCosignerRecoverWallet();
    ({ proxy: account, accountFactory: BloctoAccountFactory } =
      await createAccount(
        ethersSigner,
        await authorizedWallet.getAddress(),
        await cosignerWallet.getAddress(),
        await recoverWallet.getAddress(),
        entryPoint.address
      ))
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
      [authorizedWallet1, cosignerWallet1, recoverWallet1] = createAuthorizedCosignerRecoverWallet();
      ({ proxy: account1 } = await createAccount(
        ethersSigner,
        await authorizedWallet1.getAddress(),
        await cosignerWallet1.getAddress(),
        await recoverWallet1.getAddress(),
        entryPoint.address
      ))
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
      const { returnInfo } = await entryPoint.callStatic
        .simulateValidation(op)
        .catch(simulationResultCatch)
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
      await expect(
        entryPoint.callStatic.simulateValidation(op)
      ).to.revertedWith('AA20 account not deployed')
    })

    it('should revert on oog if not enough verificationGas', async () => {
      const op = await fillAndSignWithCoSigner(
        { sender: account.address, verificationGasLimit: 1000 },
        authorizedWallet,
        cosignerWallet,
        entryPoint
      )
      await expect(
        entryPoint.callStatic.simulateValidation(op)
      ).to.revertedWith('AA23 reverted (or OOG)')
    })

    it('should succeed if validateUserOp succeeds', async () => {
      const op = await fillAndSignWithCoSigner(
        { sender: account1.address },
        authorizedWallet,
        cosignerWallet,
        entryPoint
      )
      await fund(account1)
      await entryPoint.callStatic
        .simulateValidation(op)
        .catch(simulationResultCatch)
    })
  })

  describe('#simulateHandleOp', () => {
    it('should simulate execution', async () => {
      const [authorizedWallet1, cosignerWallet1] = createAuthorizedCosignerRecoverWallet()
      const { proxy: account } = await createAccount(
        ethersSigner,
        await authorizedWallet.getAddress(),
        await cosignerWallet.getAddress(),
        await recoverWallet.getAddress(),
        entryPoint.address
      )
      await fund(account)
      const counter = await new TestCounter__factory(ethersSigner).deploy()

      const count = counter.interface.encodeFunctionData('count')
      const callData = account.interface.encodeFunctionData('execute', [counter.address, 0, count])
      // deliberately broken signature.. simulate should work with it too.
      const userOp = await fillAndSignWithCoSigner(
        {
          sender: account.address,
          callData
        },
        authorizedWallet1,
        cosignerWallet1,
        entryPoint
      )

      const ret = await entryPoint.callStatic.simulateHandleOp(userOp,
        counter.address,
        counter.interface.encodeFunctionData('counters', [account.address])
      ).catch(e => e.errorArgs)

      const [countResult] = counter.interface.decodeFunctionResult('counters', ret.targetResult)
      expect(countResult).to.eql(1)
      expect(ret.targetSuccess).to.be.true

      // actual counter is zero
      expect(await counter.counters(account.address)).to.eql(0)
    })
  })

  describe('without paymaster (account pays in eth)', () => {
    describe('#handleOps', () => {
      let counter: TestCounter
      let accountExecFromEntryPoint: PopulatedTransaction
      before(async () => {
        counter = await new TestCounter__factory(ethersSigner).deploy()
        const count = await counter.populateTransaction.count()
        accountExecFromEntryPoint = await account.populateTransaction.execute(counter.address, 0, count.data!)
      })

      it('account should pay for tx', async function () {
        const op = await fillAndSignWithCoSigner(
          {
            sender: account.address,
            callData: accountExecFromEntryPoint.data,
            verificationGasLimit: 1e6,
            callGasLimit: 1e6
          },
          authorizedWallet,
          cosignerWallet,
          entryPoint
        )

        const beneficiaryAddress = createAddress()
        const countBefore = await counter.counters(account.address)
        // for estimateGas, must specify maxFeePerGas, otherwise our gas check fails
        console.log('  == est gas=', await entryPoint.estimateGas.handleOps([op], beneficiaryAddress, { maxFeePerGas: 1e9 }).then(tostr))

        // must specify at least on of maxFeePerGas, gasLimit
        // (gasLimit, to prevent estimateGas to fail on missing maxFeePerGas, see above..)
        const rcpt = await entryPoint.handleOps([op], beneficiaryAddress, {
          maxFeePerGas: 1e9,
          gasLimit: 1e7
        }).then(async t => await t.wait())

        const countAfter = await counter.counters(account.address)
        expect(countAfter.toNumber()).to.equal(countBefore.toNumber() + 1)
        console.log('rcpt.gasUsed=', rcpt.gasUsed.toString(), rcpt.transactionHash)

        await calcGasUsage(rcpt, entryPoint, beneficiaryAddress)
      })
    })
  })
})
