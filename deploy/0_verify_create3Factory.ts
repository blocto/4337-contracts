import hre from 'hardhat'

const Create3FactoryAddr = '0x2f06F83f960ea999536f94df279815F79EeB4054'

async function main (): Promise<void> {
  // ---------------Verify BloctoAccountProxy Contract---------------- //
  await hre.run('verify:verify', {
    address: Create3FactoryAddr,
    contract: 'contracts/Create3/CREATE3Factory.sol:CREATE3Factory'
  })
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
