/**
 * BIP39 mnemonic → BIP44 Solana keypair.
 *
 * Derivation path: m/44'/501'/0'/0'  (standard Solana path, same as Phantom)
 *
 * Packages:
 *   @scure/bip39  — mnemonic generation + entropy conversion
 *   ed25519-hd-key — BIP32-Ed25519 HD derivation
 *   @solana/web3.js — Keypair from raw 32-byte seed
 */

import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from "@scure/bip39";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore – the .js extension export works at runtime; TS resolver needs the hint
import { wordlist as englishWordlist } from "@scure/bip39/wordlists/english.js";
import { derivePath } from "ed25519-hd-key";
import { Keypair } from "@solana/web3.js";

export const SOLANA_DERIVATION_PATH = "m/44'/501'/0'/0'";

/**
 * Generate a fresh 24-word BIP39 mnemonic (256-bit entropy).
 * The phrase is the ONLY recovery mechanism — never stored by the app.
 */
export function generatePhrase(): string {
  return generateMnemonic(englishWordlist, 256);
}

/**
 * Validate that a user-supplied phrase is a well-formed BIP39 mnemonic.
 */
export function validatePhrase(phrase: string): boolean {
  const normalized = phrase.trim().toLowerCase().replace(/\s+/g, " ");
  return validateMnemonic(normalized, englishWordlist);
}

/**
 * Derive a Solana Keypair from a BIP39 mnemonic phrase.
 * Same derivation path Phantom uses, so importing a Phantom seed gives the
 * same address.
 */
export function keypairFromPhrase(phrase: string): Keypair {
  const normalized = phrase.trim().toLowerCase().replace(/\s+/g, " ");
  if (!validateMnemonic(normalized, englishWordlist)) {
    throw new Error("Invalid seed phrase. Check every word and try again.");
  }
  const seed = mnemonicToSeedSync(normalized);
  const { key } = derivePath(SOLANA_DERIVATION_PATH, Buffer.from(seed).toString("hex"));
  return Keypair.fromSeed(key);
}

/**
 * Pick N distinct random word positions from the phrase for the backup
 * confirmation step (user must enter the word at each position).
 */
export function pickConfirmationIndexes(phrase: string, count = 3): number[] {
  const words = phrase.trim().split(/\s+/);
  const indexes: number[] = [];
  while (indexes.length < count) {
    const idx = Math.floor(Math.random() * words.length);
    if (!indexes.includes(idx)) indexes.push(idx);
  }
  return indexes.sort((a, b) => a - b);
}
