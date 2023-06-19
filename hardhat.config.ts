import '@nomiclabs/hardhat-waffle'
import '@typechain/hardhat'
import { HardhatUserConfig } from 'hardhat/config'
import '@nomiclabs/hardhat-etherscan'
import '@openzeppelin/hardhat-upgrades'
import 'hardhat-storage-layout'
import 'solidity-coverage'

const {
  ETHERSCAN_API_KEY, // etherscan API KEY
  POLYGONSCAN_API_KEY, // polygonscan API KEY
  BSCSCAN_API_KEY, // bscscan API KEY
  SNOWTRACE_API_KEY, // avalanche scan (snowtrace) API KEY
  ARBSCAN_API_KEY // arbitrum scan API KEY
} = process.env

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more
const config: HardhatUserConfig = {
  solidity: {
    compilers: [{
      version: '0.8.17',
      settings: {
        optimizer: { enabled: true, runs: 1000000 }
      }
    }]
  },
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true
    },
    mumbai: {
      url: 'https://rpc.ankr.com/polygon_mumbai',
      accounts:
        process.env.ETH_PRIVATE_KEY !== undefined
          ? [process.env.ETH_PRIVATE_KEY]
          : [],
      chainId: 80001
    }
  },
  mocha: {
    timeout: 10000
  },
  // check from: npx hardhat verify --list-networks
  etherscan: {
    apiKey: {
      mainnet: ETHERSCAN_API_KEY,
      polygon: POLYGONSCAN_API_KEY,
      polygonMumbai: POLYGONSCAN_API_KEY,
      bsc: BSCSCAN_API_KEY,
      bscTestnet: BSCSCAN_API_KEY,
      avalanche: SNOWTRACE_API_KEY,
      goerli: ETHERSCAN_API_KEY,
      arbitrumOne: ARBSCAN_API_KEY,
      arbitrumGoerli: ARBSCAN_API_KEY
    }
  }

}

// coverage chokes on the "compilers" settings
if (process.env.COVERAGE != null) {
  // @ts-ignore
  config.solidity = config.solidity.compilers[0]
}

export default config
