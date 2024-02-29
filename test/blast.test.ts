import { ethers } from 'hardhat'
import { Contract, BigNumber } from 'ethers'
import { expect } from 'chai'
import {
  BlastGasCollector__factory
} from '../typechain'

const BlastGasCollectorAddr = '0xBd9D6d96b21d679983Af4ed6182Fd9fff0031eA4'
const GasAddr = '0x4300000000000000000000000000000000000001'

async function readGasCanBeClaimed (chkAddr: string): Promise<[BigNumber, number]> {
  // see https://testnet.blastscan.io/address/0x4300000000000000000000000000000000000001/contract/168587773/code

  const gasAbi = [
    // Get the account balance
    'function readGasParams(address) view returns (uint256,uint256,uint256,uint)'
  ]

  const gasContract = new Contract(GasAddr, gasAbi, ethers.provider)
  //  (uint256 etherSeconds, uint256 etherBalance, uint256 lastUpdated, GasMode mode)
  const [, etherBalance, , mode] = await gasContract.readGasParams(chkAddr)
  return [etherBalance, mode]
}

describe('Blast Gas Collector Test', function () {
  const targetAddr = '0xF7cCFaee69cD8A0B3a62C2A0f35F95cC7e588183'
  const ethersSigner = ethers.provider.getSigner(0)
  const gasCollecotr = BlastGasCollector__factory.connect(BlastGasCollectorAddr, ethersSigner)

  it('should collect gas if exist', async () => {
    const [etherBalance, mode] = await readGasCanBeClaimed(targetAddr)
    // sholue be 1 (CLAIMABLE mode), see https://testnet.blastscan.io/address/0x4300000000000000000000000000000000000001/contract/168587773/code
    expect(mode).to.equal(1)
    if (etherBalance.gt(0)) {
      console.log(`collecting ${targetAddr} etherBalance ${etherBalance.toString()}...`)
      const tx = await gasCollecotr.claimGas(targetAddr, await ethersSigner.getAddress())
      await tx.wait()
    } else {
      console.log('no gas to be collected of', targetAddr)
    }
  })
})
