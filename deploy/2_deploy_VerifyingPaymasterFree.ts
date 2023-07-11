import hre, { ethers } from 'hardhat'
import { BigNumber } from 'ethers'
import {
  VerifyingPaymasterFree__factory,
  CREATE3Factory__factory,
  IEntryPoint__factory
} from '../typechain'
import { hexZeroPad } from '@ethersproject/bytes'
import { getDeployCode } from '../src/create3Factory'

// version 0.6.0 from https://mirror.xyz/erc4337official.eth/cSdZl9X-Hce71l_FzjVKQ5eN398ial7QmkDExmIIOQk
const EntryPoint = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789'
const VerifyingSigner = '0x42a22ec06bB5F58cc5ECa9d2A47F3A7fBc7c83A7'
// from 0_deploy_create3Factory.ts
const Create3FactoryAddress = '0x2f06F83f960ea999536f94df279815F79EeB4054'

const VerifyingPaymasterFreeSalt = 'VerifyingPaymasterFree_123'
// addStake for bundler checking
const AddStakeAmount = '0.01'
const AddStakePeriod = 86400 * 1

async function main (): Promise<void> {
  const [owner] = await ethers.getSigners()
  console.log('deploying VerifyingPaymasterFree with account: ', owner.address)

  const create3Factory = CREATE3Factory__factory.connect(Create3FactoryAddress, owner)
  // -------------------VerifingPaymaster------------------------------//
  const salt = hexZeroPad(Buffer.from(VerifyingPaymasterFreeSalt, 'utf-8'), 32)
  console.log(`Deploying VerifingPaymaster with -> \n\t salt str:  ${salt}`)
  const addr = await create3Factory.getDeployed(owner.address, salt)

  if ((await ethers.provider.getCode(addr)) === '0x') {
    console.log(`VerifingPaymster deploying to: ${addr}`)
    const tx = await create3Factory.deploy(
      salt,
      getDeployCode(new VerifyingPaymasterFree__factory(), [EntryPoint, VerifyingSigner, owner.address]))
    await tx.wait()

    console.log(`VerifingPaymster JUST deployed to: ${addr}`)
  } else {
    console.log(`VerifingPaymster WAS deployed to: ${addr}`)
  }

  // ---------------add stake------------
  console.log('Adding stake to VerifingPaymaster...')
  const tx = await VerifyingPaymasterFree__factory.connect(addr, owner).addStake(BigNumber.from(AddStakePeriod), { value: ethers.utils.parseEther(AddStakeAmount) })
  await tx.wait()

  const entrypoint = IEntryPoint__factory.connect(EntryPoint, ethers.provider)
  const depositInfo = await entrypoint.getDepositInfo(addr)
  console.log('stake: ', ethers.utils.formatUnits(depositInfo.stake), ', unstakeDelaySec: ', depositInfo.unstakeDelaySec)

  // sleep 15 seconds
  console.log('sleep 15 seconds for chain sync...')
  await new Promise(f => setTimeout(f, 15000))
  // ---------------Verify VerifyingPaymasterFree Contract---------------- //
  console.log(`verifying VerifyingPaymasterFree contract ${addr} ...`)
  await hre.run('verify:verify', {
    address: addr,
    contract: 'contracts/Paymaster/VerifyingPaymasterFree.sol:VerifyingPaymasterFree',
    constructorArguments: [
      EntryPoint, VerifyingSigner, owner.address
    ]
  })
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
