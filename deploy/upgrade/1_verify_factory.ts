import { getImplementationAddress } from '@openzeppelin/upgrades-core'
import hre, { ethers } from 'hardhat'

const BloctoAccountFactoryAddr = '0x38DDa3Aed6e71457d573F993ee06380b1cDaF3D1'

async function main (): Promise<void> {
  // verify BloctoAccountFactory (if proxy)
  const accountFactoryImplAddress = await getImplementationAddress(ethers.provider, BloctoAccountFactoryAddr)
  await hre.run('verify:verify', {
    address: accountFactoryImplAddress,
    contract: 'contracts/v1.5.x/BloctoAccountFactory.sol:BloctoAccountFactory'
  })
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
