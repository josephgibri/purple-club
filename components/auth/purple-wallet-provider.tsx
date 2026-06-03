"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { usePurpleWallet, type UsePurpleWalletReturn } from "@/hooks/usePurpleWallet";
import {
  setPurpleWalletBridge,
  emitPurpleAccountChange,
} from "@/lib/purple-wallet/bridge";
import { registerPurpleStandardWallet } from "@/lib/purple-wallet/standard-wallet";
import { PurpleWalletModal, type PurpleWalletModalMode } from "./purple-wallet-modal";

interface PurpleWalletContextValue extends UsePurpleWalletReturn {
  openModal: (mode?: PurpleWalletModalMode) => void;
  closeModal: () => void;
}

const PurpleWalletContext = createContext<PurpleWalletContextValue | null>(null);

type UnlockResolver = {
  resolve: (address: string) => void;
  reject: (reason?: unknown) => void;
};

export function PurpleWalletProvider({ children }: { children: React.ReactNode }) {
  const wallet = usePurpleWallet();
  const [modalMode, setModalMode] = useState<PurpleWalletModalMode | null>(null);

  // Pending ensureUnlocked() promise from the Wallet Standard bridge.
  const unlockResolverRef = useRef<UnlockResolver | null>(null);

  function openModal(mode: PurpleWalletModalMode = "auto") {
    setModalMode(mode);
  }

  function closeModal() {
    // If the bridge was waiting on an unlock and the user closed the modal
    // without unlocking, reject so the adapter's connect() doesn't hang.
    if (unlockResolverRef.current && wallet.state !== "unlocked") {
      unlockResolverRef.current.reject(new Error("Purple Wallet unlock cancelled."));
      unlockResolverRef.current = null;
    }
    setModalMode(null);
  }

  // Register the Wallet Standard wallet once on the client.
  useEffect(() => {
    registerPurpleStandardWallet();
  }, []);

  // Keep the bridge pointed at the live signer + state.
  useEffect(() => {
    setPurpleWalletBridge({
      getAddress: () => wallet.address,
      isUnlocked: () => wallet.state === "unlocked",
      ensureUnlocked: () =>
        new Promise<string>((resolve, reject) => {
          if (wallet.state === "unlocked" && wallet.address) {
            resolve(wallet.address);
            return;
          }
          unlockResolverRef.current = { resolve, reject };
          // No wallet yet → create/import; otherwise → unlock.
          setModalMode(wallet.state === "none" ? "menu" : "unlock");
        }),
      signMessage: wallet.signMessage,
      signTransaction: wallet.signTransaction,
    });
    return () => setPurpleWalletBridge(null);
  }, [wallet.address, wallet.state, wallet.signMessage, wallet.signTransaction]);

  // Resolve any pending ensureUnlocked() once the wallet becomes unlocked,
  // and notify the Standard wallet so it can publish the connected account.
  useEffect(() => {
    if (wallet.state === "unlocked" && wallet.address) {
      emitPurpleAccountChange(wallet.address);
      if (unlockResolverRef.current) {
        unlockResolverRef.current.resolve(wallet.address);
        unlockResolverRef.current = null;
      }
      // Auto-close the unlock modal on success (covers both the bridge-driven
      // sign-in flow and the standalone "Unlock wallet" button). The create
      // flow uses a different mode so it can keep showing its success screen.
      setModalMode((m) => (m === "unlock" ? null : m));
    } else {
      emitPurpleAccountChange(null);
    }
  }, [wallet.state, wallet.address]);

  return (
    <PurpleWalletContext.Provider value={{ ...wallet, openModal, closeModal }}>
      {children}
      {modalMode !== null && (
        <PurpleWalletModal
          mode={modalMode}
          onClose={closeModal}
          wallet={wallet}
        />
      )}
    </PurpleWalletContext.Provider>
  );
}

// Safe no-op returned during SSR / prerendering outside the provider tree
// (e.g. Next.js /_not-found prerender). All callable members are harmless no-ops.
const NOOP_CTX: PurpleWalletContextValue = {
  state: "none",
  address: null,
  isLoading: false,
  error: null,
  createWallet: async () => {},
  importWallet: async () => {},
  unlock: async () => {},
  lock: () => {},
  removeWallet: async () => {},
  signMessage: async () => new Uint8Array(),
  signTransaction: async (tx) => tx,
  generateNewPhrase: () => "",
  validatePhrase: () => false,
  clearError: () => {},
  openModal: () => {},
  closeModal: () => {},
};

export function usePurpleWalletContext(): PurpleWalletContextValue {
  const ctx = useContext(PurpleWalletContext);
  // Return a safe no-op during SSR / rendering outside the provider.
  return ctx ?? NOOP_CTX;
}
