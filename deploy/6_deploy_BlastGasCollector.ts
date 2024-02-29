import hre, { ethers } from 'hardhat'
import { getDeployCode } from '../src/create3Factory'
import {
  BlastGasCollector__factory,
  CREATE3Factory__factory
} from '../typechain'
import { hexZeroPad } from '@ethersproject/bytes'

// prod mainnet
// const CreateAccountBackend = '0x8A6a17F1A3DA0F407A67BF8E076Ed7F678D85f29'
// dev testnet
const GasCollectorBackend = '0x67465ec61c3c07b119e09fbb4a0b59eb1ba14e62'

// create3Factory
const Create3FactoryAddress = '0x2f06F83f960ea999536f94df279815F79EeB4054'

// BloctocontractInstanceSalt
const BlastGasCollectorSalt = 'BlastGasCollector_v1.0'

async function main (): Promise<void> {
  // const lockedAmount = ethers.utils.parseEther("1");
  const [owner] = await ethers.getSigners()
  console.log('deploy with account: ', owner.address)

  const create3Factory = CREATE3Factory__factory.connect(Create3FactoryAddress, owner)
  // -------------------BlastGasCollector------------------------------//
  const contractSalt = hexZeroPad(Buffer.from(BlastGasCollectorSalt, 'utf-8'), 32)
  console.log(`Deploying BlastGasCollector with -> \n\t salt str:  ${BlastGasCollectorSalt}`)
  const contractInstance = await create3Factory.getDeployed(owner.address, contractSalt)

  if ((await ethers.provider.getCode(contractInstance)) === '0x') {
    console.log(`BlastGasCollector deploying to: ${contractInstance}`)
    const tx = await create3Factory.deploy(
      contractSalt,
      getDeployCode(new BlastGasCollector__factory(), [owner.address]))
    await tx.wait()
    console.log(`BlastGasCollector JUST deployed to: ${contractInstance}`)
    console.log('Granting gas collector role to backend address: ', GasCollectorBackend)

    const gasCollector = BlastGasCollector__factory.connect(contractInstance, owner)
    await gasCollector.grantRole(await gasCollector.GAS_COLLECTOR_ROLE(), GasCollectorBackend)
  } else {
    console.log(`BlastGasCollector WAS deployed to: ${contractInstance}`)
  }

  // sleep 10 seconds
  console.log('sleep 10 seconds for chain sync...')
  await new Promise(f => setTimeout(f, 10000))

  // -------------------Verify------------------------------//
  // verify BlastGasCollector
  await hre.run('verify:verify', {
    address: contractInstance,
    contract: 'contracts/v1.5.x/BlastGasCollector.sol:BlastGasCollector',
    constructorArguments: [
      owner.address
    ]
  })
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
