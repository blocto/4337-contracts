// update from https://github.com/borislav-itskov/schnorrkel.js
import { ethers } from "hardhat";
import {
  arrayify,
  hexConcat,
  keccak256,
  parseEther,
  hexlify,
} from "ethers/lib/utils";
import { Wallet, BigNumber, ContractTransaction } from "ethers";
import {
  toBuffer,
  fromSigned,
  toUnsigned,
  bufferToInt,
  addHexPrefix,
  intToHex,
  stripHexPrefix,
} from "ethereumjs-util";
import {
  createAuthorizedCosignerRecoverWallet,
  getMergedKey,
} from "../test/testutils";
import {
  Bytes,
  BytesLike,
  hexZeroPad,
  concat,
  Signature,
} from "@ethersproject/bytes";
import { toUtf8Bytes } from "@ethersproject/strings";

const SWC1 = "0x8C9Bb5B19607Ae030490CCCc087104AC692A1659";
const SWC2 = "0xcBa216bAE3f6d6C7BA46463e880d8BDc7feF13d0";
const EOA1 = "0x9f4D1E9b553fab73180F16870Cee65A52862a824"; // hao
const EOA2 = "0x3Eea25034397B249a3eD8614BB4d0533e5b03594"; // authorized wallet
const MC = "0x96E001595c131f9565e265918BD4Ef551df24d70";

const porttoDev = ethers.provider.getSigner(); // portto-dev

const ONE_WEI = BigNumber.from("1");
const TWO_WEI = BigNumber.from("2");
const TEN_WEI = BigNumber.from("10");

const txData = (revert: number, data: Uint8Array[]): Uint8Array => {
  const dataArr = [];
  const revertBuff = Buffer.alloc(1);
  revertBuff.writeUInt8(revert);
  dataArr.push(revertBuff);
  dataArr.push(...data);
  return concat(dataArr);
};

const invokeData = (
  to: string,
  amount: BigNumber,
  dataBuff: string
): Uint8Array => {
  const dataArr = [];
  dataArr.push(Buffer.from(to.replace("0x", ""), "hex")); // address as string
  dataArr.push(hexZeroPad(amount.toHexString(), 32));
  var hex = Buffer.from(dataBuff.replace("0x", ""), "hex");
  dataArr.push(hexZeroPad(hexlify(hex.length), 32));
  if (hex.length > 0) {
    dataArr.push(hex);
  }
  return concat(dataArr);
};

const EIP191V0MessagePrefix = "\x19\x00";

function hashMessageEIP191V0(
  chainId: number,
  address: string,
  message: Bytes | string
): string {
  address = address.replace("0x", "");

  const chainIdStr = hexZeroPad(hexlify(chainId), 32);

  return keccak256(
    concat([
      toUtf8Bytes(EIP191V0MessagePrefix),
      Uint8Array.from(Buffer.from(address, "hex")),
      chainIdStr,
      message,
    ])
  );
}

function padWithZeroes(hexString: string, targetLength: number): string {
  if (hexString !== "" && !/^[a-f0-9]+$/iu.test(hexString)) {
    throw new Error(
      `Expected an unprefixed hex string. Received: ${hexString}`
    );
  }

  if (targetLength < 0) {
    throw new Error(
      `Expected a non-negative integer target length. Received: ${targetLength}`
    );
  }

  return String.prototype.padStart.call(hexString, targetLength, "0");
}

function sign2Str(signer: Wallet, data: string): string {
  const sig = signer._signingKey().signDigest(data);

  return concatSig(toBuffer(sig.v), toBuffer(sig.r), toBuffer(sig.s));
}

function concatSig(v: Buffer, r: Buffer, s: Buffer): string {
  const rSig = fromSigned(r);
  const sSig = fromSigned(s);
  const vSig = bufferToInt(v);
  const rStr = padWithZeroes(toUnsigned(rSig).toString("hex"), 64);
  const sStr = padWithZeroes(toUnsigned(sSig).toString("hex"), 64);
  const vStr = stripHexPrefix(intToHex(vSig));
  return addHexPrefix(rStr.concat(sStr, vStr));
}

async function main(): Promise<void> {
  // const lockedAmount = ethers.utils.parseEther("1");
  // const CoreWallet = await ethers.getContractFactory("CoreWallet");
  // const wallet1 = await CoreWallet.attach(SWC1);
  // const wallet2 = await CoreWallet.attach(SWC2);

  const [
    authorizedWallet,
    cosignerWallet,
  ] = createAuthorizedCosignerRecoverWallet();

  const [px, pxIndexWithParity] = getMergedKey(
    authorizedWallet,
    cosignerWallet,
    0
  );

  // SWC direct transfer
  /*
  const nonce = (await wallet.nonce()).add(1);
  const nonceBytesLike = hexZeroPad(nonce.toHexString(), 32);
  const iData = invokeData(await porttoDev.getAddress(), ONE_WEI, "0x");
  const data = txData(1, [iData]);
  const dataForHash = concat([nonceBytesLike, data]);
  const hash191V0 = hashMessageEIP191V0(
    (await ethers.provider.getNetwork()).chainId,
    wallet.address,
    dataForHash
  );
  const signerSignature = sign2Str(authorizedWallet, hash191V0);
  const cosignerSignature = sign2Str(cosignerWallet, hash191V0);
  const signature = signerSignature + cosignerSignature.slice(2);

  const tx = await wallet.invoke2(nonce, data, signature);
  await tx.wait();
  console.log("tx: ", tx.hash);
  */

  // SWC self-batch
  /*
  const nonce = (await wallet.nonce()).add(1);
  const nonceBytesLike = hexZeroPad(nonce.toHexString(), 32);
  const iData1 = invokeData(await porttoDev.getAddress(), ONE_WEI, "0x");
  const iData2 = invokeData(HAO, ONE_WEI, "0x");
  const data = txData(1, [iData1, iData2]);
  const dataForHash = concat([nonceBytesLike, data]);
  const hash191V0 = hashMessageEIP191V0(
    (await ethers.provider.getNetwork()).chainId,
    wallet.address,
    dataForHash
  );
  const signerSignature = sign2Str(authorizedWallet, hash191V0);
  const cosignerSignature = sign2Str(cosignerWallet, hash191V0);
  const signature = signerSignature + cosignerSignature.slice(2);

  const tx = await wallet.invoke2(nonce, data, signature);
  await tx.wait();
  console.log("tx: ", tx.hash);
  */

  // SWC network-batch
  const tx1Data = await packInvoke2DataForWallet(
    SWC1,
    authorizedWallet,
    cosignerWallet,
    EOA1,
    ONE_WEI
  );

  const tx11Data = await packInvoke2DataForWallet(
    SWC1,
    authorizedWallet,
    cosignerWallet,
    EOA2,
    ONE_WEI,
    BigNumber.from(2)
  );

  const tx111Data = await packInvoke2DataForWallet(
    SWC1,
    authorizedWallet,
    cosignerWallet,
    EOA2,
    ONE_WEI,
    BigNumber.from(3)
  );

  const tx2Data = await packInvoke2DataForWallet(
    SWC2,
    authorizedWallet,
    cosignerWallet,
    EOA1,
    ONE_WEI
  );

  const tx22Data = await packInvoke2DataForWallet(
    SWC2,
    authorizedWallet,
    cosignerWallet,
    EOA2,
    ONE_WEI,
    BigNumber.from(2)
  );

  const tx222Data = await packInvoke2DataForWallet(
    SWC2,
    authorizedWallet,
    cosignerWallet,
    EOA2,
    ONE_WEI,
    BigNumber.from(3)
  );

  const Multicall = await ethers.getContractFactory("Multicall");
  const mc = await Multicall.attach(MC);

  const tx = await mc.aggregate([
    { target: SWC1, callData: tx1Data },
    { target: SWC1, callData: tx11Data },
    { target: SWC1, callData: tx111Data },
    { target: SWC2, callData: tx2Data },
    { target: SWC2, callData: tx22Data },
    { target: SWC2, callData: tx222Data },
  ]);
  await tx.wait();
  console.log("tx: ", tx.hash);
}

async function packInvoke2DataForWallet(
  address: string,
  authorizedWallet: Wallet,
  cosignerWallet: Wallet,
  to: string,
  value: BigNumber,
  nonceDelta: BigNumber = BigNumber.from(1)
): Promise<string> {
  const CoreWallet = await ethers.getContractFactory("CoreWallet");
  const wallet = await CoreWallet.attach(address);

  const nonce = (await wallet.nonce()).add(nonceDelta);
  const nonceBytesLike = hexZeroPad(nonce.toHexString(), 32);
  const iData = invokeData(to, ONE_WEI, "0x");
  const data = txData(1, [iData]);
  const dataForHash = concat([nonceBytesLike, data]);
  const hash191V0 = hashMessageEIP191V0(
    (await ethers.provider.getNetwork()).chainId,
    wallet.address,
    dataForHash
  );
  const signerSignature = sign2Str(authorizedWallet, hash191V0);
  const cosignerSignature = sign2Str(cosignerWallet, hash191V0);
  const signature = signerSignature + cosignerSignature.slice(2);
  return packInvoke2Data(nonce, data, signature);
}

async function packInvoke2Data(
  nonce: BigNumber,
  data: BytesLike,
  signature: BytesLike
): Promise<string> {
  const CoreWallet = await ethers.getContractFactory("CoreWallet");
  return CoreWallet.interface.encodeFunctionData("invoke2", [
    nonce,
    data,
    signature,
  ]);
}
// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
