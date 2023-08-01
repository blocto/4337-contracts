// update from https://github.com/borislav-itskov/schnorrkel.js
import { ethers } from 'hardhat'
import { BigNumber } from 'ethers'
import { expect } from 'chai'
import {
  BloctoAccount,
  BloctoAccountCloneableWallet__factory,
  BloctoAccount__factory,
  BloctoAccountFactory
} from '../typechain'
import {
  fund,
  createAccount,
  deployEntryPoint,
  createAuthorizedCosignerRecoverWallet,
  hashMessageEIP191V0,
  signMessage,
  txData
} from './testutils'

import Schnorrkel from '../src/schnorrkel.js/index'
import { DefaultSigner } from './schnorrUtils'
import { time } from 'console'

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

    // revoke key
    // only invoke from invoke functions
    await expect(account.setMergedKey(hexPxIndexWithParity, '0x' + '0'.repeat(64))).to.revertedWith('must be called from `invoke()`')

    // test setMergedKey
    const newNonce = (await account.nonce()).add(1)
    const setMergedKeyData = txData(1, account.address, BigNumber.from(0),
      account.interface.encodeFunctionData('setMergedKey', [Number('0x' + hexPxIndexWithParity), '0x' + '0'.repeat(64)]))
    const sign = await signMessage(authorizedWallet, account.address, newNonce, setMergedKeyData)
    const accountLinkCosigner = BloctoAccount__factory.connect(account.address, cosignerWallet)
    await fund(cosignerWallet.address)
    await accountLinkCosigner.invoke1CosignerSends(sign.v, sign.r, sign.s, newNonce, authorizedWallet.address, setMergedKeyData)
    await expect(account.isValidSignature(msgKeccak256, sigData)).to.revertedWith('ecrecover failed')
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

  describe('should update account key', () => {
    const [authorizedWallet, cosignerWallet, recoverWallet] = createAuthorizedCosignerRecoverWallet()
    const signerOne = new DefaultSigner(authorizedWallet)
    const signerTwo = new DefaultSigner(cosignerWallet)
    const publicKeys = [signerOne.getPublicKey(), signerTwo.getPublicKey()]
    let account: BloctoAccount

    let pxIndexWithParity: number
    let hexPxIndexWithParity: string

    // test data
    const msgPrefix = 'just a test message'

    async function validateSignData (): Promise<string> {
      // multisig
      const msg = msgPrefix

      const msgKeccak256 = ethers.utils.solidityKeccak256(['string'], [msg])

      const publicNonces = [signerOne.getPublicNonces(), signerTwo.getPublicNonces()]
      const msgEIP191V0 = hashMessageEIP191V0((await ethers.provider.getNetwork()).chainId, account.address, msgKeccak256)
      const { signature: sigOne, challenge: e } = signerOne.multiSignMessage(msgEIP191V0, publicKeys, publicNonces)
      const { signature: sigTwo } = signerTwo.multiSignMessage(msgEIP191V0, publicKeys, publicNonces)
      const sSummed = Schnorrkel.sumSigs([sigOne, sigTwo])

      const abiCoder = new ethers.utils.AbiCoder()
      const sigData = abiCoder.encode(['bytes32', 'bytes32'], [
        e.buffer,
        sSummed.buffer
      ]) + hexPxIndexWithParity
      return await account.isValidSignature(msgKeccak256, sigData)
    }

    before(async function () {
      const mergedKeyIndex = 128 + (0 << 1)
      // const [authorizedWallet, cosignerWallet, recoverWallet] = createAuthorizedCosignerRecoverWallet()
      // const signerOne = new DefaultSigner(authorizedWallet)
      // const signerTwo = new DefaultSigner(cosignerWallet)

      const combinedPublicKey = Schnorrkel.getCombinedPublicKey(publicKeys)
      const px = ethers.utils.hexlify(combinedPublicKey.buffer.slice(1, 33))
      // because of the parity byte is 2, 3 so sub 2
      pxIndexWithParity = combinedPublicKey.buffer.slice(0, 1).readInt8() - 2 + mergedKeyIndex
      hexPxIndexWithParity = ethers.utils.hexlify(pxIndexWithParity).slice(-2)

      account = await createAccount(
        ethersSigner,
        await authorizedWallet.getAddress(),
        await cosignerWallet.getAddress(),
        await recoverWallet.getAddress(),
        BigNumber.from(203),
        pxIndexWithParity,
        px,
        factory
      )
    })

    it('should sign Schnorr message', async () => {
      expect(await validateSignData()).to.equal(ERC1271_MAGICVALUE_BYTES32)
    })

    it('should revert if setMergedKey not invoke from intrenal', async () => {
      // revoke key
      // only invoke from invoke functions
      await expect(account.setMergedKey('0x' + hexPxIndexWithParity, '0x' + '0'.repeat(64))).to.revertedWith('must be called from `invoke()`')
    })

    it('should revert if revoke merged key', async () => {
      // test setMergedKey
      const newNonce = (await account.nonce()).add(1)
      const setMergedKeyData = txData(1, account.address, BigNumber.from(0),
        account.interface.encodeFunctionData('setMergedKey', [pxIndexWithParity, '0x' + '0'.repeat(64)]))
      const sign = await signMessage(authorizedWallet, account.address, newNonce, setMergedKeyData)
      const accountLinkCosigner = BloctoAccount__factory.connect(account.address, cosignerWallet)
      await fund(cosignerWallet.address)
      await accountLinkCosigner.invoke1CosignerSends(sign.v, sign.r, sign.s, newNonce, authorizedWallet.address, setMergedKeyData)

      await expect(validateSignData()).to.revertedWith('ecrecover failed')
    })

    it('should recover merged key', async () => {
      await expect(validateSignData()).to.revertedWith('ecrecover failed')
      const combinedPublicKey = Schnorrkel.getCombinedPublicKey(publicKeys)
      const px = ethers.utils.hexlify(combinedPublicKey.buffer.slice(1, 33))

      // test setMergedKey
      const newNonce = (await account.nonce()).add(1)
      const setMergedKeyData = txData(1, account.address, BigNumber.from(0),
        account.interface.encodeFunctionData('setMergedKey', [pxIndexWithParity, px]))
      const sign = await signMessage(authorizedWallet, account.address, newNonce, setMergedKeyData)
      const accountLinkCosigner = BloctoAccount__factory.connect(account.address, cosignerWallet)
      await fund(cosignerWallet.address)
      await accountLinkCosigner.invoke1CosignerSends(sign.v, sign.r, sign.s, newNonce, authorizedWallet.address, setMergedKeyData)

      const authVersion = await account.authVersion()
      expect(await account.mergedKeys(authVersion.add(pxIndexWithParity))).to.equal(px)
    })

    // expect(await validateSignData()).to.equal(ERC1271_MAGICVALUE_BYTES32)
    // await expect(validateSignData()).to.revertedWith('ecrecover failed')

    it('should revert if revoke merged key 2', async () => {
      // test setMergedKey
      const newNonce = (await account.nonce()).add(1)
      const setMergedKeyData = txData(1, account.address, BigNumber.from(0),
        account.interface.encodeFunctionData('setMergedKey', [pxIndexWithParity, '0x' + '0'.repeat(64)]))
      const sign = await signMessage(authorizedWallet, account.address, newNonce, setMergedKeyData)
      const accountLinkCosigner = BloctoAccount__factory.connect(account.address, cosignerWallet)
      await fund(cosignerWallet.address)
      await accountLinkCosigner.invoke1CosignerSends(sign.v, sign.r, sign.s, newNonce, authorizedWallet.address, setMergedKeyData)

      await expect(validateSignData()).to.revertedWith('ecrecover failed')
    })

    it('should update key by setAuthorized()', async () => {
      // now the merged key is revoked, so we can set new merged key
      await expect(validateSignData()).to.revertedWith('ecrecover failed')

      const combinedPublicKey = Schnorrkel.getCombinedPublicKey(publicKeys)
      const px = ethers.utils.hexlify(combinedPublicKey.buffer.slice(1, 33))
      // test setMergedKey
      const newNonce = (await account.nonce()).add(1)
      const setAuthorizedData = txData(1, account.address, BigNumber.from(0),
        account.interface.encodeFunctionData('setAuthorized', [authorizedWallet.address, cosignerWallet.address, pxIndexWithParity, px]))
      const sign = await signMessage(authorizedWallet, account.address, newNonce, setAuthorizedData)
      const accountLinkCosigner = BloctoAccount__factory.connect(account.address, cosignerWallet)
      await fund(cosignerWallet.address)
      await accountLinkCosigner.invoke1CosignerSends(sign.v, sign.r, sign.s, newNonce, authorizedWallet.address, setAuthorizedData)

      const authVersion = await account.authVersion()
      expect(await account.mergedKeys(authVersion.add(pxIndexWithParity))).to.equal(px)
      expect(await account.authorizations(authVersion.add(authorizedWallet.address))).to.equal(cosignerWallet.address)
    })
  })
})
