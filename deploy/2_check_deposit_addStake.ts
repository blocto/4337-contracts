import hre, { ethers } from 'hardhat'
import { BigNumber } from 'ethers'
import {
  VerifyingPaymaster__factory,
  CREATE3Factory__factory,
  IEntryPoint__factory
} from '../typechain'
import { hexZeroPad } from '@ethersproject/bytes'

// version 0.6.0 from https://mirror.xyz/erc4337official.eth/cSdZl9X-Hce71l_FzjVKQ5eN398ial7QmkDExmIIOQk
const EntryPoint = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789'
// from 0_deploy_create3Factory.ts
const Create3FactoryAddress = '0x2f06F83f960ea999536f94df279815F79EeB4054'

const VerifyingPaymasterSalt = 'VerifyingPaymaster_v0_1day'
// addStake for bundler checking

async function main (): Promise<void> {
  const [owner] = await ethers.getSigners()
  console.log('deposit VerifyingPaymaster with account: ', owner.address)

  const create3Factory = CREATE3Factory__factory.connect(Create3FactoryAddress, owner)
  // -------------------VerifingPaymaster addr------------------------------//
  const salt = hexZeroPad(Buffer.from(VerifyingPaymasterSalt, 'utf-8'), 32)
  console.log(`Deploying VerifingPaymaster with -> \n\t salt str:  ${salt}`)
  const addr = await create3Factory.getDeployed(owner.address, salt)

  // ---------------VerifingPaymaster add stake------------
  const entrypoint = IEntryPoint__factory.connect(EntryPoint, ethers.provider)
  const depositInfo = await entrypoint.getDepositInfo(addr)
  console.log('depositInfo: ', depositInfo)
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
