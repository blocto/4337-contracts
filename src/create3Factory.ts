import {
  CREATE3Factory__factory,
  CREATE3Factory
} from '../typechain'

import { ContractFactory, Signer } from 'ethers'
import { ethers } from 'hardhat'

const Create3FactoryAddr = '0xd6CA621705575c3c23622b0802964a556870953b'

export const getDeployCode = (
  contractFactory: ContractFactory,
  constructorArgs?: readonly any[]): string => {
  return `${contractFactory.bytecode}${contractFactory.interface.encodeDeploy(constructorArgs).slice(2)}`
}

// remove gaslimit for arbitrum
export async function deployCREATE3Factory (signer: Signer): Promise<CREATE3Factory> {
  if ((await ethers.provider.getCode(Create3FactoryAddr)) !== '0x') {
    console.log(`Using Existed Create3FactoryAddr (${Create3FactoryAddr})!`)
    return CREATE3Factory__factory.connect(Create3FactoryAddr, signer)
  } else {
    return (await new CREATE3Factory__factory(signer).deploy())
  }
}
