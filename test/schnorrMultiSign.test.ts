// update from https://github.com/borislav-itskov/schnorrkel.js
import { ethers } from 'hardhat'
import { Wallet, BigNumber } from 'ethers'
import { expect } from 'chai'
import {
  BloctoAccount,
  BloctoAccount__factory,
  BloctoAccountCloneableWallet__factory,
  BloctoAccountFactory,
  BloctoAccountFactory__factory,
  TestBloctoAccountCloneableWalletV140,
  TestBloctoAccountCloneableWalletV140__factory
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
  logBytes,
  hashMessageEIP191V0
} from './testutils'

// import Schnorrkel, { Key, PublicNonces, SignatureOutput } from '@borislav.itskov/schnorrkel.js/src/index'
import Schnorrkel, { Key, PublicNonces, SignatureOutput } from '../src/schnorrkel.js/index'
import { DefaultSigner } from './schnorrUtils'

const ERC1271_MAGICVALUE_BYTES32 = '0x1626ba7e'

describe('Schnorr MultiSign Test', function () {
  const ethersSigner = ethers.provider.getSigner()

  let authorizedWallet: Wallet
  let cosignerWallet: Wallet
  let recoverWallet: Wallet
  // let account: BloctoAccount

  let implementation: string
  let factory: BloctoAccountFactory

  before(async function () {
    // deploy entry point (only for fill address)
    const entryPoint = await deployEntryPoint()

    // v1 implementation
    implementation = (await new BloctoAccountCloneableWallet__factory(ethersSigner).deploy(entryPoint.address)).address

    // account factory
    factory = await new BloctoAccountFactory__factory(ethersSigner).deploy(implementation, entryPoint.address);

    // 3 wallet
    [authorizedWallet, cosignerWallet, recoverWallet] = createAuthorizedCosignerRecoverWallet()
  })

  it('should generate a schnorr musig2 and validate it on the blockchain', async () => {
    // create account
    // for only 1 byte
    const mergedKeyIndex = 0

    const signerOne = new DefaultSigner(authorizedWallet)
    const signerTwo = new DefaultSigner(cosignerWallet)
    const publicKeys = [signerOne.getPublicKey(), signerTwo.getPublicKey()]
    const publicNonces = [signerOne.getPublicNonces(), signerTwo.getPublicNonces()]
    const combinedPublicKey = Schnorrkel.getCombinedPublicKey(publicKeys)
    const px = ethers.utils.hexlify(combinedPublicKey.buffer.slice(1, 33))
    // because of the parity byte is 2, 3 so sub 2
    const pxIndexWithPairty = combinedPublicKey.buffer.slice(0, 1).readInt8() - 2 + mergedKeyIndex
    const account = await createAccount(
      ethersSigner,
      await authorizedWallet.getAddress(),
      await cosignerWallet.getAddress(),
      await recoverWallet.getAddress(),
      BigNumber.from(123),
      pxIndexWithPairty,
      px,
      factory
    )

    // multisig
    const msg = 'just a test message'

    const msgKeccak256 = ethers.utils.solidityKeccak256(['string'], [msg])
    const msgEIP191V0 = hashMessageEIP191V0(account.address, msgKeccak256)
    // note: following line multiSignMessage ignore hash message
    const { signature: sigOne, challenge: e } = signerOne.multiSignMessage(msgEIP191V0, publicKeys, publicNonces)
    const { signature: sigTwo } = signerTwo.multiSignMessage(msgEIP191V0, publicKeys, publicNonces)
    const sSummed = Schnorrkel.sumSigs([sigOne, sigTwo])

    // wrap the result
    // e (bytes32), s (bytes32), pxIndexWithPairty (uint8)
    // pxIndexWithPairty (7 bit for pxIndex, 1 bit for parity)
    const hexPxIndexWithPairty = ethers.utils.hexlify(pxIndexWithPairty).slice(-2)
    const abiCoder = new ethers.utils.AbiCoder()
    const sigData = abiCoder.encode(['bytes32', 'bytes32'], [
      e.buffer,
      sSummed.buffer
    ]) + hexPxIndexWithPairty
    const result = await account.isValidSignature(msgKeccak256, sigData)
    expect(result).to.equal(ERC1271_MAGICVALUE_BYTES32)
  })
})
