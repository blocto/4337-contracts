import hre, { ethers } from "hardhat";
import { getImplementationAddress } from "@openzeppelin/upgrades-core";
import { getDeployCode } from "../src/create3Factory";
import { create3DeployTransparentProxy } from "../src/deployAccountFactoryWithCreate3";
import {
  BloctoAccountCloneableWallet__factory,
  CREATE3Factory__factory,
} from "../typechain";
import { hexZeroPad } from "@ethersproject/bytes";

const CreateAccountBackend = "0x1A0D223109C75cD340BB9b5a786669806429b83d"; // portto-dev
const EntryPoint = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789"; // 4337 official
const Create3FactoryAddress = "0x14c5f3167B9F7760219330aE23ef845dfBf3bC56"; // from 0_deploy_create3Factory.ts

// BloctowalletCloneableSalt
const BloctoAccountCloneableWalletSalt = "BloctoAccount_hao";
const BloctoAccountFactorySalt = "BloctoAccountFactoryProxy_hao";

async function main(): Promise<void> {
  // const lockedAmount = ethers.utils.parseEther("1");
  const [owner] = await ethers.getSigners();
  console.log("deploy with account: ", owner.address);

  const create3Factory = CREATE3Factory__factory.connect(
    Create3FactoryAddress,
    owner
  );
  // -------------------BloctoAccountCloneableWallet------------------------------//
  const accountSalt = hexZeroPad(
    Buffer.from(BloctoAccountCloneableWalletSalt, "utf-8"),
    32
  );
  console.log(
    `Deploying BloctoAccountCloneableWallet with -> \n\t salt str:  ${BloctoAccountCloneableWalletSalt}`
  );
  const walletCloneable = await create3Factory.getDeployed(
    owner.address,
    accountSalt
  );

  if ((await ethers.provider.getCode(walletCloneable)) === "0x") {
    console.log(`BloctowalletCloneableWallet deploying to: ${walletCloneable}`);
    const tx = await create3Factory.deploy(
      accountSalt,
      getDeployCode(new BloctoAccountCloneableWallet__factory(), [EntryPoint])
    );
    await tx.wait();

    console.log(
      `BloctowalletCloneableWallet JUST deployed to: ${walletCloneable}`
    );
  } else {
    console.log(
      `BloctowalletCloneableWallet WAS deployed to: ${walletCloneable}`
    );
  }

  // -------------------BloctoAccountFactory------------------------------//
  const accountFactorySalt = hexZeroPad(
    Buffer.from(BloctoAccountFactorySalt, "utf-8"),
    32
  );
  const accountFactoryAddr = await create3Factory.getDeployed(
    owner.address,
    accountFactorySalt
  );

  if ((await ethers.provider.getCode(accountFactoryAddr)) === "0x") {
    const BloctoAccountFactory = await ethers.getContractFactory(
      "BloctoAccountFactory"
    );
    const accountFactory = await create3DeployTransparentProxy(
      BloctoAccountFactory,
      [walletCloneable, EntryPoint, owner.address],
      { initializer: "initialize" },
      create3Factory,
      owner,
      accountFactorySalt
    );

    await accountFactory.deployed();
    console.log(
      `BloctoAccountFactory JUST deployed to: ${accountFactory.address}`
    );
    // grant role
    console.log(
      "Granting create account role to backend address: ",
      CreateAccountBackend
    );
    await accountFactory.grantRole(
      await accountFactory.CREATE_ACCOUNT_ROLE(),
      CreateAccountBackend
    );
  } else {
    console.log(`BloctoAccountFactory WAS deployed to: ${accountFactoryAddr}`);
  }

  // ---------------add stake------------
  // console.log('Adding stake to account factory')
  // const tx = await accountFactory.addStake(BigNumber.from(86400 * 3650), { value: ethers.utils.parseEther('0.001') })
  // await tx.wait()

  // const entrypoint = EntryPoint__factory.connect(EntryPoint, ethers.provider)
  // const depositInfo = await entrypoint.getDepositInfo(accountFactory.address)
  // console.log('stake: ', ethers.utils.formatUnits(depositInfo.stake), ', unstakeDelaySec: ', depositInfo.unstakeDelaySec)

  // sleep 16 seconds
  console.log("sleep 16 seconds for chain sync...");
  await new Promise((f) => setTimeout(f, 16000));

  // -------------------Verify------------------------------//
  // verify BloctowalletCloneableWallet
  await hre.run("verify:verify", {
    address: walletCloneable,
    contract:
      "contracts/BloctoAccountCloneableWallet.sol:BloctoAccountCloneableWallet",
    constructorArguments: [EntryPoint],
  });

  // verify BloctoAccountFactory (if proxy)
  const accountFactoryImplAddress = await getImplementationAddress(
    ethers.provider,
    accountFactoryAddr
  );
  await hre.run("verify:verify", {
    address: accountFactoryImplAddress,
    contract: "contracts/BloctoAccountFactory.sol:BloctoAccountFactory",
  });
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
