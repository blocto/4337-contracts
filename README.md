# BloctoAccount & BloctoAccountFactory

## Test

test
```
yarn test
```

Schnorr Multi Sign Test

```
npx hardhat test test/schnorrMultiSign.test.ts 
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

this repo fork from https://github.com/eth-infinitism/account-abstraction