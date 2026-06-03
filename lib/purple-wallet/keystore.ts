/**
 * IndexedDB keystore for the Purple Wallet.
 *
 * Stores one record per wallet: the public key (address) as the ID and the
 * AES-GCM encrypted private key blob. The raw private key is NEVER stored.
 *
 * Schema:
 *   DB name : "purple-wallet"
 *   Store   : "wallets"
 *   Key     : base58 wallet address (string)
 *   Value   : { address: string; encryptedKey: string; createdAt: number }
 */

import { openDB, type DBSchema, type IDBPDatabase } from "idb";

interface PurpleWalletRecord {
  address: string;
  encryptedKey: string;
  /**
   * Encrypted BIP39 mnemonic, sealed under the same password as encryptedKey.
   * Optional so wallets created before this field shipped still load — those
   * simply can't reveal their phrase (only export wasn't available then).
   */
  encryptedMnemonic?: string;
  createdAt: number;
}

interface PurpleWalletDB extends DBSchema {
  wallets: {
    key: string;
    value: PurpleWalletRecord;
  };
}

let dbPromise: Promise<IDBPDatabase<PurpleWalletDB>> | null = null;

function getDb(): Promise<IDBPDatabase<PurpleWalletDB>> {
  if (!dbPromise) {
    dbPromise = openDB<PurpleWalletDB>("purple-wallet", 1, {
      upgrade(db) {
        db.createObjectStore("wallets", { keyPath: "address" });
      },
    });
  }
  return dbPromise;
}

export async function saveWallet(
  address: string,
  encryptedKey: string,
  encryptedMnemonic?: string,
): Promise<void> {
  const db = await getDb();
  await db.put("wallets", {
    address,
    encryptedKey,
    encryptedMnemonic,
    createdAt: Date.now(),
  });
}

export async function loadWallet(
  address: string,
): Promise<PurpleWalletRecord | undefined> {
  const db = await getDb();
  return db.get("wallets", address);
}

export async function listWallets(): Promise<PurpleWalletRecord[]> {
  const db = await getDb();
  return db.getAll("wallets");
}

export async function deleteWallet(address: string): Promise<void> {
  const db = await getDb();
  await db.delete("wallets", address);
}

export async function hasAnyWallet(): Promise<boolean> {
  const db = await getDb();
  const count = await db.count("wallets");
  return count > 0;
}
