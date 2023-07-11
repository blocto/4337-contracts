// update from https://github.com/borislav-itskov/schnorrkel.js
import hre from 'hardhat'

const BloctoAccountCloableWallet = '0x53a2A0aF86b0134C7A7b4bD40884dAA78c48416E'
// const BloctoAccountProxy = '0x203519717E215B1B248052BAf075900D96E8B9A9'
const BloctoAccountProxy = '0x20D54B1e8f536c660917f857C0De69Df496E8ace'

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
