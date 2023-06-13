import hre from 'hardhat'

const BloctoAccountCloneableWalletAddr = '0x409bAa86c5B901Cd9fA35317f519c260a0e6231b'
const BloctoAccountFactoryAddr = '0x1522Db12e80fA5827ca462Ba6C317c63d38A4Bca'
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
  // verify BloctoAccountFactory
  await hre.run('verify:verify', {
    address: BloctoAccountFactoryAddr,
    contract: 'contracts/BloctoAccountFactory.sol:BloctoAccountFactory',
    constructorArguments: [
      BloctoAccountCloneableWalletAddr, EntryPoint
    ]
  })
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
