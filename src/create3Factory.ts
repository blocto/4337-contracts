import {
  CREATE3Factory__factory,
  CREATE3Factory
} from '../typechain'

import { ContractFactory, Signer } from 'ethers'
import { ethers } from 'hardhat'

export const getDeployCode = (
  contractFactory: ContractFactory,
  constructorArgs?: readonly any[]): string => {
  return `${contractFactory.bytecode}${contractFactory.interface.encodeDeploy(constructorArgs).slice(2)}`
}

// remove gaslimit for arbitrum
export async function deployCREATE3Factory (signer: Signer): Promise<CREATE3Factory> {
  // signer is test acccount but not create3Factory deployer
  let create3FactoryAddr = '0xd6CA621705575c3c23622b0802964a556870953b'
  // testnet test account: 0x7dC20dC696b2107cB5f24630c70337889546F37a
  const signerAddress = await signer.getAddress()

  // signer is mainnet account
  if (signerAddress === '0xadBd636A9fF51f2aB6999833AAB784f2C1Efa6F1') {
    create3FactoryAddr = '0x2f06F83f960ea999536f94df279815F79EeB4054'
  }
  console.log('create3FactoryAddr:', create3FactoryAddr)

  if ((await ethers.provider.getCode(create3FactoryAddr)) !== '0x') {
    console.log(`Using Existed Create3FactoryAddr (${create3FactoryAddr})!`)
    return CREATE3Factory__factory.connect(create3FactoryAddr, signer)
  } else {
    return (await new CREATE3Factory__factory(signer).deploy())
  }
}
