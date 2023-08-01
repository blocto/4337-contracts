import hre, { ethers } from 'hardhat'
import { BigNumber } from 'ethers'
import {
  VerifyingPaymaster__factory,
  BloctoAccountFactory__factory,
  CREATE3Factory__factory,
  IEntryPoint__factory
} from '../typechain'
import { hexZeroPad } from '@ethersproject/bytes'

// version 0.6.0 from https://mirror.xyz/erc4337official.eth/cSdZl9X-Hce71l_FzjVKQ5eN398ial7QmkDExmIIOQk
const EntryPoint = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789'
// from 0_deploy_create3Factory.ts
const Create3FactoryAddress = '0x2f06F83f960ea999536f94df279815F79EeB4054'

const BloctoAccountFactorySalt = 'BloctoAccountFactoryProxy_v140'
const VerifyingPaymasterSalt = 'VerifyingPaymaster_v0_1day'

// dev
// const CreateAccountBackend = '0x67465ec61c3c07b119e09fbb4a0b59eb1ba14e62'
// prod
const CreateAccountBackend = '0x8A6a17F1A3DA0F407A67BF8E076Ed7F678D85f29'

async function main (): Promise<void> {
  const [owner] = await ethers.getSigners()
  const create3Factory = CREATE3Factory__factory.connect(Create3FactoryAddress, owner)

  // -------------------BlcotoAccountFactory ------------------------------//
  const accountFactorySalt = hexZeroPad(Buffer.from(BloctoAccountFactorySalt, 'utf-8'), 32)
  const accountFactoryAddr = await create3Factory.getDeployed(owner.address, accountFactorySalt)

  const accountFactory = BloctoAccountFactory__factory.connect(accountFactoryAddr, ethers.provider)
  const createAccountRoleHash = await accountFactory.CREATE_ACCOUNT_ROLE()
  const backRoleGrantYN = await accountFactory.hasRole(createAccountRoleHash, CreateAccountBackend)
  console.log(`grant role to backend(${CreateAccountBackend}): `, backRoleGrantYN)
  // -------------------VerifingPaymaster ------------------------------//
  const salt = hexZeroPad(Buffer.from(VerifyingPaymasterSalt, 'utf-8'), 32)
  const addr = await create3Factory.getDeployed(owner.address, salt)

  const entrypoint = IEntryPoint__factory.connect(EntryPoint, ethers.provider)
  const depositInfo = await entrypoint.getDepositInfo(addr)
  console.log('stake: ', ethers.utils.formatUnits(depositInfo.stake), ', unstakeDelaySec: ', depositInfo.unstakeDelaySec)
  console.log('deposit: ', ethers.utils.formatUnits(depositInfo.deposit))

  const verifyingPaymaster = VerifyingPaymaster__factory.connect(addr, ethers.provider)
  const verifyingSigner = await verifyingPaymaster.verifyingSigner()
  console.log('VerifingPaymaster verifyingSigner: ', verifyingSigner)
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
