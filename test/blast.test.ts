import { ethers } from 'hardhat'
import { Contract, BigNumber } from 'ethers'
import { expect } from 'chai'
import {
  BlastGasCollector__factory
} from '../typechain'
import axios, { AxiosResponse } from 'axios'

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

describe('Blast Test', function () {
  const ethersSigner = ethers.provider.getSigner(0)
  describe('Blast Gas Collector Test', function () {
    // can claim factory gas
    // const targetAddr = '0xF7cCFaee69cD8A0B3a62C2A0f35F95cC7e588183'
    // can claim wallet gas
    const targetAddr = '0xB6cbD452647435971F5ddbE72D85808d06CBcD28'

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

  describe('Blast Points Test', function () {
    // follow https://docs.blast.io/airdrop/api Mainnet Points API
    const APIBaseURL = 'https://waitlist-api.develop.testblast.io'
    type PointType = 'LIQUIDITY' | 'DEVELOPER'
    interface PointsByAsset {
      ETH: AssetPoints
      WETH: AssetPoints
      USDB: AssetPoints
    }

    interface AssetPoints {
      // same semantics as PointBalances.earnedCumulative
      // but specific to an asset
      earnedCumulative: string // decimal string
      // earnedCumulative is the sum of points earned
      // from block 0 to earnedCumulativeBlock
      earnedCumulativeBlock: number
    }
    interface PointBalances {
      // decimal strings
      available: string
      pendingSent: string

      // also decimal strings
      // cumulative so they don't decrease
      // a batch may become finalized before these numbers update
      earnedCumulative: string
      receivedCumulative: string // received from transfers (finalized)
      finalizedSentCumulative: string // sent from transfers (finalized)
    }

    interface PointBalancesResponse {
      success: boolean
      balancesByPointType: {
        LIQUIDITY: PointBalances & { byAsset: PointsByAsset }
        DEVELOPER: PointBalances
      }
    }

    let bearerToken: string
    async function obtainChallenge (contractAddress: string, operatorAddress: string): Promise<[string, string]> {
      const requestPayload = {
        contractAddress: contractAddress,
        operatorAddress: operatorAddress
      }

      interface Response {
        success: boolean
        challengeData: string
        message: string
      }

      try {
        const response: AxiosResponse<Response> = await axios.post(APIBaseURL + '/v1/dapp-auth/challenge', requestPayload)
        const responseData: Response = response.data

        if (!responseData.success) {
          throw new Error('obtainChallenge fail (success=false)')
        }
        return [responseData.challengeData, responseData.message]
      } catch (error) {
        throw new Error('obtainChallenge Error -> ' + error.toString())
      }
    }

    async function signMessage (message: string): Promise<string> {
      const wallet = new ethers.Wallet(process.env.TEST_ENV_KEY)
      console.log('sign message with wallet: ', wallet.address)
      return await wallet.signMessage(message)
    }

    // note: this function generate signature with EIP191
    async function obtainBearerToken (challengeData: string, message: string): Promise<string> {
      const signature = await signMessage(message)

      const requestPayload = {
        challengeData: challengeData,
        signature: signature
      }

      interface Response {
        success: boolean
        bearerToken: string // will last 1 hour
      }

      try {
        const response: AxiosResponse<Response> = await axios.post(APIBaseURL + '/v1/dapp-auth/solve', requestPayload)
        const responseData: Response = response.data

        if (!responseData.success) {
          throw new Error('obtainBearerToken fail (success=false)')
        }

        return responseData.bearerToken
      } catch (error) {
        throw new Error('obtainBearerToken Error -> ' + error.toString())
      }
    }

    async function checkPointBalance (contractAddress: string): Promise<PointBalancesResponse> {
      // GET /v1/contracts/:contractAddress/point-balances

      try {
        const pointURL = APIBaseURL + '/v1/contracts/' + contractAddress + '/point-balances'

        const config = {
          headers: { Authorization: `Bearer ${bearerToken}` }
        }

        const response: AxiosResponse<PointBalancesResponse> = await axios.get(pointURL, config)
        const responseData: PointBalancesResponse = response.data

        if (!responseData.success) {
          throw new Error('checkPointBalance fail (success=false)')
        }
        return responseData
      } catch (error) {
        throw new Error('checkPointBalance Error -> ' + error.toString())
      }
    }

    it('should get blast point', async () => {
      const contractAddress = '0x7fc24BaF14D225522242D6E50264E40EDc6bD0DF'
      // const contractAddress = '0xF7cCFaee69cD8A0B3a62C2A0f35F95cC7e588183'
      const operatorAddress = '0xadBd636A9fF51f2aB6999833AAB784f2C1Efa6F1'

      try {
        const [challenge, message] = await obtainChallenge(contractAddress, operatorAddress)

        // set bearerToken in this block global variable
        bearerToken = await obtainBearerToken(challenge, message)

        const pointBalances = await checkPointBalance(contractAddress)
        // console.log('pointBalances:', pointBalances)
      } catch (error) {
        // Handle errors
        console.error(error)
        expect.fail('should not fail')
      }
    })
  })
})
