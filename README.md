# BloctoAccount & BloctoAccountFactory

## Test

test
```
yarn test
```


## Deploy 

deploy BloctoAccountCloneableWallet, BloctoAccountFactory, and addStake to BloctoAccountFactory

```
yarn deploy --network mumbai 
```


deploy VerifyingPaymaster
```
yarn deploy-verifyingpaymaster --network mumbai 
```


verify BloctoAccountCloneableWallet
```
yarn  verify-bloctoaccountcloneable --network mumbai
```


verify BloctoAccountFactory
```
yarn verify-accountfactory --network mumbai
```

verify VerifyingPaymaster
```
yarn verify-verifyingpaymaster --network mumbai
```

## Tool

check storage layout
```
npx hardhat check
```

## Acknowledgement

this repo fork from https://github.com/eth-infinitism/account-abstraction