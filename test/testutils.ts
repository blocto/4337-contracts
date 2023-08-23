import { ethers, config } from 'hardhat'
import {
  arrayify,
  hexConcat,
  keccak256,
  parseEther,
  hexlify
} from 'ethers/lib/utils'
import { BigNumber, BigNumberish, Contract, ContractReceipt, Signer, Wallet } from 'ethers'
import {
  IERC20,
  BloctoAccount,
  BloctoAccount__factory,
  BloctoAccountFactory
} from '../typechain'

import { EntryPoint, EntryPoint__factory } from '@account-abstraction/contracts'

import { Bytes, BytesLike, hexZeroPad, concat, Signature } from '@ethersproject/bytes'
import { toUtf8Bytes } from '@ethersproject/strings'

import { expect } from 'chai'
import { Create2Factory } from '../src/Create2Factory'
import Schnorrkel from '../src/schnorrkel.js/index'
import { DefaultSigner } from './schnorrUtils'
import { toBuffer, fromSigned, toUnsigned, bufferToInt, addHexPrefix } from 'ethereumjs-util'
import { intToHex, stripHexPrefix } from 'ethjs-util'

export const AddressZero = ethers.constants.AddressZero
export const HashZero = ethers.constants.HashZero
export const ONE_ETH = parseEther('1')
export const TWO_ETH = parseEther('2')
export const FIVE_ETH = parseEther('5')

export const tostr = (x: any): string => x != null ? x.toString() : 'null'

export const ShowCreateAccountGas = false

export function tonumber (x: any): number {
  try {
    return parseFloat(x.toString())
  } catch (e: any) {
    console.log('=== failed to parseFloat:', x, (e).message)
    return NaN
  }
}

// just throw 1eth from account[0] to the given address (or contract instance)
export async function fund (contractOrAddress: string | Contract, amountEth = '1'): Promise<void> {
  let address: string
  if (typeof contractOrAddress === 'string') {
    address = contractOrAddress
  } else {
    address = contractOrAddress.address
  }
  await ethers.provider.getSigner().sendTransaction({ to: address, value: parseEther(amountEth) })
}

export async function getBalance (address: string): Promise<number> {
  const balance = await ethers.provider.getBalance(address)
  return parseInt(balance.toString())
}

export async function getTokenBalance (token: IERC20, address: string): Promise<number> {
  const balance = await token.balanceOf(address)
  return parseInt(balance.toString())
}

let counter = 0 // Math.floor(Math.random() * 5000)

export function createTmpAccount (): Wallet {
  const privateKey = keccak256(Buffer.from(arrayify(BigNumber.from(++counter))))
  return new ethers.Wallet(privateKey, ethers.provider)
  // const accounts: any = config.networks.hardhat.accounts
  // console.log('accounts.path: ', accounts.path)
  // console.log('accounts.mnemonic: ', accounts.mnemonic)
  // counter++
  // return ethers.Wallet.fromMnemonic(accounts.mnemonic, accounts.path + `/${counter}`)
}

// create non-random account, so gas calculations are deterministic
export function createAuthorizedCosignerRecoverWallet (): [Wallet, Wallet, Wallet] {
  return [createTmpAccount(), createTmpAccount(), createTmpAccount()]
}

export function createAddress (): string {
  return createTmpAccount().address
}

export function callDataCost (data: string): number {
  return ethers.utils.arrayify(data)
    .map(x => x === 0 ? 4 : 16)
    .reduce((sum, x) => sum + x)
}

export async function calcGasUsage (rcpt: ContractReceipt, entryPoint: EntryPoint, beneficiaryAddress?: string): Promise<{ actualGasCost: BigNumberish }> {
  const actualGas = await rcpt.gasUsed
  const logs = await entryPoint.queryFilter(entryPoint.filters.UserOperationEvent(), rcpt.blockHash)
  const { actualGasCost, actualGasUsed } = logs[0].args
  console.log('\t== actual gasUsed (from tx receipt)=', actualGas.toString())
  console.log('\t== calculated gasUsed (paid to beneficiary)=', actualGasUsed)
  const tx = await ethers.provider.getTransaction(rcpt.transactionHash)
  console.log('\t== gasDiff', actualGas.toNumber() - actualGasUsed.toNumber() - callDataCost(tx.data))
  if (beneficiaryAddress != null) {
    expect(await getBalance(beneficiaryAddress)).to.eq(actualGasCost.toNumber())
  }
  return { actualGasCost }
}

// helper function to create the initCode to deploy the account, using our account factory.
export function getAccountInitCode (factory: BloctoAccountFactory, authorizedAddress: string, cosignerAddress: string, recoveryAddress: string, salt, pxIndexWithParity, px): BytesLike {
  return hexConcat([
    factory.address,
    factory.interface.encodeFunctionData('createAccount', [authorizedAddress, cosignerAddress, recoveryAddress, BigNumber.from(salt)])
  ])
}

// helper function to create the initCode to deploy the account, using our account factory.
export function getAccountInitCode2 (factory: BloctoAccountFactory, authorizedAddresses: BytesLike, cosignerAddress: string, recoveryAddress: string, salt = 0): BytesLike {
  return hexConcat([
    factory.address,
    factory.interface.encodeFunctionData('createAccount2', [authorizedAddresses, cosignerAddress, recoveryAddress, BigNumber.from(salt)])
  ])
}

const panicCodes: { [key: number]: string } = {
  // from https://docs.soliditylang.org/en/v0.8.0/control-structures.html
  0x01: 'assert(false)',
  0x11: 'arithmetic overflow/underflow',
  0x12: 'divide by zero',
  0x21: 'invalid enum value',
  0x22: 'storage byte array that is incorrectly encoded',
  0x31: '.pop() on an empty array.',
  0x32: 'array sout-of-bounds or negative index',
  0x41: 'memory overflow',
  0x51: 'zero-initialized variable of internal function type'
}

// rethrow "cleaned up" exception.
// - stack trace goes back to method (or catch) line, not inner provider
// - attempt to parse revert data (needed for geth)
// use with ".catch(rethrow())", so that current source file/line is meaningful.
export function rethrow (): (e: Error) => void {
  const callerStack = new Error().stack!.replace(/Error.*\n.*at.*\n/, '').replace(/.*at.* \(internal[\s\S]*/, '')

  if (arguments[0] != null) {
    throw new Error('must use .catch(rethrow()), and NOT .catch(rethrow)')
  }
  return function (e: Error) {
    const solstack = e.stack!.match(/((?:.* at .*\.sol.*\n)+)/)
    const stack = (solstack != null ? solstack[1] : '') + callerStack
    // const regex = new RegExp('error=.*"data":"(.*?)"').compile()
    const found = /error=.*?"data":"(.*?)"/.exec(e.message)
    let message: string
    if (found != null) {
      const data = found[1]
      message = decodeRevertReason(data) ?? e.message + ' - ' + data.slice(0, 100)
    } else {
      message = e.message
    }
    const err = new Error(message)
    err.stack = 'Error: ' + message + '\n' + stack
    throw err
  }
}

export function decodeRevertReason (data: string, nullIfNoMatch = true): string | null {
  const methodSig = data.slice(0, 10)
  const dataParams = '0x' + data.slice(10)

  if (methodSig === '0x08c379a0') {
    const [err] = ethers.utils.defaultAbiCoder.decode(['string'], dataParams)
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    return `Error(${err})`
  } else if (methodSig === '0x00fa072b') {
    const [opindex, paymaster, msg] = ethers.utils.defaultAbiCoder.decode(['uint256', 'address', 'string'], dataParams)
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    return `FailedOp(${opindex}, ${paymaster !== AddressZero ? paymaster : 'none'}, ${msg})`
  } else if (methodSig === '0x4e487b71') {
    const [code] = ethers.utils.defaultAbiCoder.decode(['uint256'], dataParams)
    return `Panic(${panicCodes[code] ?? code} + ')`
  }
  if (!nullIfNoMatch) {
    return data
  }
  return null
}

let currentNode: string = ''

// basic geth support
// - by default, has a single account. our code needs more.
export async function checkForGeth (): Promise<void> {
  // @ts-ignore
  const provider = ethers.provider._hardhatProvider

  currentNode = await provider.request({ method: 'web3_clientVersion' })

  console.log('node version:', currentNode)
  // NOTE: must run geth with params:
  // --http.api personal,eth,net,web3
  // --allow-insecure-unlock
  if (currentNode.match(/geth/i) != null) {
    for (let i = 0; i < 2; i++) {
      const acc = await provider.request({ method: 'personal_newAccount', params: ['pass'] }).catch(rethrow)
      await provider.request({ method: 'personal_unlockAccount', params: [acc, 'pass'] }).catch(rethrow)
      await fund(acc, '10')
    }
  }
}

// remove "array" members, convert values to strings.
// so Result obj like
// { '0': "a", '1': 20, first: "a", second: 20 }
// becomes:
// { first: "a", second: "20" }
export function objdump (obj: { [key: string]: any }): any {
  return Object.keys(obj)
    .filter(key => key.match(/^[\d_]/) == null)
    .reduce((set, key) => ({
      ...set,
      [key]: decodeRevertReason(obj[key].toString(), false)
    }), {})
}
/**
 * process exception of ValidationResult
 * usage: entryPoint.simulationResult(..).catch(simulationResultCatch)
 */
export function simulationResultCatch (e: any): any {
  if (e.errorName !== 'ValidationResult') {
    throw e
  }
  return e.errorArgs
}

/**
 * process exception of ValidationResultWithAggregation
 * usage: entryPoint.simulationResult(..).catch(simulationResultWithAggregation)
 */
export function simulationResultWithAggregationCatch (e: any): any {
  if (e.errorName !== 'ValidationResultWithAggregation') {
    throw e
  }
  return e.errorArgs
}

export async function deployEntryPoint (provider = ethers.provider): Promise<EntryPoint> {
  const create2factory = new Create2Factory(provider)
  const epf = new EntryPoint__factory(provider.getSigner())
  const addr = await create2factory.deploy(epf.bytecode, 0, process.env.COVERAGE != null ? 20e6 : 8e6)
  return EntryPoint__factory.connect(addr, provider.getSigner())
}

export async function isDeployed (addr: string): Promise<boolean> {
  const code = await ethers.provider.getCode(addr)
  return code.length > 2
}

// Deploys an implementation and a proxy pointing to this implementation
export async function createAccount (
  ethersSigner: Signer,
  authorizedAddresses: string,
  cosignerAddresses: string,
  recoverAddresses: string,
  salt: BigNumberish,
  mergedKeyIndexWithParity: number,
  mergedKey: string,
  accountFactory: BloctoAccountFactory
): Promise<BloctoAccount> {
  const tx = await accountFactory.createAccount(authorizedAddresses, cosignerAddresses, recoverAddresses, salt, mergedKeyIndexWithParity, mergedKey)
  // console.log('tx: ', tx)
  const receipt = await tx.wait()
  if (ShowCreateAccountGas) {
    console.log('createAccount gasUsed: ', receipt.gasUsed)
  }

  const accountAddress = await accountFactory.getAddress(cosignerAddresses, recoverAddresses, salt)
  const account = BloctoAccount__factory.connect(accountAddress, ethersSigner)
  return account
}

// Deploys an implementation and a proxy pointing to this implementation
export async function createAccountV151 (
  ethersSigner: Signer,
  authorizedAddresses: string,
  cosignerAddresses: string,
  recoverAddresses: string,
  salt: BigNumber,
  mergedKeyIndexWithParity: number,
  mergedKey: string,
  accountFactory: BloctoAccountFactory
): Promise<BloctoAccount> {
  const newSalt = keccak256(concat([
    ethers.utils.hexZeroPad(salt.toHexString(), 32),
    cosignerAddresses, recoverAddresses
  ]))
  const tx = await accountFactory.createAccount_1_5_1(authorizedAddresses, cosignerAddresses, recoverAddresses, newSalt, mergedKeyIndexWithParity, mergedKey)
  // console.log('tx: ', tx)
  const receipt = await tx.wait()
  if (ShowCreateAccountGas) {
    console.log('createAccount 151 gasUsed: ', receipt.gasUsed)
  }

  const accountAddress = await accountFactory.getAddress(cosignerAddresses, recoverAddresses, salt)
  const account = BloctoAccount__factory.connect(accountAddress, ethersSigner)
  return account
}

// helper function to create the setEntryPointCode to set the account entryPoint address
export function getSetEntryPointCode (account: BloctoAccount, entryPointAddress: string): BytesLike {
  return hexConcat([
    account.address,
    account.interface.encodeFunctionData('setEntryPoint', [entryPointAddress])
  ])
}

// txData from https://github.com/dapperlabs/dapper-contracts/blob/master/test/wallet-utils.js
export const txData = (revert: number, to: string, amount: BigNumber, dataBuff: string): Uint8Array => {
  // revert_flag (1), to (20), value (32), data length (32), data
  const dataArr = []
  const revertBuff = Buffer.alloc(1)
  // don't revert for now
  revertBuff.writeUInt8(revert)
  dataArr.push(revertBuff)
  // 'to' is not padded (20 bytes)
  dataArr.push(Buffer.from(to.replace('0x', ''), 'hex')) // address as string
  // value (32 bytes)
  dataArr.push(hexZeroPad(amount.toHexString(), 32))
  // data length (0)
  // dataArr.push(utils.numToBuffer(dataBuff.length))
  const hex = Buffer.from(dataBuff.replace('0x', ''), 'hex')
  dataArr.push(hexZeroPad(hexlify(hex.length), 32))
  if (hex.length > 0) {
    dataArr.push(hex)
  }

  return concat(dataArr)
}

export const EIP191V0MessagePrefix = '\x19\x00'
export function hashMessageEIP191V0 (chainId: number, address: string, message: Bytes | string): string {
  address = address.replace('0x', '')

  const chainIdStr = ethers.utils.hexZeroPad(ethers.utils.hexlify(chainId), 32)

  return keccak256(concat([
    toUtf8Bytes(EIP191V0MessagePrefix),
    Uint8Array.from(Buffer.from(address, 'hex')),
    chainIdStr,
    message
  ]))
}

export function hashMessageEIP191V0WithoutChainId (address: string, message: Bytes | string): string {
  address = address.replace('0x', '')

  return keccak256(concat([
    toUtf8Bytes(EIP191V0MessagePrefix),
    Uint8Array.from(Buffer.from(address, 'hex')),
    message
  ]))
}

export async function signMessage (signerWallet: Wallet, accountAddress: string, nonce: BigNumber, data: Uint8Array, addrForData: string = signerWallet.address): Promise<Signature> {
  const nonceBytesLike = hexZeroPad(nonce.toHexString(), 32)

  const dataForHash = concat([
    nonceBytesLike,
    addrForData,
    data
  ])
  const sign = signerWallet._signingKey().signDigest(hashMessageEIP191V0((await ethers.provider.getNetwork()).chainId, accountAddress, dataForHash))
  return sign
}

export async function signMessageWithoutChainId (signerWallet: Wallet, accountAddress: string, nonce: BigNumber, data: Uint8Array): Promise<Signature> {
  const nonceBytesLike = hexZeroPad(nonce.toHexString(), 32)

  const dataForHash = concat([
    nonceBytesLike,
    signerWallet.address,
    data
  ])
  const sign = signerWallet._signingKey().signDigest(hashMessageEIP191V0WithoutChainId(accountAddress, dataForHash))
  return sign
}

export function logBytes (uint8: Uint8Array): string {
  return Buffer.from(uint8).toString('hex') + '(' + uint8.length.toString() + ')'
}

export function getMergedKey (wallet1: Wallet, wallet2: Wallet, mergedKeyIndex: number): [px: string, pxIndexWithParity: number] {
  mergedKeyIndex = 128 + (mergedKeyIndex << 1)
  const signerOne = new DefaultSigner(wallet1)
  const signerTwo = new DefaultSigner(wallet2)
  const publicKeys = [signerOne.getPublicKey(), signerTwo.getPublicKey()]
  const combinedPublicKey = Schnorrkel.getCombinedPublicKey(publicKeys)
  const px = ethers.utils.hexlify(combinedPublicKey.buffer.slice(1, 33))
  const pxIndexWithParity = combinedPublicKey.buffer.slice(0, 1).readInt8() - 2 + mergedKeyIndex

  return [px, pxIndexWithParity]
}

function padWithZeroes (hexString: string, targetLength: number): string {
  if (hexString !== '' && !/^[a-f0-9]+$/iu.test(hexString)) {
    throw new Error(
        `Expected an unprefixed hex string. Received: ${hexString}`
    )
  }

  if (targetLength < 0) {
    throw new Error(
        `Expected a non-negative integer target length. Received: ${targetLength}`
    )
  }

  return String.prototype.padStart.call(hexString, targetLength, '0')
}

function concatSig (v: Buffer, r: Buffer, s: Buffer): string {
  const rSig = fromSigned(r)
  const sSig = fromSigned(s)
  const vSig = bufferToInt(v)
  const rStr = padWithZeroes(toUnsigned(rSig).toString('hex'), 64)
  const sStr = padWithZeroes(toUnsigned(sSig).toString('hex'), 64)
  const vStr = stripHexPrefix(intToHex(vSig))
  return addHexPrefix(rStr.concat(sStr, vStr))
}

export function sign2Str (signer: Wallet, data: string): string {
  const sig = signer._signingKey().signDigest(data)

  return concatSig(toBuffer(sig.v), toBuffer(sig.r), toBuffer(sig.s))
}
