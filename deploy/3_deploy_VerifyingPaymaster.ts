import { ethers } from 'hardhat'

const ContractName = 'VerifyingPaymaster'
// version 0.6.0 from https://mirror.xyz/erc4337official.eth/cSdZl9X-Hce71l_FzjVKQ5eN398ial7QmkDExmIIOQk
const EntryPointAddress = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789'
const VerifyingSigner = '0x086443C6bA8165a684F3e316Da42D3A2F0a2330a'
const GasLimit = 6000000

async function main (): Promise<void> {
  // const lockedAmount = ethers.utils.parseEther("1");

  const factory = await ethers.getContractFactory(ContractName)
  const contract = await factory.deploy(EntryPointAddress, VerifyingSigner, {
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
