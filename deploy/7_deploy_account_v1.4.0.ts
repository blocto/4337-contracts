import hre, { ethers } from 'hardhat'
import { getDeployCode } from '../src/create3Factory'
import {
  BloctoAccountCloneableWalletV140__factory,
  CREATE3Factory__factory
} from '../typechain'
import { hexZeroPad } from '@ethersproject/bytes'

// entrypoint from 4337 official
const EntryPoint = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789'

// prod mainnet
// const Create3FactoryAddress = '0x2f06F83f960ea999536f94df279815F79EeB4054'

// dev testnet
const Create3FactoryAddress = '0xd6CA621705575c3c23622b0802964a556870953b'

// BloctowalletCloneableSalt
const BloctoAccountCloneableWalletSalt = 'BloctoAccount-v140'

async function main(): Promise<void> {
  // const lockedAmount = ethers.utils.parseEther("1");
  const [owner] = await ethers.getSigners()
  console.log('deploy with account: ', owner.address)

  const create3Factory = CREATE3Factory__factory.connect(Create3FactoryAddress, owner)
  // -------------------BloctoAccountCloneableWallet------------------------------//
  const accountSalt = hexZeroPad(Buffer.from(BloctoAccountCloneableWalletSalt, 'utf-8'), 32)
  console.log(`Deploying BloctoAccountCloneableWallet with -> \n\t salt str:  ${BloctoAccountCloneableWalletSalt}`)
  const walletCloneable = await create3Factory.getDeployed(owner.address, accountSalt)

  if ((await ethers.provider.getCode(walletCloneable)) === '0x') {
    console.log(`BloctowalletCloneableWallet deploying to: ${walletCloneable}`)
    const tx = await create3Factory.deploy(
      accountSalt,
      getDeployCode(new BloctoAccountCloneableWalletV140__factory(), [EntryPoint]))
    await tx.wait()

    console.log(`BloctoAccountCloneableWalletV140 JUST deployed to: ${walletCloneable}`)
  } else {
    console.log(`BloctowalletCloneableWalletV140 WAS deployed to: ${walletCloneable}`)
  }

  // sleep 5 seconds
  console.log('sleep 5 seconds for chain sync...')
  await new Promise(f => setTimeout(f, 5000))

  // -------------------Verify------------------------------//
  // verify BloctowalletCloneableWallet
  await hre.run('verify:verify', {
    address: walletCloneable,
    contract: 'contracts/v1.4.x/BloctoAccountCloneableWalletV140.sol:BloctoAccountCloneableWalletV140',
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
