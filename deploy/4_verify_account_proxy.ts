// update from https://github.com/borislav-itskov/schnorrkel.js
import hre from 'hardhat'

const BloctoAccountCloableWallet = '0x0579A406D38f683543c5D8742b057fbffaFC04F4'
const BloctoAccountProxy = '0x156af9D66710cCa555163f5571530aB0dD4e1447'

async function main (): Promise<void> {
  // ---------------Verify BloctoAccountProxy Contract---------------- //
  await hre.run('verify:verify', {
    address: BloctoAccountProxy,
    contract: 'contracts/BloctoAccountProxy.sol:BloctoAccountProxy',
    constructorArguments: [
      BloctoAccountCloableWallet
    ]
  })
}
// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
