import {
  CREATE3Factory__factory,
  CREATE3Factory
} from '../typechain'

import { ContractFactory, Signer } from 'ethers'

// const GasLimit = 800000

export const getDeployCode = (
  contractFactory: ContractFactory,
  constructorArgs?: readonly any[]): string => {
  return `${contractFactory.bytecode}${contractFactory.interface.encodeDeploy(constructorArgs).slice(2)}`
}

// remove gaslimit for arbitrum
export async function deployCREATE3Factory (signer: Signer): Promise<CREATE3Factory> {
  return (await new CREATE3Factory__factory(signer).deploy())
  // return (await new CREATE3Factory__factory(signer).deploy({
  //   gasLimit: GasLimit
  // }))
}
