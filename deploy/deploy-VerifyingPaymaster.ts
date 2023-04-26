import { ethers } from 'hardhat'

const contractName = 'VerifyingPaymaster'
// 0.6.0 entrypoint from https://mirror.xyz/erc4337official.eth/cSdZl9X-Hce71l_FzjVKQ5eN398ial7QmkDExmIIOQk
const EntryPointAddress = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789'
const PaymsterSigner = '0xec53Efb202a4427bae100776BA920A5938E9d509'

async function main (): Promise<void> {
  const factory = await ethers.getContractFactory(contractName)
  const contract = await factory.deploy(EntryPointAddress, PaymsterSigner)

  await contract.deployed()

  console.log(`${contractName} deployed to: ${contract.address}`)
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
