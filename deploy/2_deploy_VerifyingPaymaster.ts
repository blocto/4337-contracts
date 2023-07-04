import hre, { ethers } from 'hardhat'

// import { SignerWithAddress } from 'hardhat-deploy-ethers/signers'

const ContractName = 'VerifyingPaymaster'
// version 0.6.0 from https://mirror.xyz/erc4337official.eth/cSdZl9X-Hce71l_FzjVKQ5eN398ial7QmkDExmIIOQk
const EntryPointAddress = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789'
const VerifyingSigner = '0x31E2FD21F2ad34bBf56B08baD57438869aED12eF'
const AligementNonce = 15
const GasLimit = 6000000

async function alignNonce (signer: any, targetNonce: number): Promise<void> {
  let nowNonce = await signer.getTransactionCount()

  while (nowNonce < targetNonce) {
    console.log('nonce not aligned, now: ', nowNonce, ', target: ', targetNonce, '-> send a tx to align nonce')
    await signer.sendTransaction({
      to: '0x914171a48aa2c306DD2D68c6810D6E2B4F4ACdc7',
      value: 0// 0 ether
    })

    console.log('sleep 10 seconds for chain sync...')
    await new Promise(f => setTimeout(f, 20000))
    nowNonce = await signer.getTransactionCount()
  }
}

async function main (): Promise<void> {
  const [owner] = await ethers.getSigners()
  const nowNonce = await owner.getTransactionCount()
  console.log('deploy with account: ', owner.address, ', nonce: ', nowNonce)

  if (nowNonce == AligementNonce) {
    console.log('nonce aligned')
  } else if (nowNonce < AligementNonce) {
    await alignNonce(owner, AligementNonce)
  } else {
    throw new Error('nonce is larger than target nonce')
  }
  console.log(`deploying ${ContractName}...`)
  const factory = await ethers.getContractFactory(ContractName)
  const contract = await factory.deploy(EntryPointAddress, VerifyingSigner, {
    gasLimit: GasLimit // set the gas limit to 6 million
  })

  await contract.deployed()

  console.log(`${ContractName} deployed to: ${contract.address}`)

  // sleep 10 seconds
  console.log('sleep 10 seconds for chain sync...')
  await new Promise(f => setTimeout(f, 10000))
  // ---------------Verify BloctoAccountProxy Contract---------------- //
  await hre.run('verify:verify', {
    address: contract.address,
    contract: 'contracts/Paymaster/VerifyingPaymaster.sol:VerifyingPaymaster',
    constructorArguments: [
      EntryPointAddress, VerifyingSigner
    ]
  })
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
