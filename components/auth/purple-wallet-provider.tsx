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

export function usePurpleWalletContext(): PurpleWalletContextValue {
  const ctx = useContext(PurpleWalletContext);
  if (!ctx) {
    throw new Error(
      "usePurpleWalletContext must be used inside <PurpleWalletProvider>",
    );
  }
  return ctx;
}
