
## Test new chain guildline

1. add *RPC URL* to networks of hardhat.config.ts 

2. *funding* test account with 0.5 Eth 
* test account key use $ETH_PRIVATE_KEY
* it will auto fund to cosigner for tx
* it will auto fund SCW account for native token transfer test

3. (option) deploy CREATE3 factory 
* it will auto create BloctoAccountCloneable by CREATE3 factory 
* it will auto create BloctoAccountFactory by CREATE3 factory 
* it will auto create TestERC20 by CREATE3 factory 
* above contracts will reuse if test fail

4. test it 
```
 npx hardhat test test/bloctoaccount.test.ts --network astar_zkevm_sepolia > chain_test_reports/astar_zkevm_sepolia.report
```

## Test Report

the ideal report is like local.report -> all passing no error
```
 28 passing (2s)
```

## Individual Test

```
npx hardhat test test/bloctoaccount.test.ts --grep 'should create account and run tx from createAccountWithInvoke2' --network taiko_jolnir_sepolia
```


