// import { getImplementationAddress } from '@openzeppelin/upgrades-core'

import { ethers, upgrades } from 'hardhat'
import {
  BloctoAccountFactory__factory,
  BloctoAccountFactory
} from '../../typechain'

const BloctoAccountFactoryAddr = '0x0D98dc00DaccA2d2b4f7b356Eef42601E2091cFa'

async function main (): Promise<void> {
  // verify BloctoAccountFactory (if proxy)
  // await hre.run('verify:verify', {
  //   address: BloctoAccountFactoryAddr,
  //   contract: 'contracts/BloctoAccountFactory.sol:BloctoAccountFactory'
  // })
  // const [owner] = await ethers.getSigners()
  // const factory = await BloctoAccountFactory__factory.connect(BloctoAccountFactoryAddr, owner)
  // console.log(await factory.implementation())
  console.log('verify factory')
  const UpgradeContract = await ethers.getContractFactory('BloctoAccountFactory')

  await upgrades.validateImplementation(UpgradeContract)
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
