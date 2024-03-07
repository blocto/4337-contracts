
import hre, { ethers } from 'hardhat'
import {
  CREATE3Factory__factory,
  BloctoAccountCloneableWallet__factory,
  BloctoAccountFactory__factory
} from '../../typechain'
import { hexZeroPad } from '@ethersproject/bytes'
import { getDeployCode } from '../../src/create3Factory'
import { getImplementationAddress } from '@openzeppelin/upgrades-core'

const NextVersion = '1.5.3-blast-0.1'
// entrypoint from 4337 official (0.6.0)
const EntryPoint = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789'
// mainnet
let Create3FactoryAddress = '0x2f06F83f960ea999536f94df279815F79EeB4054'
let BloctoAccountFactoryAddr = '0xF7cCFaee69cD8A0B3a62C2A0f35F95cC7e588183'
// testnet

async function getBlastPointAddress (): Promise<string> {
  const { chainId } = await ethers.provider.getNetwork()
  // 81457: mainnet using 0x2536FE9ab3F511540F2f9e2eC2A805005C3Dd800 from https://docs.blast.io/airdrop/api#configuring-a-points-operator
  return chainId === 81457 ? '0x2536FE9ab3F511540F2f9e2eC2A805005C3Dd800' : '0x2fc95838c71e76ec69ff817983BFf17c710F34E0'
}

async function main (): Promise<void> {
  const [owner] = await ethers.getSigners()
  console.log('upgrade with owner:', owner.address)
  // testnet deployer
  if (owner.address === '0x162235eBF3381eDE497dFa523b2a77E2941583eC') {
    Create3FactoryAddress = '0xd6CA621705575c3c23622b0802964a556870953b'
    BloctoAccountFactoryAddr = '0x38DDa3Aed6e71457d573F993ee06380b1cDaF3D1'
  }
  const create3Factory = CREATE3Factory__factory.connect(Create3FactoryAddress, owner)
  // deploy BloctoAccount next version
  const nextVersionBloctoAccountCloneable = 'BloctoAccount_' + NextVersion
  const accountCloneableSalt = hexZeroPad(Buffer.from(nextVersionBloctoAccountCloneable, 'utf-8'), 32)
  const implementation = await create3Factory.getDeployed(await owner.getAddress(), accountCloneableSalt)

  const blastPointAddress = await getBlastPointAddress()
  console.log('Using blastPointAddress: ', blastPointAddress)

  if ((await ethers.provider.getCode(implementation)) === '0x') {
    console.log(`BloctowalletCloneableWallet ${NextVersion} deploying to: ${implementation}`)
    const tx = await create3Factory.deploy(
      accountCloneableSalt,
      getDeployCode(new BloctoAccountCloneableWallet__factory(), [EntryPoint, blastPointAddress])
    )
    await tx.wait()
    console.log(`BloctowalletCloneableWallet ${NextVersion} JUST deployed to: ${implementation}`)
  } else {
    console.log(`BloctowalletCloneableWallet ${NextVersion} WAS deployed to: ${implementation}`)
  }

  // deploy BloctoAccountFactory to next version

  const BaseContract = await ethers.getContractFactory('BloctoAccountFactoryBase')
  const deployment = await upgrades.forceImport(BloctoAccountFactoryAddr, BaseContract)
  console.log('Proxy imported from:', deployment.address)
  const factory = BloctoAccountFactory__factory.connect(deployment.address, owner)

  const nowFactoryVersoin = await factory.VERSION()
  console.log(`Factory version: ${nowFactoryVersoin}`)
  if (nowFactoryVersoin !== NextVersion) {
    console.log('\t upgrading factory...')
    const UpgradeContract = await ethers.getContractFactory('BloctoAccountFactory')
    await upgrades.upgradeProxy(BloctoAccountFactoryAddr, UpgradeContract, { constructorArgs: [implementation], unsafeAllow: ['constructor', 'state-variable-immutable'] })
    console.log('\t new factory versoin', await factory.VERSION())
  }

  // verify BloctoAccountCloneableWallet
  await hre.run('verify:verify', {
    address: implementation,
    contract: 'contracts/v1.5.x/BloctoAccountCloneableWallet.sol:BloctoAccountCloneableWallet',
    constructorArguments: [
      EntryPoint, blastPointAddress
    ]
  })

  // verify BloctoAccountFactory (if proxy)
  const accountFactoryImplAddress = await getImplementationAddress(ethers.provider, BloctoAccountFactoryAddr)
  await hre.run('verify:verify', {
    address: accountFactoryImplAddress,
    contract: 'contracts/v1.5.x/BloctoAccountFactory.sol:BloctoAccountFactory',
    constructorArguments: [
      implementation
    ]
  })
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
