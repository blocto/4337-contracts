// update from https://github.com/borislav-itskov/schnorrkel.js
import hre from 'hardhat'

const BloctoAccountCloableWallet = '0x490B5ED8A17224a553c34fAA642161c8472118dd'

async function main (): Promise<void> {
  // ---------------Verify BloctoAccountProxy Contract---------------- //
  await hre.run('verify:verify', {
    address: '0xd448D0835731f5dDE3942993B2bE80DFC232Cc0f',
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
