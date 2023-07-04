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
import { keccak256 } from 'ethereumjs-util'

const platformModule = false
const BloctoAccountFactoryProxySalt = 'BloctoAccountFactoryProxy_v0'

async function deployTransparentUpgradeableProxyWithCreate3 (
  create3Factory: CREATE3Factory, signer: Signer | undefined,
  logic: string, adminAddress: string,
  data: string): Promise<Required<Deployment & DeployTransaction> & RemoteDeploymentId> { // Promise<Contract> {
  const salt = keccak256(Buffer.from(BloctoAccountFactoryProxySalt))

  const TransparentUpgradeableProxyFactory = await getTransparentUpgradeableProxyFactory(hre, create3Factory.signer)
  const deployCode = getDeployCode(TransparentUpgradeableProxyFactory, [logic, adminAddress, data])

  const deployTransaction = await create3Factory.deploy(salt, deployCode)
  const address: string = await create3Factory.getDeployed(await create3Factory.signer.getAddress(), salt)

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
  signer: Signer | undefined

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
    await deployTransparentUpgradeableProxyWithCreate3(create3Factory, signer, impl, adminAddress, data)
  )

  console.log('end proxyDeployment')

  await manifest.addProxy(proxyDeployment)

  return getContractInstance(hre, ImplFactory, opts, proxyDeployment)
}
