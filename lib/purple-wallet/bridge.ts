/**
 * Bridge between the static Wallet Standard wallet (registered once on the
 * window) and the live React state in usePurpleWallet.
 *
 * The Standard wallet is a plain object that exists outside React. It can't
 * read hooks. So the PurpleWalletProvider populates this singleton with the
 * current address + signing functions + an "ensure unlocked" routine that
 * opens the unlock modal and resolves once the user unlocks.
 */

import type { Transaction, VersionedTransaction } from "@solana/web3.js";

export interface PurpleWalletBridge {
  /** Address of the stored wallet, even when locked (null if no wallet). */
  getAddress: () => string | null;
  /** Whether the wallet is currently unlocked (signer in memory). */
  isUnlocked: () => boolean;
  /**
   * Ensure the wallet is unlocked, opening the unlock/create modal if needed.
   * Resolves with the address once unlocked, rejects if the user cancels.
   */
  ensureUnlocked: () => Promise<string>;
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
  signTransaction: <T extends Transaction | VersionedTransaction>(tx: T) => Promise<T>;
}

let bridge: PurpleWalletBridge | null = null;

/** Listeners notified when the bridge connects/disconnects an account. */
type AccountListener = (address: string | null) => void;
const accountListeners = new Set<AccountListener>();

export function setPurpleWalletBridge(next: PurpleWalletBridge | null) {
  bridge = next;
}

export function getPurpleWalletBridge(): PurpleWalletBridge | null {
  return bridge;
}

export function onPurpleAccountChange(listener: AccountListener): () => void {
  accountListeners.add(listener);
  return () => accountListeners.delete(listener);
}

/** Called by the provider when the unlocked address changes (or clears). */
export function emitPurpleAccountChange(address: string | null) {
  for (const listener of accountListeners) listener(address);
}
