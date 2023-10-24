// update from https://github.com/borislav-itskov/schnorrkel.js
import { ethers } from "hardhat";
import {
  createAuthorizedCosignerRecoverWallet,
  getMergedKey,
} from "../test/testutils";
import { hexZeroPad } from "@ethersproject/bytes";

const FactoryAddress = "0xe510a9cE07328fC065874b5BAe9a3837071cFf0a"; // wallet factory
const RecoverAddress = "0x1A0D223109C75cD340BB9b5a786669806429b83d"; // portto-dev

const ethersSigner = ethers.provider.getSigner(); // portto-dev

async function main(): Promise<void> {
  // const lockedAmount = ethers.utils.parseEther("1");
  const AccountFactory = await ethers.getContractFactory(
    "BloctoAccountFactory"
  );
  const factory = await AccountFactory.attach(FactoryAddress);

  const [
    authorizedWallet,
    cosignerWallet,
  ] = createAuthorizedCosignerRecoverWallet();
  // const signerOne = new DefaultSigner(authorizedWallet)
  // const signerTwo = new DefaultSigner(cosignerWallet)
  // const publicKeys = [signerOne.getPublicKey(), signerTwo.getPublicKey()]
  // const publicNonces = [signerOne.getPublicNonces(), signerTwo.getPublicNonces()]
  // const combinedPublicKey = Schnorrkel.getCombinedPublicKey(publicKeys)
  // const px = ethers.utils.hexlify(combinedPublicKey.buffer.slice(1, 33))
  // because of the parity byte is 2, 3 so sub 2
  // const pxIndexWithParity = combinedPublicKey.buffer.slice(0, 1).readInt8() - 2 + mergedKeyIndex

  const [px, pxIndexWithParity] = getMergedKey(
    authorizedWallet,
    cosignerWallet,
    0
  );

  console.log(
    "authorizedWallet.getAddress(): ",
    await authorizedWallet.getAddress(),
    ", cosignerWallet.getAddress()",
    await cosignerWallet.getAddress()
  );

  console.log("ethersSigner address: ", await ethersSigner.getAddress());
  console.log("factory.address", factory.address);

  // iterate to prepare 2 wallets
  // const tx_fund = await porttoDev.sendTransaction(
  for (let i = 1; i < 3; i++) {
    const saltSeed = `BloctoWallet_hao_${i}`;
    const salt = hexZeroPad(Buffer.from(saltSeed, "utf-8"), 32);
    const address = await factory.getAddress_1_5_1(salt);
    const tx = await factory.createAccount2_1_5_1(
      [authorizedWallet.address],
      cosignerWallet.address,
      RecoverAddress,
      salt,
      [pxIndexWithParity],
      [px]
    );

    const receipt = await tx.wait();
    console.log(
      "#",
      i,
      "wallet created; address: ",
      address,
      ", tx: ",
      tx.hash
    );
  }
}
// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
