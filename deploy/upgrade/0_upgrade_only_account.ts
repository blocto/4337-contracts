
import hre, { ethers } from 'hardhat'
import {
  CREATE3Factory__factory,
  BloctoAccountCloneableWallet__factory,
  BloctoAccountFactory__factory
} from '../../typechain'
import { hexZeroPad } from '@ethersproject/bytes'
import { getDeployCode } from '../../src/create3Factory'

const NextVersion = '1.5.2.1'
// entrypoint from 4337 official (0.6.0)
const EntryPoint = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789'
const Create3FactoryAddress = '0x2f06F83f960ea999536f94df279815F79EeB4054'
const BloctoAccountFactoryAddr = '0xF7cCFaee69cD8A0B3a62C2A0f35F95cC7e588183'

async function main (): Promise<void> {
  const [owner] = await ethers.getSigners()
  console.log('upgrade with owner:', owner.address)
  const create3Factory = CREATE3Factory__factory.connect(Create3FactoryAddress, owner)
  // deploy BloctoAccount next version
  const nextVersionBloctoAccountCloneable = 'BloctoAccount_' + NextVersion
  const accountCloneableSalt = hexZeroPad(Buffer.from(nextVersionBloctoAccountCloneable, 'utf-8'), 32)
  const implementation = await create3Factory.getDeployed(await owner.getAddress(), accountCloneableSalt)

  if ((await ethers.provider.getCode(implementation)) === '0x') {
    console.log(`BloctowalletCloneableWallet ${NextVersion} deploying to: ${implementation}`)
    const tx = await create3Factory.deploy(
      accountCloneableSalt,
      getDeployCode(new BloctoAccountCloneableWallet__factory(), [EntryPoint])
    )
    await tx.wait()
    console.log(`BloctowalletCloneableWallet ${NextVersion} JUST deployed to: ${implementation}`)
  } else {
    console.log(`BloctowalletCloneableWallet ${NextVersion} WAS deployed to: ${implementation}`)
  }

  console.log('sleep 15 seconds for chain sync...')
  await new Promise(f => setTimeout(f, 15000))

  // no upgrade in new version
  const factory = BloctoAccountFactory__factory.connect(BloctoAccountFactoryAddr, owner)
  await factory.setImplementation_1_5_1(implementation)

  // verify BloctoAccountCloneableWallet
  await hre.run('verify:verify', {
    address: implementation,
    contract: 'contracts/v1.5.x/BloctoAccountCloneableWallet.sol:BloctoAccountCloneableWallet',
    constructorArguments: [
      EntryPoint
    ]
  })
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
