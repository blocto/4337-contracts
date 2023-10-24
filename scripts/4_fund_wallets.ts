// update from https://github.com/borislav-itskov/schnorrkel.js
import { ethers } from "hardhat";
import { Wallet, BigNumber, ContractTransaction } from "ethers";

const SWC1 = "0x8C9Bb5B19607Ae030490CCCc087104AC692A1659";
const SWC2 = "0xcBa216bAE3f6d6C7BA46463e880d8BDc7feF13d0";
const HAO = "0x9f4D1E9b553fab73180F16870Cee65A52862a824";

const porttoDev = ethers.provider.getSigner(); // portto-dev

const ONE_WEI = BigNumber.from("1");
const TWO_WEI = BigNumber.from("2");
const TEN_WEI = BigNumber.from("10");

async function main(): Promise<void> {
  // prepare
  const tx_fund_1 = await porttoDev.sendTransaction({
    to: SWC1,
    value: TEN_WEI,
  });
  await tx_fund_1.wait();
  console.log("SWC1 funded", tx_fund_1.hash);
  const tx_fund_2 = await porttoDev.sendTransaction({
    to: SWC2,
    value: TEN_WEI,
  });
  await tx_fund_2.wait();
  console.log("SWC2 funded", tx_fund_2.hash);
  // EOA direct transfer
  /*
  const tx_eoa_transfer = await porttoDev.sendTransaction({
    to: HAO,
    value: ONE_WEI,
  });
  await tx_eoa_transfer.wait();
  console.log("EOA direct transfer", tx_eoa_transfer.hash);
  */
  // SWC direct transfer
}
// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
