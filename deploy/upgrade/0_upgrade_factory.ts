
import hre, { ethers } from 'hardhat'
import { getImplementationAddress } from '@openzeppelin/upgrades-core'

const BloctoAccountFactoryAddr = '0x38DDa3Aed6e71457d573F993ee06380b1cDaF3D1'

async function main (): Promise<void> {
  const [owner] = await ethers.getSigners()
  console.log('upgrade with owner:', owner.address)
  // const create3Factory = CREATE3Factory__factory.connect(Create3FactoryAddress, owner)

  // deploy BloctoAccountFactory to next version
  const UpgradeContract = await ethers.getContractFactory('BloctoAccountFactory')
  const deployment = await upgrades.forceImport(BloctoAccountFactoryAddr, UpgradeContract)
  console.log('Proxy imported from:', deployment.address)
  await upgrades.upgradeProxy(BloctoAccountFactoryAddr, UpgradeContract, { redeployImplementation: 'always' })
  console.log('sleep 16 seconds for chain sync...')
  await new Promise(f => setTimeout(f, 16000))

  // verify BloctoAccountFactory (if proxy)
  const accountFactoryImplAddress = await getImplementationAddress(ethers.provider, BloctoAccountFactoryAddr)
  await hre.run('verify:verify', {
    address: accountFactoryImplAddress,
    contract: 'contracts/v1.5.x/BloctoAccountFactory.sol:BloctoAccountFactory'
  })
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
