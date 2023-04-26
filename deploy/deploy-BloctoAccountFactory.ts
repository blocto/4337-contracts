import { ethers } from 'hardhat'

const contractName = 'BloctoAccountFactory'
// 0.6.0 entrypoint from https://mirror.xyz/erc4337official.eth/cSdZl9X-Hce71l_FzjVKQ5eN398ial7QmkDExmIIOQk
const EntryPointAddress = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789'

async function main (): Promise<void> {
  const factory = await ethers.getContractFactory(contractName)
  const contract = await factory.deploy(EntryPointAddress)

  await contract.deployed()

  console.log(`${contractName} deployed to: ${contract.address}`)
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
