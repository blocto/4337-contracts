import { EntryPoint__factory } from '@account-abstraction/contracts'
import { BigNumber } from 'ethers'
import { ethers } from 'hardhat'

const BloctoAccountCloneableWallet = 'BloctoAccountCloneableWallet'
const BloctoAccountFactory = 'BloctoAccountFactory'
const EntryPoint = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789'
const GasLimit = 6000000

async function main (): Promise<void> {
  // const lockedAmount = ethers.utils.parseEther("1");
  const [owner] = await ethers.getSigners()
  console.log('deploy with accoiunt: ', owner.address)

  const factory = await ethers.getContractFactory(BloctoAccountCloneableWallet)
  const walletCloneable = await factory.deploy(EntryPoint, {
    gasLimit: GasLimit
  })

  await walletCloneable.deployed()

  console.log(`${BloctoAccountCloneableWallet} deployed to: ${walletCloneable.address}`)

  // account factory
  const AccountFactory = await ethers.getContractFactory(BloctoAccountFactory)
  const accountFactory = await AccountFactory.deploy(walletCloneable.address, EntryPoint, {
    gasLimit: GasLimit
  })

  await accountFactory.deployed()

  console.log(`BloctoAccountFactory deployed to: ${accountFactory.address}`)

  // add stake
  const tx = await accountFactory.addStake(BigNumber.from(86400 * 3650), { value: ethers.utils.parseEther('0.1') })
  await tx.wait()

  const entrypoint = EntryPoint__factory.connect(EntryPoint, ethers.provider)
  const depositInfo = await entrypoint.getDepositInfo(accountFactory.address)
  console.log(depositInfo)
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
