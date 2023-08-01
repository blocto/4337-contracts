// this file fork from '@openzeppelin/hardhat-upgrades/src/utils/deploy-proxy.ts'
// import type { HardhatRuntimeEnvironment } from 'hardhat/types'
import type { ContractFactory, Contract, Signer } from 'ethers'

import {
  Manifest,
  ProxyDeployment,
  RemoteDeploymentId
} from '@openzeppelin/upgrades-core'

import type { Deployment } from '@openzeppelin/upgrades-core'

import {
  DeployProxyOptions,
  getTransparentUpgradeableProxyFactory,
  DeployTransaction,
  deployProxyImpl,
  getInitializerData
} from '@openzeppelin/hardhat-upgrades/dist/utils'
import { enablePlatform } from '@openzeppelin/hardhat-upgrades/dist/platform/utils'
import { getContractInstance } from '@openzeppelin/hardhat-upgrades/dist/utils/contract-instance'

import hre, { ethers } from 'hardhat'
import {
  CREATE3Factory

} from '../typechain'
import { getDeployCode } from './create3Factory'
import { hexZeroPad } from '@ethersproject/bytes'

const platformModule = false
const logEnable = false

function consoleLog (log: string): void {
  if (logEnable) {
    console.log(log)
  }
}

async function deployTransparentUpgradeableProxyWithCreate3 (
  create3Factory: CREATE3Factory, factoryProxySalt: string, signer: Signer | undefined,
  logic: string, adminAddress: string,
  data: string): Promise<Required<Deployment & DeployTransaction> & RemoteDeploymentId> { // Promise<Contract> {
  // const salt = keccak256(Buffer.from(factoryProxySalt))

  // consoleLog(`Deploying TransparentUpgradeableProxy with -> \n\t salt str:  ${factoryProxySalt.toString()}\n\t salt:  ${factoryProxySalt.toString('hex')}`)
  consoleLog(`Deploying TransparentUpgradeableProxy with salt-> ${factoryProxySalt}`)
  const address: string = await create3Factory.getDeployed(await create3Factory.signer.getAddress(), factoryProxySalt)
  if (await ethers.provider.getCode(address) !== '0x') {
    throw new Error(`the TransparentUpgradeable Proxy already deployed to ${address}`)
  }

  const TransparentUpgradeableProxyFactory = await getTransparentUpgradeableProxyFactory(hre, create3Factory.signer)
  const deployCode = getDeployCode(TransparentUpgradeableProxyFactory, [logic, adminAddress, data])

  const deployTransaction = await create3Factory.deploy(factoryProxySalt, deployCode)

  await deployTransaction.wait()
  if (await ethers.provider.getCode(address) === '0x') {
    throw new Error('deploy TransparentUpgradeable Proxy with Create3 fail, getcode return 0x (len=0)')
  }

  const txHash = deployTransaction.hash
  return { address, txHash, deployTransaction }
}

export async function create3DeployTransparentProxy (
  ImplFactory: ContractFactory,
  args: unknown[] | DeployProxyOptions = [],
  opts: DeployProxyOptions = {},
  create3Factory: CREATE3Factory,
  signer: Signer | undefined,
  factoryProxySaltString: string = hexZeroPad(Buffer.from('BloctoAccountFactoryProxy_v140', 'utf-8'), 32)
): Promise<Contract> {
  if (!Array.isArray(args)) {
    opts = args
    args = []
  }

  opts = enablePlatform(hre, platformModule, opts)

  const { provider } = hre.network
  const manifest = await Manifest.forNetwork(provider)

  const { impl, kind } = await deployProxyImpl(hre, ImplFactory, opts)

  if (kind !== 'transparent') {
    throw new Error('only for transparent proxy')
  }

  const contractInterface = ImplFactory.interface
  const data = getInitializerData(contractInterface, args, opts.initializer)
  const adminAddress = await hre.upgrades.deployProxyAdmin(ImplFactory.signer, opts)
  const proxyDeployment: Required<ProxyDeployment & DeployTransaction> & RemoteDeploymentId = Object.assign(
    { kind },
    // await deploy(hre, opts, TransparentUpgradeableProxyFactory, impl, adminAddress, data)
    await deployTransparentUpgradeableProxyWithCreate3(create3Factory, factoryProxySaltString, signer, impl, adminAddress, data)
  )

  await manifest.addProxy(proxyDeployment)

  return getContractInstance(hre, ImplFactory, opts, proxyDeployment)
}
