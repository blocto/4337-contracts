import { getImplementationAddress } from '@openzeppelin/upgrades-core'
import hre, { ethers } from 'hardhat'

const BloctoAccountCloneableWalletAddr = '0x490B5ED8A17224a553c34fAA642161c8472118dd'
const BloctoAccountFactoryAddr = '0x285cc5232236D227FCb23E6640f87934C948a028'
// const BloctoAccountProxyCloneAddr = '0x6672e24A9D809A1b03317e83949572e71afae5be'
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
    address: accountFactoryImplAddress,
    contract: 'contracts/BloctoAccountFactory.sol:BloctoAccountFactory'
  })

  // verify BloctoAccountFactory (if not proxy)
  await hre.run('verify:verify', {
    address: '0x7db696a9130b0e2aea92b39bfe520861baa5fb83',
    contract: 'contracts/BloctoAccountFactory.sol:BloctoAccountFactory'
  })

  // verify BloctoAccountProxy
  // await hre.run('verify:verify', {
  //   address: BloctoAccountProxyCloneAddr,
  //   contract: 'contracts/BloctoAccountProxy.sol:BloctoAccountProxy',
  //   constructorArguments: [
  //     BloctoAccountCloneableWalletAddr
  //   ]
  // })
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
