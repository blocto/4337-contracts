import { ethers } from 'hardhat'
import {
  WalletFactory__factory
} from '../../typechain'
import { hexZeroPad } from '@ethersproject/bytes'
// contact address
const BloctoAccountFactory = '0xbD4AE80F258ba3E75Dd9894d0D697a3e330B9483'
const ExpectWallet = '0x80F7323dCA5436883B990cfE8f1f7468BbCA75A4'
async function main(): Promise<void> {
  // const lockedAmount = ethers.utils.parseEther("1");
  const [owner] = await ethers.getSigners()
  console.log('Deploy with account: ', owner.address)

  const factory = WalletFactory__factory.connect(BloctoAccountFactory, owner)
  const recoveryAddress = '0xd185ab226fddaad1dc9201a9843c92b869a12600'
  const authorizedAddress = '0xe1cb2481ff8b01e6236ed199a06040dd36c841e6'
  const cosigner = '0x8172c88ef948f177a1d40fc7143323555e9db245'
  const cosignerBigInt = BigInt(cosigner)
  const salt = hexZeroPad('0x0', 32)

  await factory.deployCloneWallet2(recoveryAddress, authorizedAddress, cosignerBigInt, salt)

  // sleep 5 seconds
  console.log('Sleep 5 seconds for chain sync...')
  await new Promise(f => setTimeout(f, 5000))

  if ((await ethers.provider.getCode(ExpectWallet)) !== '0x') {
    console.log(`Deployed Wallet at ${ExpectWallet} successfully!`)
  }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
