# BloctoAccount & BloctoAccountFactory

## Audit report

v1.5.0: [contracts/v1.5.x/BloctoAccount_Audit_Final_Report_Quantstamp.pdf](https://github.com/blocto/4337-contracts/blob/main/contracts/v1.5.x/BloctoAccount_Audit_Final_Report_Quantstamp.pdf)


## Test

test
```
yarn test
```

Schnorr Multi Sign Test

```
npx hardhat test test/schnorrMultiSign.test.ts 
```

contract size
```
npx hardhat size-contracts
```

test coverage
```
npx hardhat coverage  
```

on chain test
```
npx hardhat test test/bloctoaccount.test.ts  --network astar_zkevm_sepolia
```

## Deploy & Verify

deploy BloctoAccountCloneableWallet, BloctoAccountFactory, and addStake to BloctoAccountFactory

```
yarn deploy-create3Factory --network ethereum
```

BloctoAccount & BloctoAccountFactory deploy
```
yarn deploy --network ethereum
```

Deploy 
```
yarn deploy-verifyingPaymaster --network ethereum
```

Upgrade
```
yarn deploy-upgrade --network ethereum
```

## Tool

check storage layout
```
npx hardhat check
```

## Chain Address Info

Mainnet (ethereum, arbitrum, op, polygon, bsc, avax)

testnet(goerli, arbitrum goerli, op goerli, mumbai, bsc testnet, avax testnet)
```
BloctoAccountCloneableWallet
0x53a2A0aF86b0134C7A7b4bD40884dAA78c48416E
BloctoAccountFactory
0xF7cCFaee69cD8A0B3a62C2A0f35F95cC7e588183
VerifyingPaymaster
0xa312d8D37Be746BD09cBD9e9ba2ef16bc7Da48FF
```


## Acknowledgement

1. CoreWallet.sol fork from  https://github.com/dapperlabs/dapper-contracts

2. this repo fork from https://github.com/eth-infinitism/account-abstraction
