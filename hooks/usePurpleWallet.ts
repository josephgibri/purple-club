"use client";

/**
 * Central React hook for the Purple Wallet.
 *
 * State machine:
 *   "none"     – no wallet stored in IndexedDB for this browser
 *   "locked"   – wallet exists but private key is not in memory
 *   "unlocked" – private key is in memory; signer is ready
 *
 * The private key NEVER touches React state. It lives in the signer object
 * which is memoized and cleared on lock/tab-close. Auto-lock fires after
 * AUTO_LOCK_MS of inactivity.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { Transaction, VersionedTransaction } from "@solana/web3.js";

import {
  encryptPrivateKey,
  decryptPrivateKey,
  encryptString,
  decryptString,
} from "@/lib/purple-wallet/crypto";
import { saveWallet, listWallets, deleteWallet, loadWallet } from "@/lib/purple-wallet/keystore";
import { keypairFromPhrase, generatePhrase, validatePhrase } from "@/lib/purple-wallet/keygen";
import { createSigner, type PurpleWalletSigner } from "@/lib/purple-wallet/signer";

const AUTO_LOCK_MS = 5 * 60 * 1000; // 5 minutes

export type PurpleWalletState = "none" | "locked" | "unlocked";

export interface UsePurpleWalletReturn {
  state: PurpleWalletState;
  address: string | null;

  /** Create a brand-new wallet from a freshly-generated phrase. */
  createWallet: (phrase: string, password: string) => Promise<void>;
  /** Import an existing wallet from a user-supplied seed phrase. */
  importWallet: (phrase: string, password: string) => Promise<void>;
  /** Unlock the stored wallet with the user's password. */
  unlock: (password: string) => Promise<void>;
  /**
   * Decrypt and return the 12-word recovery phrase after verifying the
   * password. Throws if the password is wrong or the wallet predates phrase
   * storage. The phrase is never held in state — the caller shows it transiently.
   */
  revealPhrase: (password: string) => Promise<string>;
  /** Lock — clears the in-memory signer. */
  lock: () => void;
  /** Delete the stored wallet from IndexedDB permanently. */
  removeWallet: () => Promise<void>;

  /** Sign an arbitrary message (e.g. SIWS). Only callable when unlocked. */
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
  /** Sign a transaction. Only callable when unlocked. */
  signTransaction: <T extends Transaction | VersionedTransaction>(tx: T) => Promise<T>;

  /** Convenience: generate a fresh phrase (call before showing backup UI). */
  generateNewPhrase: () => string;
  /** Validate a user-typed phrase. */
  validatePhrase: (phrase: string) => boolean;

  isLoading: boolean;
  error: string | null;
  clearError: () => void;
}

export function usePurpleWallet(): UsePurpleWalletReturn {
  const [state, setState] = useState<PurpleWalletState>("none");
  const [address, setAddress] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const signerRef = useRef<PurpleWalletSigner | null>(null);
  const lockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Bootstrap: check IndexedDB for an existing wallet ──────────────────
  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      try {
        const wallets = await listWallets();
        if (cancelled) return;
        if (wallets.length > 0) {
          setState("locked");
          setAddress(wallets[0].address);
        } else {
          setState("none");
          setAddress(null);
        }
      } catch {
        if (!cancelled) setState("none");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void bootstrap();
    return () => { cancelled = true; };
  }, []);

  // ── Auto-lock timer ─────────────────────────────────────────────────────
  const resetAutoLock = useCallback(() => {
    if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
    lockTimerRef.current = setTimeout(() => {
      signerRef.current = null;
      setState((s) => (s === "unlocked" ? "locked" : s));
    }, AUTO_LOCK_MS);
  }, []);

  const lock = useCallback(() => {
    if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
    signerRef.current = null;
    setState((s) => (s === "unlocked" ? "locked" : s));
  }, []);

  // Lock on tab/page hide
  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === "hidden") lock();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [lock]);

  // ── Core operations ────────────────────────────────────────────────────
  const storeWallet = useCallback(
    async (phrase: string, password: string) => {
      const keypair = keypairFromPhrase(phrase);
      const normalizedPhrase = phrase.trim().toLowerCase().replace(/\s+/g, " ");
      const encrypted = await encryptPrivateKey(keypair.secretKey, password);
      // Seal the mnemonic under the same password so it can be revealed later.
      const encryptedMnemonic = await encryptString(normalizedPhrase, password);
      const addr = keypair.publicKey.toBase58();
      await saveWallet(addr, encrypted, encryptedMnemonic);
      // Immediately unlock after creation/import
      signerRef.current = createSigner(keypair.secretKey);
      setAddress(addr);
      setState("unlocked");
      resetAutoLock();
    },
    [resetAutoLock],
  );

  const revealPhrase = useCallback(
    async (password: string) => {
      if (!address) throw new Error("No wallet to reveal.");
      const record = await loadWallet(address);
      if (!record) throw new Error("Wallet not found in storage.");
      if (!record.encryptedMnemonic) {
        throw new Error(
          "Recovery phrase isn't stored for this wallet (it was created before backups were saved). Delete and re-import it to enable phrase reveal.",
        );
      }
      // decryptString throws "Incorrect password or corrupted wallet." on a
      // bad password, which doubles as our password check.
      return decryptString(record.encryptedMnemonic, password);
    },
    [address],
  );

  const createWallet = useCallback(
    async (phrase: string, password: string) => {
      setIsLoading(true);
      setError(null);
      try {
        await storeWallet(phrase, password);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to create wallet.";
        setError(msg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [storeWallet],
  );

  const importWallet = useCallback(
    async (phrase: string, password: string) => {
      setIsLoading(true);
      setError(null);
      try {
        if (!validatePhrase(phrase)) {
          throw new Error("Invalid seed phrase. Check every word and try again.");
        }
        await storeWallet(phrase, password);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to import wallet.";
        setError(msg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [storeWallet],
  );

  const unlock = useCallback(
    async (password: string) => {
      if (!address) throw new Error("No wallet to unlock.");
      setIsLoading(true);
      setError(null);
      try {
        const record = await loadWallet(address);
        if (!record) throw new Error("Wallet not found in storage.");
        const privateKey = await decryptPrivateKey(record.encryptedKey, password);
        signerRef.current = createSigner(privateKey);
        // Wipe the key bytes from memory as soon as the signer is ready
        privateKey.fill(0);
        setState("unlocked");
        resetAutoLock();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Could not unlock wallet.";
        setError(msg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [address, resetAutoLock],
  );

  const removeWallet = useCallback(async () => {
    lock();
    if (address) await deleteWallet(address);
    setAddress(null);
    setState("none");
  }, [address, lock]);

  // ── Signing ─────────────────────────────────────────────────────────────
  const signMessage = useCallback(async (message: Uint8Array) => {
    const signer = signerRef.current;
    if (!signer) throw new Error("Wallet is locked. Unlock before signing.");
    resetAutoLock();
    return signer.signMessage(message);
  }, [resetAutoLock]);

  const signTransaction = useCallback(
    async <T extends Transaction | VersionedTransaction>(tx: T): Promise<T> => {
      const signer = signerRef.current;
      if (!signer) throw new Error("Wallet is locked. Unlock before signing.");
      resetAutoLock();
      return signer.signTransaction(tx);
    },
    [resetAutoLock],
  );

  return {
    state,
    address,
    createWallet,
    importWallet,
    unlock,
    revealPhrase,
    lock,
    removeWallet,
    signMessage,
    signTransaction,
    generateNewPhrase: generatePhrase,
    validatePhrase,
    isLoading,
    error,
    clearError: () => setError(null),
  };
}
