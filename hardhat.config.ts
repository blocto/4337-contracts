import '@nomiclabs/hardhat-waffle'
import '@typechain/hardhat'
import { HardhatUserConfig } from 'hardhat/config'
import '@nomiclabs/hardhat-etherscan'
import '@openzeppelin/hardhat-upgrades'
import 'hardhat-storage-layout'
import 'solidity-coverage'
import 'hardhat-contract-sizer'

const {
  ETHEREUM_URL,
  ETHERSCAN_API_KEY, // etherscan API KEY
  POLYGONSCAN_API_KEY, // polygonscan API KEY
  BSCSCAN_API_KEY, // bscscan API KEY
  SNOWTRACE_API_KEY, // avalanche scan (snowtrace) API KEY
  ARBSCAN_API_KEY, // arbitrum scan API KEY
  OP_API_KEY, // optimistic scan API KEY
  BASESCAN_API_KEY // base scan API KEY
} = process.env

function getDeployAccount (): string[] {
  return (process.env.ETH_PRIVATE_KEY !== undefined) ? [process.env.ETH_PRIVATE_KEY] : []
}

const optimizedComilerSettings = {
  version: '0.8.17',
  settings: {
    optimizer: { enabled: true, runs: 1000000 },
    viaIR: false
  }
}

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more
const config: HardhatUserConfig = {
  solidity: {
    compilers: [{
      version: '0.8.17',
      settings: {
        optimizer: { enabled: true, runs: 1000000 }
      }
    }],
    overrides: {
      'contracts/test/TestBloctoAccountV200.sol': optimizedComilerSettings,
      'contracts/test/TestBloctoAccountCloneableWalletV200.sol': optimizedComilerSettings,
      'contracts/v1.5.x/BloctoAccount.sol': optimizedComilerSettings,
      'contracts/v1.5.x/BloctoAccountCloneableWallet.sol': optimizedComilerSettings
    }
  },
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true
    },
    localhost: {
      allowUnlimitedContractSize: true,
      url: 'http://localhost:8545'
    },
    ethereum: {
      url: ETHEREUM_URL,
      accounts: getDeployAccount(),
      chainId: 1
    },
    bsc: {
      url: 'https://bsc-dataseed2.binance.org/',
      accounts: getDeployAccount(),
      chainId: 56
    },
    polygon: {
      url: 'https://rpc.ankr.com/polygon',
      accounts: getDeployAccount(),
      chainId: 137
    },
    avalanche: {
      url: 'https://avalanche.blockpi.network/v1/rpc/public',
      accounts: getDeployAccount(),
      chainId: 43114
    },
    optimism: {
      url: 'https://mainnet.optimism.io',
      accounts: getDeployAccount(),
      chainId: 10
    },
    arbitrum: {
      url: 'https://arb1.arbitrum.io/rpc',
      accounts: getDeployAccount(),
      chainId: 42161
    },
    goerli: {
      url: 'https://ethereum-goerli.publicnode.com',
      accounts: getDeployAccount(),
      chainId: 5
    },
    optimism_testnet: {
      url: 'https://goerli.optimism.io',
      accounts: getDeployAccount(),
      chainId: 420
    },
    arbitrum_testnet: {
      url: 'https://arbitrum-goerli.publicnode.com',
      accounts: getDeployAccount(),
      chainId: 421613
    },
    mumbai: {
      url: 'https://rpc.ankr.com/polygon_mumbai',
      accounts: getDeployAccount(),
      chainId: 80001
    },
    bsc_testnet: {
      url: 'https://data-seed-prebsc-2-s1.binance.org:8545',
      accounts: getDeployAccount(),
      chainId: 97
    },
    avalanche_testnet: {
      url: 'https://api.avax-test.network/ext/bc/C/rpc',
      accounts: getDeployAccount(),
      chainId: 43113
    },
    scroll_testnet: {
      url: 'https://sepolia-rpc.scroll.io',
      accounts: getDeployAccount(),
      chainId: 534351
    },
    taiko_testnet: {
      url: 'https://rpc.test.taiko.xyz',
      accounts: getDeployAccount(),
      chainId: 167005
    },
    base_goerli: {
      url: 'https://goerli.base.org',
      accounts: getDeployAccount(),
      chainId: 84531
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
      avalancheFujiTestnet: SNOWTRACE_API_KEY,
      goerli: ETHERSCAN_API_KEY,
      arbitrumOne: ARBSCAN_API_KEY,
      arbitrumGoerli: ARBSCAN_API_KEY,
      optimisticEthereum: OP_API_KEY,
      optimisticGoerli: OP_API_KEY,
      baseGoerli: BASESCAN_API_KEY,
      base: BASESCAN_API_KEY
    },
    customChains: [
      {
        network: 'baseGoerli',
        chainId: 84531,
        urls: {
          apiURL: 'https://api-goerli.basescan.org/api',
          browserURL: 'https://goerli.basescan.org'
        }
      },
      {
        network: 'base',
        chainId: 8453,
        urls: {
          apiURL: 'https://api.basescan.org/api',
          browserURL: 'https://basescan.org/'
        }
      }
    ]
  }

}

// coverage chokes on the "compilers" settings
if (process.env.COVERAGE != null) {
  // @ts-ignore
  config.solidity = config.solidity.compilers[0]
}

export default config
