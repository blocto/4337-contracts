import { getImplementationAddress } from '@openzeppelin/upgrades-core'
import hre, { ethers } from 'hardhat'

const BloctoAccountCloneableWalletAddr = '0xEcD85B3b9C8470b0AfB64A62d61e22Ba2A51584b'
const BloctoAccountFactoryAddr = '0xF7cCFaee69cD8A0B3a62C2A0f35F95cC7e588183'
const VerifingPaymasterAddr = '0xa312d8D37Be746BD09cBD9e9ba2ef16bc7Da48FF'
const EntryPoint = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789'
const VerifyingSigner = '0x42a22ec06bB5F58cc5ECa9d2A47F3A7fBc7c83A7'
// const BloctoAccountProxyCloneAddr = '0x6672e24A9D809A1b03317e83949572e71afae5be'
const Deployer = '0xadBd636A9fF51f2aB6999833AAB784f2C1Efa6F1'

async function main (): Promise<void> {
  // verify BloctoAccountCloneableWallet
  await hre.run('verify:verify', {
    address: BloctoAccountCloneableWalletAddr,
    contract: 'contracts/v1.5.x/BloctoAccountCloneableWallet.sol:BloctoAccountCloneableWallet',
    constructorArguments: [
      EntryPoint
    ]
  })

  // verify BloctoAccountFactory (if proxy)
  const accountFactoryImplAddress = await getImplementationAddress(ethers.provider, BloctoAccountFactoryAddr)
  await hre.run('verify:verify', {
    address: accountFactoryImplAddress,
    contract: 'contracts/v1.5.x/BloctoAccountFactory.sol:BloctoAccountFactory'
  })

  //  erify VerifyingPaymaster Contract
  await hre.run('verify:verify', {
    address: VerifingPaymasterAddr,
    contract: 'contracts/Paymaster/VerifyingPaymaster.sol:VerifyingPaymaster',
    constructorArguments: [
      EntryPoint, VerifyingSigner, Deployer
    ]
  })
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
