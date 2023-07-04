import { ethers } from 'hardhat'
import {
  ParamType
} from 'ethers/lib/utils'

import {
  CREATE3Factory__factory,
  CREATE3Factory
} from '../typechain'

import { ContractFactory, Signer } from 'ethers'

// from: https://github.com/Mean-Finance/deterministic-factory/blob/main/test/utils/contracts.ts#L20
export const getCreationCode = ({
  bytecode,
  constructorArgs
}: {
  bytecode: string
  constructorArgs: { types: string[] | ParamType[], values: any[] }
}): string => {
  return `${bytecode}${ethers.utils.defaultAbiCoder.encode(constructorArgs.types, constructorArgs.values).slice(2)}`
}

export const getDeployCode = (
  contractFactory: ContractFactory,
  constructorArgs?: readonly any[]): string => {
  return `${contractFactory.bytecode}${contractFactory.interface.encodeDeploy(constructorArgs).slice(2)}`
}

export async function deployCREATE3Factory (signer: Signer): Promise<CREATE3Factory> {
  return (await new CREATE3Factory__factory(signer).deploy())
}
