import hre, { ethers } from 'hardhat'
import { deployCREATE3Factory } from '../src/create3Factory'

async function main(): Promise<void> {
  const [owner] = await ethers.getSigners()
  console.log(`${owner.address} deploying CREATE3Factory...`)
  const create3Factory = await deployCREATE3Factory(owner)

  console.log(`CREATE3Factory deployed to: ${create3Factory.address}`)

  // sleep 15 seconds
  console.log('sleep 15 seconds for chain sync...')
  await new Promise(f => setTimeout(f, 15000))
  // ---------------Verify BloctoAccountProxy Contract---------------- //
  await hre.run('verify:verify', {
    address: create3Factory.address,
    contract: 'contracts/Create3/CREATE3Factory.sol:CREATE3Factory'
  })
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
