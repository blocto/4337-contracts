import { ethers } from "hardhat";
import { hexZeroPad } from "@ethersproject/bytes";

const FactoryAddress = "0xe510a9cE07328fC065874b5BAe9a3837071cFf0a"; // wallet factory
const CloneableWalletAddress = "0x3129f7182CBbA595Dc715f1d68bE0D423FDB80c7"; // cloneable wallet

async function main(): Promise<void> {
  // const lockedAmount = ethers.utils.parseEther("1");
  const AccountFactory = await ethers.getContractFactory(
    "BloctoAccountFactory"
  );
  const factory = await AccountFactory.attach(FactoryAddress);
  const tx = await factory.setImplementation_1_5_1(CloneableWalletAddress);
  console.log("tx", tx.hash);
}
// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
