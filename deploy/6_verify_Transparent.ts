import { getImplementationAddress } from '@openzeppelin/upgrades-core'
import hre, { ethers } from 'hardhat'

const BloctoAccountFactoryAddr = '0xF7cCFaee69cD8A0B3a62C2A0f35F95cC7e588183'

// npx hardhat verify --network zoraGoerli 0xF7cCFaee69cD8A0B3a62C2A0f35F95cC7e588183  "0xe38bb473a4b3c7d1ac95a91f9021c33b40af7afd" "64a102907cf42855816b7b2bf281a7e9e5d933e6" \
// "00000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000064c0c53b8b00000000000000000000000053a2a0af86b0134c7a7b4bd40884daa78c48416e0000000000000000000000005ff137d4b0fdcd49dca30c7cf57e578a026d2789000000000000000000000000adbd636a9ff51f2ab6999833aab784f2c1efa6f100000000000000000000000000000000000000000000000000000000"

async function main (): Promise<void> {
  await hre.run('verify:verify', {
    address: BloctoAccountFactoryAddr
  })
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
