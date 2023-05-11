import '@nomiclabs/hardhat-waffle'
import '@typechain/hardhat'
import { HardhatUserConfig } from 'hardhat/config'
import '@nomiclabs/hardhat-etherscan'
import '@openzeppelin/hardhat-upgrades'

import 'solidity-coverage'

import * as fs from 'fs'

const {
  ETHERSCAN_API_KEY, // etherscan API KEY
  POLYGONSCAN_API_KEY, // polygonscan API KEY
  BSCSCAN_API_KEY, // bscscan API KEY
  SNOWTRACE_API_KEY, // avalanche scan (snowtrace) API KEY
  OPSCAN_API_KEY, // optimistic scan API KEY
  ARBSCAN_API_KEY // arbitrum scan API KEY
} = process.env

const mnemonicFileName = process.env.MNEMONIC_FILE ?? `${process.env.HOME}/.secret/testnet-mnemonic.txt`
let mnemonic = 'test '.repeat(11) + 'junk'
if (fs.existsSync(mnemonicFileName)) { mnemonic = fs.readFileSync(mnemonicFileName, 'ascii') }

function getNetwork1 (url: string): { url: string, accounts: { mnemonic: string } } {
  return {
    url,
    accounts: { mnemonic }
  }
}

function getNetwork (name: string): { url: string, accounts: { mnemonic: string } } {
  return getNetwork1(`https://${name}.infura.io/v3/${process.env.INFURA_ID}`)
  // return getNetwork1(`wss://${name}.infura.io/ws/v3/${process.env.INFURA_ID}`)
}

const optimizedComilerSettings = {
  version: '0.8.17',
  settings: {
    optimizer: { enabled: true, runs: 1000000 },
    viaIR: true
  }
}

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

const config: HardhatUserConfig = {
  solidity: {
    compilers: [{
      version: '0.8.15',
      settings: {
        optimizer: { enabled: true, runs: 1000000 }
      }
    }],
    overrides: {
      'contracts/core/EntryPoint.sol': optimizedComilerSettings,
      'contracts/BloctoAccountCloneableWallet.sol': optimizedComilerSettings,
      'contracts/BloctoAccount4337/BloctoAccount4337CloneableWallet.sol': optimizedComilerSettings
    }
  },
  networks: {
    dev: { url: 'http://localhost:8545' },
    // github action starts localgeth service, for gas calculations
    localgeth: { url: 'http://localgeth:8545' },
    goerli: getNetwork('goerli'),
    sepolia: getNetwork('sepolia'),
    proxy: getNetwork1('http://localhost:8545'),
    // mumbai: getNetwork1('https://polygon-testnet.public.blastapi.io'),
    mumbai: {
      url: 'https://polygon-testnet.public.blastapi.io',
      accounts:
        process.env.ETH_PRIVATE_KEY !== undefined
          ? [process.env.ETH_PRIVATE_KEY]
          : [],
      chainId: 80001,
      gas: 8000000, // 8M
      gasPrice: 10000000000 // 10 gwei
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
      arbitrumGoerli: ARBSCAN_API_KEY,
      optimism: OPSCAN_API_KEY
    }
  }

}

// coverage chokes on the "compilers" settings
if (process.env.COVERAGE != null) {
  // @ts-ignore
  config.solidity = config.solidity.compilers[0]
}

export default config
