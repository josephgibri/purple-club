/**
 * In-memory signer for the Purple Wallet.
 *
 * The Keypair is held only while the wallet is explicitly unlocked. All
 * callers receive a bound signing function rather than the raw Keypair so
 * no caller can accidentally retain a reference after lock.
 */

import { Keypair, Transaction, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";

export type SignMessageFn = (message: Uint8Array) => Promise<Uint8Array>;
export type SignTransactionFn = <T extends Transaction | VersionedTransaction>(tx: T) => Promise<T>;

export interface PurpleWalletSigner {
  publicKey: string;
  signMessage: SignMessageFn;
  signTransaction: SignTransactionFn;
}

/**
 * Create a signer from a decrypted private key (64-byte secret key or
 * 32-byte seed — Keypair.fromSecretKey handles both via slice).
 *
 * Called by usePurpleWallet once the password has been verified and the
 * private key has been decrypted from IndexedDB. The returned signer is
 * stored in React state; clearing that state is equivalent to "locking."
 */
export function createSigner(privateKeyBytes: Uint8Array): PurpleWalletSigner {
  // Keypair.fromSecretKey expects 64 bytes (seed + public). If we stored
  // only the 32-byte seed, expand it.
  let keypair: Keypair;
  if (privateKeyBytes.length === 64) {
    keypair = Keypair.fromSecretKey(privateKeyBytes);
  } else if (privateKeyBytes.length === 32) {
    keypair = Keypair.fromSeed(privateKeyBytes);
  } else {
    throw new Error("Invalid private key length.");
  }

  const publicKey = keypair.publicKey.toBase58();

  const signMessage: SignMessageFn = async (message: Uint8Array) => {
    // nacl.sign.detached — Keypair.sign uses tweetnacl internally
    const { sign } = await import("tweetnacl");
    return sign.detached(message, keypair.secretKey);
  };

  const signTransaction: SignTransactionFn = async <T extends Transaction | VersionedTransaction>(tx: T): Promise<T> => {
    if (tx instanceof VersionedTransaction) {
      tx.sign([keypair]);
    } else {
      tx.sign(keypair);
    }
    return tx;
  };

  return { publicKey, signMessage, signTransaction };
}
