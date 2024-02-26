
import hre, { ethers } from 'hardhat'
import { getImplementationAddress } from '@openzeppelin/upgrades-core'

const BloctoAccountFactoryAddr = '0x38DDa3Aed6e71457d573F993ee06380b1cDaF3D1'
const BloctoAccountCloneablelAddr = '0x77E262adD1b7DBF4ad7C39045CCC0FB22f060867'

async function main (): Promise<void> {
  const [owner] = await ethers.getSigners()
  console.log('upgrade with owner:', owner.address)

  // deploy BloctoAccountFactory to next version
  const BaseContract = await ethers.getContractFactory('BloctoAccountFactoryBase')
  const UpgradeContract = await ethers.getContractFactory('BloctoAccountFactory')
  const deployment = await upgrades.forceImport(BloctoAccountFactoryAddr, BaseContract)
  console.log('Proxy imported from:', deployment.address)
  // await upgrades.upgradeProxy(BloctoAccountFactoryAddr, UpgradeContract, { redeployImplementation: 'always' })
  // const UpgradeContract = await ethers.getContractFactory('BloctoAccountFactory')
  await upgrades.upgradeProxy(BloctoAccountFactoryAddr, UpgradeContract, { redeployImplementation: 'always', constructorArgs: [BloctoAccountCloneablelAddr], unsafeAllow: ['constructor', 'state-variable-immutable'] })

  console.log('sleep 16 seconds for chain sync...')
  await new Promise(f => setTimeout(f, 16000))

  // verify BloctoAccountFactory (if proxy)
  const accountFactoryImplAddress = await getImplementationAddress(ethers.provider, BloctoAccountFactoryAddr)
  await hre.run('verify:verify', {
    address: accountFactoryImplAddress,
    contract: 'contracts/v1.5.x/BloctoAccountFactory.sol:BloctoAccountFactory',
    constructorArguments: [
      BloctoAccountCloneablelAddr
    ]
  })
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
