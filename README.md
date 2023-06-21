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
yarn deploy_verify --network goerli
```

create a test account and verify
```
npx hardhat run deploy/2_createSchnorrAccount_verify.ts --network goerli
```


## Tool

check storage layout
```
npx hardhat check
```

## Testnet chain info

goerli, arbitrum goerli, op goerli, mumbai, bsc testnet, avax testnet
```
BloctoAccountCloneableWallet
0x490B5ED8A17224a553c34fAA642161c8472118dd
BloctoAccountFactory
0x285cc5232236D227FCb23E6640f87934C948a028
VerifyingPaymaster
0x9C58dF1BB61a3f68C66Ef5fC7D8Ab4bd1DaEC9Ac
```


## Acknowledgement

this repo fork from https://github.com/eth-infinitism/account-abstraction