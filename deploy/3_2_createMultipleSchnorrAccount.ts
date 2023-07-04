// update from https://github.com/borislav-itskov/schnorrkel.js
import { ethers } from 'hardhat'
import {
  createAuthorizedCosignerRecoverWallet,
  getMergedKey
} from '../test/testutils'

const FactoryAddress = '0x285cc5232236D227FCb23E6640f87934C948a028'

const RecoverAddress = '0x0c558b2735286533b834bd1172bcA43DBD2970f7'

const ethersSigner = ethers.provider.getSigner()

const SALT = 45215234123

async function main (): Promise<void> {
  // const lockedAmount = ethers.utils.parseEther("1");
  const AccountFactory = await ethers.getContractFactory('BloctoAccountFactory')
  const factory = await AccountFactory.attach(FactoryAddress)

  const [authorizedWallet, cosignerWallet] = createAuthorizedCosignerRecoverWallet()
  const [authorizedWallet2, cosignerWallet2] = createAuthorizedCosignerRecoverWallet()
  // const signerOne = new DefaultSigner(authorizedWallet)
  // const signerTwo = new DefaultSigner(cosignerWallet)
  // const publicKeys = [signerOne.getPublicKey(), signerTwo.getPublicKey()]
  // const publicNonces = [signerOne.getPublicNonces(), signerTwo.getPublicNonces()]
  // const combinedPublicKey = Schnorrkel.getCombinedPublicKey(publicKeys)
  // const px = ethers.utils.hexlify(combinedPublicKey.buffer.slice(1, 33))
  // because of the parity byte is 2, 3 so sub 2
  // const pxIndexWithParity = combinedPublicKey.buffer.slice(0, 1).readInt8() - 2 + mergedKeyIndex

  const [px, pxIndexWithParity] = getMergedKey(authorizedWallet, cosignerWallet, 0)
  const [px2, pxIndexWithParity2] = getMergedKey(authorizedWallet2, cosignerWallet2, 1)
  const [px3, pxIndexWithParity3] = getMergedKey(authorizedWallet2, cosignerWallet, 2)

  console.log('authorizedWallet.getAddress(): ', await authorizedWallet.getAddress(), ', cosignerWallet.getAddress()', await cosignerWallet.getAddress())

  console.log('ethersSigner address: ', await ethersSigner.getAddress())
  console.log('factory.address', factory.address)

  const tx = await factory.createAccount2([authorizedWallet.address, authorizedWallet2.address, cosignerWallet.address],
    cosignerWallet.address, RecoverAddress,
    SALT, // random salt
    [pxIndexWithParity, pxIndexWithParity2, pxIndexWithParity3],
    [px, px2, px3])

  console.log('after createAccount2')
  const receipt = await tx.wait()
  console.log(receipt.gasUsed)
}
// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
