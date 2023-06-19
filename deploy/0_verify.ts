import { getImplementationAddress } from '@openzeppelin/upgrades-core'
import hre, { ethers } from 'hardhat'

const BloctoAccountCloneableWalletAddr = '0x592D3167Cbb926379c1527f078F22E82FfAFdAa3'
const BloctoAccountFactoryAddr = '0x4b0C9eCC8A4577525688232977A346c1232a377E'
const EntryPoint = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789'

async function main (): Promise<void> {
  // verify BloctoAccountCloneableWallet
  await hre.run('verify:verify', {
    address: BloctoAccountCloneableWalletAddr,
    contract: 'contracts/BloctoAccountCloneableWallet.sol:BloctoAccountCloneableWallet',
    constructorArguments: [
      EntryPoint
    ]
  })

  // verify BloctoAccountFactory (if proxy)
  const accountFactoryImplAddress = await getImplementationAddress(ethers.provider, BloctoAccountFactoryAddr)
  await hre.run('verify:verify', {
    address: BloctoAccountFactoryAddr,
    contract: 'contracts/BloctoAccountFactory.sol:BloctoAccountFactory'
  })

  // verify BloctoAccountFactory (if not proxy)
  // await hre.run('verify:verify', {
  //   address: BloctoAccountFactoryAddr,
  //   contract: 'contracts/BloctoAccountFactory.sol:BloctoAccountFactory'
  // })
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
