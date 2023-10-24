import { ethers } from "hardhat";
import { Multicall__factory } from "../typechain";

async function main(): Promise<void> {
  const signer = await ethers.getSigner();
  await new Multicall__factory(signer).deploy();
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
