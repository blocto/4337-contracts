# BloctoAccount & BloctoAccountFactory

## Test

test
```
yarn test
```


## Deploy 

deploy BloctoAccountCloneableWallet

```
yarn deploy-bloctoaccountcloneable --network mumbai
```


deploy BloctoAccountFactory

```
yarn deploy-bloctoaccountfactory --network mumbai
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