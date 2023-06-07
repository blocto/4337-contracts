// import { Key, PublicNonces } from '@borislav.itskov/schnorrkel.js/src/types'
// fork from https://github.com/borislav-itskov/schnorrkel.js
// import Schnorrkel, { Key, PublicNonces, SignatureOutput } from '@borislav.itskov/schnorrkel.js/src/index'
import Schnorrkel, { Key, PublicNonces, SignatureOutput } from '../src/schnorrkel.js/index'
import { Wallet } from 'ethers'
import { ethers } from 'hardhat'
import secp256k1 from 'secp256k1'

const schnorrkel = new Schnorrkel()

export class KeyPair {
  privateKey: Key
  publicKey: Key

  constructor ({ publicKey, privateKey }: { publicKey: Buffer, privateKey: Buffer }) {
    this.privateKey = new Key(privateKey)
    this.publicKey = new Key(publicKey)
  }

  static fromJson (params: string): KeyPair {
    try {
      const data = JSON.parse(params)
      const publicKey = Key.fromHex(data.publicKey)
      const privateKey = Key.fromHex(data.privateKey)

      return new KeyPair({ publicKey: publicKey.buffer, privateKey: privateKey.buffer })
    } catch (error) {
      throw new Error('Invalid JSON')
    }
  }

  toJson (): string {
    return JSON.stringify({
      publicKey: this.publicKey.toHex(),
      privateKey: this.privateKey.toHex()
    })
  }
}

export class DefaultSigner {
  #privateKey: Key
  #publicKey: Key

  constructor (w: Wallet) {
    const pubKey = Buffer.from(secp256k1.publicKeyCreate(ethers.utils.arrayify(w.privateKey)))

    const data = {
      publicKey: pubKey,
      privateKey: Buffer.from(ethers.utils.arrayify(w.privateKey))
    }
    const keyPair = new KeyPair(data)

    this.#privateKey = keyPair.privateKey
    this.#publicKey = keyPair.publicKey
  }

  getPublicKey (): Key {
    return this.#publicKey
  }

  getPublicNonces (): PublicNonces {
    return schnorrkel.generatePublicNonces(this.#privateKey)
  }

  multiSignMessage (msg: string, publicKeys: Key[], publicNonces: PublicNonces[]): SignatureOutput {
    return schnorrkel.multiSigSign(this.#privateKey, msg, publicKeys, publicNonces)
  }
}
