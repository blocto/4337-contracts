import hre, { ethers } from 'hardhat'
import { getContractAddress } from 'ethers/lib/utils'
import {
  CloneableWallet__factory,
  WalletFactory__factory
} from '../typechain'

// contact address
const BloctoCloneableWallet = '0xEd69aC1caB88cC82ff417131BDC69D93427107b4'
const BloctoAccountFactory = '0xbD4AE80F258ba3E75Dd9894d0D697a3e330B9483'

async function main(): Promise<void> {
  // const lockedAmount = ethers.utils.parseEther("1");
  const [owner] = await ethers.getSigners()
  console.log('Deploy with account: ', owner.address)

  // deploy BloctoCloableWallet
  const wallet = getContractAddress({ from: owner.address, nonce: 0 })
  console.log('Expect wallet address: ', wallet)
  if (wallet !== BloctoCloneableWallet) {
    throw new Error('wallet address not match')
  }
  if ((await ethers.provider.getCode(wallet)) === '0x') {
    const nowNonce = await ethers.provider.getTransactionCount(owner.address)
    if (nowNonce !== 0) {
      throw new Error('nonce 0 not match')
    }
    console.log(`Deploying Cloneable Wallet to (${wallet})...`)
    // await new CloneableWallet__factory().deploy()
    const instance = await ethers.getContractFactory('contracts/v1.1.0/CloneableWallet.sol:CloneableWallet')
    const contract = await instance.deploy()
    await contract.deployed()
  } else {
    console.log(`Using Existed Cloneable Wallet (${wallet})!`)
  }
  // deploy BloctoAccountFactory
  const factory = getContractAddress({ from: owner.address, nonce: 1 })
  console.log('expect factory address: ', factory)
  if (factory !== BloctoAccountFactory) {
    throw new Error('factory address not match')
  }
  if ((await ethers.provider.getCode(factory)) === '0x') {
    const nowNonce = await ethers.provider.getTransactionCount(owner.address)
    if (nowNonce !== 1) {
      throw new Error('nonce 1 not match')
    }
    console.log(`Deploying Factory to (${factory})...`)
    // await new WalletFactory__factory().deploy(wallet)
    const instance = await ethers.getContractFactory('WalletFactory')
    const contract = await instance.deploy(wallet)
    await contract.deployed()
  } else {
    console.log(`Using Existed Factory (${factory})!`)
  }

  // sleep 5 seconds
  console.log('Sleep 5 seconds for chain sync...')
  await new Promise(f => setTimeout(f, 5000))

  // verify CloneableWallet
  await hre.run('verify:verify', {
    address: wallet,
    contract: 'contracts/v1.1.0/CloneableWallet.sol:CloneableWallet'
  })

  await hre.run('verify:verify', {
    address: factory,
    contract: 'contracts/v1.1.0/WalletFactory.sol:WalletFactory',
    constructorArguments: [
      wallet
    ]
  })
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
