// update from https://github.com/borislav-itskov/schnorrkel.js
import { ethers } from 'hardhat'
import { BigNumber } from 'ethers'
import { expect } from 'chai'
import {
  BloctoAccountCloneableWallet__factory,
  BloctoAccountFactory
} from '../typechain'
import {
  createAccount,
  deployEntryPoint,
  createAuthorizedCosignerRecoverWallet,
  hashMessageEIP191V0
} from './testutils'

import Schnorrkel from '../src/schnorrkel.js/index'
import { DefaultSigner } from './schnorrUtils'

const ERC1271_MAGICVALUE_BYTES32 = '0x1626ba7e'

describe('Schnorr MultiSign Test', function () {
  const ethersSigner = ethers.provider.getSigner()

  let implementation: string
  let factory: BloctoAccountFactory

  before(async function () {
    // deploy entry point (only for fill address)
    const entryPoint = await deployEntryPoint()

    // v1 implementation
    implementation = (await new BloctoAccountCloneableWallet__factory(ethersSigner).deploy(entryPoint.address)).address

    // account factory
    const BloctoAccountFactory = await ethers.getContractFactory('BloctoAccountFactory')
    factory = await upgrades.deployProxy(BloctoAccountFactory, [implementation, entryPoint.address, await ethersSigner.getAddress()], { initializer: 'initialize' })
    await factory.grantRole(await factory.CREATE_ACCOUNT_ROLE(), await ethersSigner.getAddress())
  })

  it('should generate a schnorr musig2 and validate it on the blockchain', async () => {
    // create account
    // for only 1 byte, (isSchnorr,1)(authKeyIdx,6)(parity,1)
    const mergedKeyIndex = 128 + (0 << 1)
    const [authorizedWallet, cosignerWallet, recoverWallet] = createAuthorizedCosignerRecoverWallet()
    const signerOne = new DefaultSigner(authorizedWallet)
    const signerTwo = new DefaultSigner(cosignerWallet)
    const publicKeys = [signerOne.getPublicKey(), signerTwo.getPublicKey()]
    const publicNonces = [signerOne.getPublicNonces(), signerTwo.getPublicNonces()]
    const combinedPublicKey = Schnorrkel.getCombinedPublicKey(publicKeys)
    const px = ethers.utils.hexlify(combinedPublicKey.buffer.slice(1, 33))
    // because of the parity byte is 2, 3 so sub 2
    const pxIndexWithParity = combinedPublicKey.buffer.slice(0, 1).readInt8() - 2 + mergedKeyIndex
    const account = await createAccount(
      ethersSigner,
      await authorizedWallet.getAddress(),
      await cosignerWallet.getAddress(),
      await recoverWallet.getAddress(),
      BigNumber.from(123),
      pxIndexWithParity,
      px,
      factory
    )

    // multisig
    const msg = 'just a test message'

    const msgKeccak256 = ethers.utils.solidityKeccak256(['string'], [msg])
    const msgEIP191V0 = hashMessageEIP191V0((await ethers.provider.getNetwork()).chainId, account.address, msgKeccak256)
    // note: following line multiSignMessage ignore hash message
    const { signature: sigOne, challenge: e } = signerOne.multiSignMessage(msgEIP191V0, publicKeys, publicNonces)
    const { signature: sigTwo } = signerTwo.multiSignMessage(msgEIP191V0, publicKeys, publicNonces)
    const sSummed = Schnorrkel.sumSigs([sigOne, sigTwo])

    // wrap the result
    // e (bytes32), s (bytes32), pxIndexWithParity (uint8)
    // pxIndexWithParity (7 bit for pxIndex, 1 bit for parity)
    const hexPxIndexWithParity = ethers.utils.hexlify(pxIndexWithParity).slice(-2)
    const abiCoder = new ethers.utils.AbiCoder()
    const sigData = abiCoder.encode(['bytes32', 'bytes32'], [
      e.buffer,
      sSummed.buffer
    ]) + hexPxIndexWithParity
    const result = await account.isValidSignature(msgKeccak256, sigData)
    expect(result).to.equal(ERC1271_MAGICVALUE_BYTES32)
  })

  it('check none zero mergedKeyIndex', async () => {
    // create account
    // for only 1 byte, (isSchnorr,1)(authKeyIdx,6)(parity,1)
    const mergedKeyIndex = 128 + (2 << 1)
    // following same as test 'should generate a schnorr musig2 and validate it on the blockchain'
    const [authorizedWallet, cosignerWallet, recoverWallet] = createAuthorizedCosignerRecoverWallet()
    const signerOne = new DefaultSigner(authorizedWallet)
    const signerTwo = new DefaultSigner(cosignerWallet)
    const publicKeys = [signerOne.getPublicKey(), signerTwo.getPublicKey()]
    const publicNonces = [signerOne.getPublicNonces(), signerTwo.getPublicNonces()]
    const combinedPublicKey = Schnorrkel.getCombinedPublicKey(publicKeys)
    const px = ethers.utils.hexlify(combinedPublicKey.buffer.slice(1, 33))
    // because of the parity byte is 2, 3 so sub 2
    const pxIndexWithParity = combinedPublicKey.buffer.slice(0, 1).readInt8() - 2 + mergedKeyIndex
    const account = await createAccount(
      ethersSigner,
      await authorizedWallet.getAddress(),
      await cosignerWallet.getAddress(),
      await recoverWallet.getAddress(),
      BigNumber.from(123),
      pxIndexWithParity,
      px,
      factory
    )

    // multisig
    const msg = 'just a test message'

    const msgKeccak256 = ethers.utils.solidityKeccak256(['string'], [msg])
    const msgEIP191V0 = hashMessageEIP191V0((await ethers.provider.getNetwork()).chainId, account.address, msgKeccak256)
    // note: following line multiSignMessage ignore hash message
    const { signature: sigOne, challenge: e } = signerOne.multiSignMessage(msgEIP191V0, publicKeys, publicNonces)
    const { signature: sigTwo } = signerTwo.multiSignMessage(msgEIP191V0, publicKeys, publicNonces)
    const sSummed = Schnorrkel.sumSigs([sigOne, sigTwo])

    // wrap the result
    // e (bytes32), s (bytes32), pxIndexWithParity (uint8)
    // pxIndexWithParity (7 bit for pxIndex, 1 bit for parity)
    const hexPxIndexWithParity = ethers.utils.hexlify(pxIndexWithParity).slice(-2)
    const abiCoder = new ethers.utils.AbiCoder()
    const sigData = abiCoder.encode(['bytes32', 'bytes32'], [
      e.buffer,
      sSummed.buffer
    ]) + hexPxIndexWithParity
    const result = await account.isValidSignature(msgKeccak256, sigData)
    expect(result).to.equal(ERC1271_MAGICVALUE_BYTES32)
  })
})
