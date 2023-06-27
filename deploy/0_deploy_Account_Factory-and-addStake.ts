import { EntryPoint__factory } from '@account-abstraction/contracts'
import { BigNumber } from 'ethers'
import hre, { ethers } from 'hardhat'
import { getImplementationAddress } from '@openzeppelin/upgrades-core'

const BloctoAccountCloneableWallet = 'BloctoAccountCloneableWallet'
const BloctoAccountFactory = 'BloctoAccountFactory'
const EntryPoint = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789'
const GasLimit = 6000000

const CreateAccountBackend = '0x67465ec61c3c07b119e09fbb4a0b59eb1ba14e62'

async function main (): Promise<void> {
  // const lockedAmount = ethers.utils.parseEther("1");
  const [owner] = await ethers.getSigners()
  console.log('deploy with account: ', owner.address)

  const BloctoAccountCloneableWalletContract = await ethers.getContractFactory(BloctoAccountCloneableWallet)
  const walletCloneable = await BloctoAccountCloneableWalletContract.deploy(EntryPoint, {
    gasLimit: GasLimit
  })

  await walletCloneable.deployed()

  console.log(`${BloctoAccountCloneableWallet} deployed to: ${walletCloneable.address}`)

  // account factory
  const BloctoAccountFactoryContract = await ethers.getContractFactory(BloctoAccountFactory)
  const accountFactory = await upgrades.deployProxy(BloctoAccountFactoryContract, [walletCloneable.address, EntryPoint],
    { initializer: 'initialize', gasLimit: GasLimit })

  await accountFactory.deployed()

  console.log(`BloctoAccountFactory deployed to: ${accountFactory.address}`)

  // grant role
  console.log('Granting create account role to backend address: ', CreateAccountBackend)
  await accountFactory.grantRole(await accountFactory.CREATE_ACCOUNT_ROLE(), CreateAccountBackend)

  // add stake
  // console.log('Adding stake to account factory')
  // const tx = await accountFactory.addStake(BigNumber.from(86400 * 3650), { value: ethers.utils.parseEther('0.001') })
  // await tx.wait()

  // const entrypoint = EntryPoint__factory.connect(EntryPoint, ethers.provider)
  // const depositInfo = await entrypoint.getDepositInfo(accountFactory.address)
  // console.log('stake: ', ethers.utils.formatUnits(depositInfo.stake), ', unstakeDelaySec: ', depositInfo.unstakeDelaySec)

  // sleep 10 seconds
  console.log('sleep 10 seconds for chain sync...')
  await new Promise(f => setTimeout(f, 10000))

  // verify BloctoAccountCloneableWallet
  await hre.run('verify:verify', {
    address: walletCloneable.address,
    contract: 'contracts/BloctoAccountCloneableWallet.sol:BloctoAccountCloneableWallet',
    constructorArguments: [
      EntryPoint
    ]
  })

  // verify BloctoAccountFactory (if proxy)
  const accountFactoryImplAddress = await getImplementationAddress(ethers.provider, accountFactory.address)
  await hre.run('verify:verify', {
    address: accountFactoryImplAddress,
    contract: 'contracts/BloctoAccountFactory.sol:BloctoAccountFactory'
  })
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
