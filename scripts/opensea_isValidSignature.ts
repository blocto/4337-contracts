// NOTE: this file includes keys, SHOULD delete it before publish to public repo
import { ethers } from 'hardhat'
import { Wallet } from 'ethers'
import {
  hashMessageEIP191V0
} from '../test/testutils'

import {
  utilHashPersonalMessage,
  concatSig
} from '../test/utils'

import { toBuffer } from '@ethereumjs/util'

const ERC1271_MAGICVALUE_BYTES32 = '0x1626ba7e'
// const accountAddr = '0x604d34155b6e5bb63bf5b08ee50cf67b9ceef6ab'
const accountAddr = '0xFaf346Bff9f53bF0ef8B85391694738a13CF1D8c'

// SHOULD delete following key before publish to public repo
// authorized key
const AKey = '13a2f40830e4edbef23ff7b7d4d94b7357207883c6349d10e6a6225c4bc6bb73'
// cosigner key
const CKey = 'ba85ec51d96206e305fee5f3e61dbebfa4d4065df0d677ab998f8fe636d63e4e'

const msg = 'Welcome to OpenSea!\n\nClick to sign in and accept the OpenSea Terms of Service (https://opensea.io/tos) and Privacy Policy (https://opensea.io/privacy).\n\nThis request will not trigger a blockchain transaction or cost any gas fees.\n\nYour authentication status will reset after 24 hours.\n\nWallet address:\n0xfaf346bff9f53bf0ef8b85391694738a13cf1d8c\n\nNonce:\nd712ae2f-e004-4acd-ae4f-f5b65d54858a'

function sign (wallet: Wallet, hashPersonalMsg: string): string {
  console.log(hashMessageEIP191V0(accountAddr, hashPersonalMsg))
  const sig = wallet._signingKey().signDigest(hashMessageEIP191V0(accountAddr, hashPersonalMsg))

  const serializedSig = concatSig(toBuffer(sig.v), toBuffer(sig.r), toBuffer(sig.s))
  return serializedSig
}

async function main (): Promise<void> {
  const Account = await ethers.getContractFactory('BloctoAccount')
  const account = await Account.attach(accountAddr)

  console.log('accountAddr: ', accountAddr)

  const authorizedWallet = new ethers.Wallet(AKey)
  console.log('authorized(device) address: ', authorizedWallet.address)
  const cosignerWallet = new ethers.Wallet(CKey)
  console.log('cosigner address: ', cosignerWallet.address)

  const hashPersonalMsg = utilHashPersonalMessage(msg)
  console.log('hashPersonalMsg:', hashPersonalMsg)
  const authorizedSig = sign(authorizedWallet, hashPersonalMsg)
  const cosignerSig = sign(cosignerWallet, hashPersonalMsg)
  console.log('cosignerSig: ', cosignerSig)
  const combinedSig = authorizedSig + cosignerSig.slice(2)
  // console.log(sig)
  console.log('combinedSig: ', combinedSig)
  const result = await account.isValidSignature(hashPersonalMsg, combinedSig)
  console.log('result: ', result)

  if (ERC1271_MAGICVALUE_BYTES32 === result) {
    console.log('Valid signature success!')
  }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
