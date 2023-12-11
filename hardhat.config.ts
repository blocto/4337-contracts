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
  BASESCAN_API_KEY, // base scan API KEY
  LINEASCAN_API_KEY, // linea scan API KEY
  BASE_SEPOLIA_API_KEY, // base sepolia scan API KEY
  SCROLLSCAN_API_KEY // scroll scan API KEY
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
    linea: {
      url: 'https://rpc.linea.build',
      accounts: getDeployAccount(),
      chainId: 59144
    },
    zora: {
      url: 'https://bridge.zora.energy/',
      accounts: getDeployAccount(),
      chainId: 7777777
    },
    goerli: {
      url: 'https://ethereum-goerli.publicnode.com',
      accounts: getDeployAccount(),
      chainId: 5
    },
    sepolia: {
      url: 'https://1rpc.io/sepolia',
      accounts: getDeployAccount(),
      chainId: 11155111
    },
    optimism_goerli: {
      url: 'https://goerli.optimism.io',
      accounts: getDeployAccount(),
      chainId: 420
    },
    optimism_sepolia: {
      url: 'https://sepolia.optimism.io',
      accounts: getDeployAccount(),
      chainId: 11155420
    },
    arbitrum_goerli: {
      url: 'https://rpc.goerli.arbitrum.gateway.fm',
      accounts: getDeployAccount(),
      chainId: 421613
    },
    arbitrum_sepolia: {
      url: 'https://sepolia-rollup.arbitrum.io/rpc',
      accounts: getDeployAccount(),
      chainId: 421614
    },
    mumbai: {
      url: 'https://polygon-mumbai-bor.publicnode.com',
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
    scroll_sepolia: {
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
    },
    base_sepolia: {
      url: 'https://sepolia.base.org',
      accounts: getDeployAccount(),
      chainId: 84532
    },
    linea_goerli: {
      url: 'https://rpc.goerli.linea.build',
      accounts: getDeployAccount(),
      chainId: 59140
    },
    zircuit_sepolia: {
      url: 'https://zircuit1.p2pify.com/',
      accounts: getDeployAccount(),
      chainId: 48899
    },
    zora_goerli: {
      url: 'https://testnet.rpc.zora.co',
      accounts: getDeployAccount(),
      chainId: 999
    },
    zora_sepolia: {
      url: 'https://sepolia.rpc.zora.energy',
      accounts: getDeployAccount(),
      chainId: 999999999
    },
    astar_zkevm_sepolia: {
      url: 'https://rpc.startale.com/zkatana',
      accounts: getDeployAccount(),
      chainId: 1261120
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
      sepolia: ETHERSCAN_API_KEY,
      arbitrumOne: ARBSCAN_API_KEY,
      arbitrumGoerli: ARBSCAN_API_KEY,
      arbitrumSepolia: ARBSCAN_API_KEY,
      optimisticEthereum: OP_API_KEY,
      optimisticGoerli: OP_API_KEY,
      optimisticSepolia: OP_API_KEY,
      base: BASESCAN_API_KEY,
      baseGoerli: BASESCAN_API_KEY,
      baseSepolia: BASE_SEPOLIA_API_KEY,
      lineaGoerli: LINEASCAN_API_KEY,
      zora: LINEASCAN_API_KEY,
      zoraGoerli: LINEASCAN_API_KEY,
      zoraSepolia: LINEASCAN_API_KEY,
      scrollSepolia: SCROLLSCAN_API_KEY,
      astarZkevmSepolia: SCROLLSCAN_API_KEY
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
      },
      {
        network: 'lineaGoerli',
        chainId: 59140,
        urls: {
          apiURL: 'https://api-testnet.lineascan.build/api',
          browserURL: 'https://goerli.lineascan.build/'
        }
      },
      {
        network: 'linea',
        chainId: 59144,
        urls: {
          apiURL: 'https://api.lineascan.build/api',
          browserURL: 'https://lineascan.build/'
        }
      },
      {
        network: 'zora',
        chainId: 7777777,
        urls: {
          apiURL: 'https://explorer.zora.energy/api',
          browserURL: 'https://explorer.zora.energy/'
        }
      },
      {
        network: 'zoraGoerli',
        chainId: 999,
        urls: {
          apiURL: 'https://testnet.explorer.zora.energy/api',
          browserURL: 'https://testnet.explorer.zora.energy/'
        }
      },
      {
        network: 'zoraSepolia',
        chainId: 999999999,
        urls: {
          apiURL: 'https://sepolia.explorer.zora.energy/api',
          browserURL: 'https://sepolia.explorer.zora.energy/'
        }
      },
      {
        network: 'arbitrumSepolia',
        chainId: 421614,
        urls: {
          apiURL: 'https://api-sepolia.arbiscan.io/api',
          browserURL: 'https://sepolia.arbiscan.io/'
        }
      },
      {
        network: 'optimisticSepolia',
        chainId: 11155420,
        urls: {
          apiURL: 'https://api-sepolia-optimism.etherscan.io/api',
          browserURL: 'https://sepolia-optimism.etherscan.io/'
        }
      },
      {
        network: 'baseSepolia',
        chainId: 84532,
        urls: {
          apiURL: 'https://base-sepolia.blockscout.com/api',
          browserURL: 'https://base-sepolia.blockscout.com/'
        }
      },
      {
        network: 'scrollSepolia',
        chainId: 534351,
        urls: {
          apiURL: 'https://api-sepolia.scrollscan.com/api',
          browserURL: 'https://sepolia.scrollscan.dev/'
        }
      },
      {
        network: 'astarZkevmSepolia',
        chainId: 1261120,
        urls: {
          apiURL: 'https://zkatana.blockscout.com/api',
          browserURL: 'https://zkatana.blockscout.com/'
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
