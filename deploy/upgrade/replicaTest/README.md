
# Replica Test

this section want replica same env before DO upgrading



1. use new account

2. deploy create3Factory

```
yarn deploy-create3Factory --network mumbai
```

3. 
NOTE: it's v140 contract: BloctoAccountFactoryV140, BloctoAccountCloneableWalletV140__factory
```
npx hardhat run deploy/upgrade/replicaTest/1_0_V140_deploy_account_accountFactory.ts --network mumbai
```

Get the BloctoAccountFactoryAddr for next step

check in scan, it should be previous version


4. upgrade test


Use replica test in deploy/upgrade/0_upgrade.ts
```
// const Create3FactoryAddress = '0x2f06F83f960ea999536f94df279815F79EeB4054'
// const BloctoAccountFactoryAddr = '0xF7cCFaee69cD8A0B3a62C2A0f35F95cC7e588183'
// for replica test
const Create3FactoryAddress = '0x0659706013c5084c085E9B601D06De16BAFaAAfD'
const BloctoAccountFactoryAddr = '0xbFf347732a1bBc6AFBBF7F1786ED5dbfaac7ed45'
```

```
yarn deploy-upgrade --network mumbai
```

check in scan, it should be next version


## Upgradeability

check with slither

BloctoAccountFactory
```
slither-check-upgradeability   ./contracts/BloctoAccountFactory.sol BloctoAccountFactory   --new-contract-filename ./contracts/test/V140/BloctoAccountFactoryV140.sol   --new-contract-name BloctoAccountFactoryV140   --solc-remaps @=node_modules/@
```

BloctoAccount
```
slither-check-upgradeability   ./contracts/BloctoAccount.sol BloctoAccount  --new-contract-filename ./contracts/test/V140/BloctoAccountV140.sol   --new-contract-name BloctoAccountV140   --solc-remaps @=node_modules/@
```


## TrobleShooting

Make sure the ProxyAdmin owner is the deployer!