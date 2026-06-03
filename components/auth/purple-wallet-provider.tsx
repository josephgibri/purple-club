"use client";

import { createContext, useContext, useState } from "react";
import { usePurpleWallet, type UsePurpleWalletReturn } from "@/hooks/usePurpleWallet";
import { PurpleWalletModal, type PurpleWalletModalMode } from "./purple-wallet-modal";

interface PurpleWalletContextValue extends UsePurpleWalletReturn {
  openModal: (mode?: PurpleWalletModalMode) => void;
  closeModal: () => void;
}

const PurpleWalletContext = createContext<PurpleWalletContextValue | null>(null);

export function PurpleWalletProvider({ children }: { children: React.ReactNode }) {
  const wallet = usePurpleWallet();
  const [modalMode, setModalMode] = useState<PurpleWalletModalMode | null>(null);

  function openModal(mode: PurpleWalletModalMode = "auto") {
    setModalMode(mode);
  }

  function closeModal() {
    setModalMode(null);
  }

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
