import hre, { ethers } from 'hardhat'
import { getDeployCode } from '../src/create3Factory'
import {
  ModuleManager__factory,
  CREATE3Factory__factory
} from '../typechain'
import { hexZeroPad } from '@ethersproject/bytes'

// NOTE: don't forget to change this according to the backend deploy account
// const Create3FactoryAddress = '0x2f06F83f960ea999536f94df279815F79EeB4054'

// dev testnet
const Create3FactoryAddress = '0xd6CA621705575c3c23622b0802964a556870953b'

// Module Manager Salt
const ModuleManagerSalt = 'ModuleManagerV0'

async function main(): Promise<void> {
  // const lockedAmount = ethers.utils.parseEther("1");
  const [owner] = await ethers.getSigners()
  console.log('deploy with account: ', owner.address)

  const create3Factory = CREATE3Factory__factory.connect(Create3FactoryAddress, owner)
  // -------------------BloctoAccountCloneableWallet------------------------------//
  const contractSalt = hexZeroPad(Buffer.from(ModuleManagerSalt, 'utf-8'), 32)
  console.log(`Deploying ModuleManager with -> \n\t salt str:  ${ModuleManagerSalt}`)
  const instance = await create3Factory.getDeployed(owner.address, contractSalt)

  if ((await ethers.provider.getCode(instance)) === '0x') {
    console.log(`ModuleManager deploying to: ${instance}`)
    const tx = await create3Factory.deploy(
      contractSalt,
      getDeployCode(new ModuleManager__factory(), [owner.address]))
    await tx.wait()

    console.log(`ModuleManager JUST deployed to: ${instance}`)
  } else {
    console.log(`ModuleManager WAS deployed to: ${instance}`)
  }

  // sleep 16 seconds
  console.log('sleep 10 seconds for chain sync...')
  await new Promise(f => setTimeout(f, 10000))

  // -------------------Verify------------------------------//
  // verify ModuleManager
  await hre.run('verify:verify', {
    address: instance,
    contract: 'contracts/v1.5.x/ModuleManager.sol:ModuleManager',
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
