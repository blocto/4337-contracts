export interface InternalNoncePairs {
  readonly k: Uint8Array,
  readonly kTwo: Uint8Array,
  readonly kPublic: Uint8Array,
  readonly kTwoPublic: Uint8Array,
}

export interface InternalPublicNonces {
  readonly kPublic: Uint8Array,
  readonly kTwoPublic: Uint8Array,
}

export interface InternalSignature {
  finalPublicNonce: Uint8Array, // the final public nonce
  challenge: Uint8Array, // the schnorr challenge
  signature: Uint8Array, // the signature
}

export interface InternalNoncePairs {
  readonly k: Uint8Array,
  readonly kTwo: Uint8Array,
  readonly kPublic: Uint8Array,
  readonly kTwoPublic: Uint8Array,
}

export type InternalNonces = {
  [privateKey: string]: InternalNoncePairs
}