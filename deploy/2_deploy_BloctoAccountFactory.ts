import { ethers } from 'hardhat'

const ContractName = 'BloctoAccountFactory'
const AccountToImplementation = '0x021DCa3104aa79f68EFEc784B56AFa382b1fd7b8'
const GasLimit = 6000000

async function main (): Promise<void> {
  // const lockedAmount = ethers.utils.parseEther("1");

  const factory = await ethers.getContractFactory(ContractName)
  const contract = await factory.deploy(AccountToImplementation, {
    gasLimit: GasLimit // set the gas limit to 6 million
  })

  await contract.deployed()

  console.log(`${ContractName} deployed to: ${contract.address}`)
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
