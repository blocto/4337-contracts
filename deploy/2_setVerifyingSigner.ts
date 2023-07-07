import hre, { ethers } from 'hardhat'
import { BigNumber } from 'ethers'
import {
  VerifyingPaymaster__factory,
  CREATE3Factory__factory
} from '../typechain'
import { hexZeroPad } from '@ethersproject/bytes'

// from 0_deploy_create3Factory.ts
const Create3FactoryAddress = '0x2f06F83f960ea999536f94df279815F79EeB4054'

const VerifyingPaymasterSalt = 'VerifyingPaymaster_v0_1day'

// dev
const VerifyingSigner = '0x31E2FD21F2ad34bBf56B08baD57438869aED12eF'
// prod
// const VerifyingSigner = '0x42a22ec06bB5F58cc5ECa9d2A47F3A7fBc7c83A7'

async function main (): Promise<void> {
  const [owner] = await ethers.getSigners()
  console.log('deposit VerifyingPaymaster with account: ', owner.address)

  const create3Factory = CREATE3Factory__factory.connect(Create3FactoryAddress, owner)
  // -------------------VerifingPaymaster addr------------------------------//
  const salt = hexZeroPad(Buffer.from(VerifyingPaymasterSalt, 'utf-8'), 32)
  console.log(`Deploying VerifingPaymaster with -> \n\t salt str:  ${salt}`)
  const addr = await create3Factory.getDeployed(owner.address, salt)

  // ---------------VerifingPaymaster add stake------------
  console.log('setVerifyingSigner...')
  const tx = await VerifyingPaymaster__factory.connect(addr, owner).setVerifyingSigner(VerifyingSigner)
  await tx.wait()
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
