import hre, { ethers } from 'hardhat'
import { getImplementationAddress } from '@openzeppelin/upgrades-core'
import { getDeployCode } from '../src/create3Factory'
import { create3DeployTransparentProxy } from '../src/deployAccountFactoryWithCreate3'
import {
  BloctoAccountCloneableWallet__factory,
  CREATE3Factory__factory
} from '../typechain'
import { hexZeroPad } from '@ethersproject/bytes'

// entrypoint from 4337 official
const EntryPoint = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789'
// NOTE: don't forget to change this according to the backend deploy account
// prod mainnet
const CreateAccountBackend = '0x8A6a17F1A3DA0F407A67BF8E076Ed7F678D85f29'
const Create3FactoryAddress = '0x2f06F83f960ea999536f94df279815F79EeB4054'

// dev testnet
// const CreateAccountBackend = '0x67465ec61c3c07b119e09fbb4a0b59eb1ba14e62'
// const Create3FactoryAddress = '0xd6CA621705575c3c23622b0802964a556870953b'

// BloctowalletCloneableSalt
const BloctoAccountCloneableWalletSalt = 'BloctoAccount_v140'
const BloctoAccountFactorySalt = 'BloctoAccountFactoryProxy_v140'

async function getBlastPointAddress (): Promise<string> {
  const { chainId } = await ethers.provider.getNetwork()
  // 81457: mainnet using 0x2536FE9ab3F511540F2f9e2eC2A805005C3Dd800 from https://docs.blast.io/airdrop/api#configuring-a-points-operator
  return chainId === 81457 ? '0x2536FE9ab3F511540F2f9e2eC2A805005C3Dd800' : '0x2fc95838c71e76ec69ff817983BFf17c710F34E0'
}

async function main (): Promise<void> {
  // const lockedAmount = ethers.utils.parseEther("1");
  const [owner] = await ethers.getSigners()
  console.log('deploy with account: ', owner.address)

  const create3Factory = CREATE3Factory__factory.connect(Create3FactoryAddress, owner)
  // -------------------BloctoAccountCloneableWallet------------------------------//
  const accountSalt = hexZeroPad(Buffer.from(BloctoAccountCloneableWalletSalt, 'utf-8'), 32)
  console.log(`Deploying BloctoAccountCloneableWallet with -> \n\t salt str:  ${BloctoAccountCloneableWalletSalt}`)
  const walletCloneable = await create3Factory.getDeployed(owner.address, accountSalt)

  const blastPointAddress = await getBlastPointAddress()
  console.log('Using blastPointAddress: ', blastPointAddress)

  if ((await ethers.provider.getCode(walletCloneable)) === '0x') {
    console.log(`BloctowalletCloneableWallet deploying to: ${walletCloneable}`)
    const tx = await create3Factory.deploy(
      accountSalt,
      getDeployCode(new BloctoAccountCloneableWallet__factory(), [EntryPoint, blastPointAddress]))
    await tx.wait()

    console.log(`BloctowalletCloneableWallet JUST deployed to: ${walletCloneable}`)
  } else {
    console.log(`BloctowalletCloneableWallet WAS deployed to: ${walletCloneable}`)
  }

  // -------------------BloctoAccountFactory------------------------------//
  const accountFactorySalt = hexZeroPad(Buffer.from(BloctoAccountFactorySalt, 'utf-8'), 32)
  const accountFactoryAddr = await create3Factory.getDeployed(owner.address, accountFactorySalt)

  if ((await ethers.provider.getCode(accountFactoryAddr)) === '0x') {
    const BloctoAccountFactory = await ethers.getContractFactory('BloctoAccountFactory')
    const accountFactory = await create3DeployTransparentProxy(BloctoAccountFactory,
      [walletCloneable, EntryPoint, owner.address],
      { initializer: 'initialize', constructorArgs: [walletCloneable], unsafeAllow: ['constructor', 'state-variable-immutable'] }, create3Factory, owner, accountFactorySalt)

    await accountFactory.deployed()
    console.log(`BloctoAccountFactory JUST deployed to: ${accountFactory.address}`)
    // grant role
    console.log('Granting create account role to backend address: ', CreateAccountBackend)
    await accountFactory.grantRole(await accountFactory.CREATE_ACCOUNT_ROLE(), CreateAccountBackend)
    console.log('setImplementation_1_5_1 to address: ', walletCloneable)
    await accountFactory.setImplementation_1_5_1(walletCloneable)
    console.log('set blast point to address: ', CreateAccountBackend)
    const blastPointAddress = await getBlastPointAddress()
    await accountFactory.configureBlastPoints(blastPointAddress, CreateAccountBackend)
  } else {
    console.log(`BloctoAccountFactory WAS deployed to: ${accountFactoryAddr}`)
  }

  // ---------------add stake------------
  // console.log('Adding stake to account factory')
  // const tx = await accountFactory.addStake(BigNumber.from(86400 * 3650), { value: ethers.utils.parseEther('0.001') })
  // await tx.wait()

  // const entrypoint = EntryPoint__factory.connect(EntryPoint, ethers.provider)
  // const depositInfo = await entrypoint.getDepositInfo(accountFactory.address)
  // console.log('stake: ', ethers.utils.formatUnits(depositInfo.stake), ', unstakeDelaySec: ', depositInfo.unstakeDelaySec)

  // sleep 16 seconds
  console.log('sleep 16 seconds for chain sync...')
  await new Promise(f => setTimeout(f, 16000))

  // -------------------Verify------------------------------//
  // verify BloctowalletCloneableWallet
  await hre.run('verify:verify', {
    address: walletCloneable,
    contract: 'contracts/v1.5.x/BloctoAccountCloneableWallet.sol:BloctoAccountCloneableWallet',
    constructorArguments: [
      EntryPoint, blastPointAddress
    ]
  })

  // verify BloctoAccountFactory (if proxy)
  const accountFactoryImplAddress = await getImplementationAddress(ethers.provider, accountFactoryAddr)
  await hre.run('verify:verify', {
    address: accountFactoryImplAddress,
    contract: 'contracts/v1.5.x/BloctoAccountFactory.sol:BloctoAccountFactory',
    constructorArguments: [
      walletCloneable
    ]
  })
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
