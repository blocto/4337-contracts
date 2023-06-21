// update from https://github.com/borislav-itskov/schnorrkel.js
import hre, { ethers } from 'hardhat'
import { BigNumber } from 'ethers'
import { expect } from 'chai'
import {
  createAccount,
  createAuthorizedCosignerRecoverWallet,
  hashMessageEIP191V0
} from '../test/testutils'

import Schnorrkel from '../src/schnorrkel.js/index'
import { DefaultSigner } from '../test/schnorrUtils'

const ERC1271_MAGICVALUE_BYTES32 = '0x1626ba7e'

const BloctoAccountCloableWallet = '0x490B5ED8A17224a553c34fAA642161c8472118dd'
const FactoryAddress = '0x285cc5232236D227FCb23E6640f87934C948a028'

const RecoverAddress = '0x0c558b2735286533b834bd1172bcA43DBD2970f7'

const ethersSigner = ethers.provider.getSigner()

// multisig
const msg = 'just a test message'

const SALT = 515233151

async function main (): Promise<void> {
  // ---------------Create Account---------------- //
  const AccountFactory = await ethers.getContractFactory('BloctoAccountFactory')
  const factory = await AccountFactory.attach(FactoryAddress)

  const mergedKeyIndex = 128 + (0 << 1)
  const [authorizedWallet, cosignerWallet] = createAuthorizedCosignerRecoverWallet()
  const signerOne = new DefaultSigner(authorizedWallet)
  const signerTwo = new DefaultSigner(cosignerWallet)
  const publicKeys = [signerOne.getPublicKey(), signerTwo.getPublicKey()]
  const publicNonces = [signerOne.getPublicNonces(), signerTwo.getPublicNonces()]
  const combinedPublicKey = Schnorrkel.getCombinedPublicKey(publicKeys)
  const px = ethers.utils.hexlify(combinedPublicKey.buffer.slice(1, 33))
  // because of the parity byte is 2, 3 so sub 2
  const pxIndexWithParity = combinedPublicKey.buffer.slice(0, 1).readInt8() - 2 + mergedKeyIndex

  console.log('authorizedWallet.getAddress(): ', await authorizedWallet.getAddress(), ', cosignerWallet.getAddress()', await cosignerWallet.getAddress())

  console.log('ethersSigner address: ', await ethersSigner.getAddress())
  console.log('factory.address', factory.address)
  console.log('creating account...')
  const account = await createAccount(
    ethersSigner,
    await authorizedWallet.getAddress(),
    await cosignerWallet.getAddress(),
    RecoverAddress,
    BigNumber.from(SALT),
    pxIndexWithParity,
    px,
    factory
  )

  console.log('account create success! SCW Address: ', account.address)

  // ---------------Verify BloctoAccountProxy Contract---------------- //
  await hre.run('verify:verify', {
    address: account.address,
    contract: 'contracts/BloctoAccountProxy.sol:BloctoAccountProxy',
    constructorArguments: [
      BloctoAccountCloableWallet
    ]
  })

  // ---------------Verify Signature---------------- //
  const msgKeccak256 = ethers.utils.solidityKeccak256(['string'], [msg])
  const msgEIP191V0 = hashMessageEIP191V0(account.address, msgKeccak256)
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
}
// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
