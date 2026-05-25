"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

/**
 * Tiny shared state for the mobile wallet flow. Lets the `useWalletSignIn`
 * hook open the bottom-sheet picker (rendered once globally by
 * `MobileWalletHost`) from any of Purple Club's six wallet entry
 * points without each consumer having to import + render its own picker
 * instance. Also lets the host signal back into the hook that the user
 * has returned from a deep-link with a `?walletAuth=` flag so the
 * hook can fire SIWS automatically.
 */

type MobileWalletContextValue = {
  pickerOpen: boolean;
  openPicker: () => void;
  closePicker: () => void;

  /**
   * Set by `MobileWalletHost` once it detects + consumes a
   * `?walletAuth=phantom|solflare` query flag on mount. The hook reads
   * this to know it should fire its SIWS state machine without waiting
   * for an explicit button click. Cleared after the hook acknowledges.
   */
  pendingResume: "phantom" | "solflare" | null;
  setPendingResume: (value: "phantom" | "solflare" | null) => void;
};

const MobileWalletContext = createContext<MobileWalletContextValue | null>(null);

export function MobileWalletProvider({ children }: { children: React.ReactNode }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingResume, setPendingResume] = useState<
    "phantom" | "solflare" | null
  >(null);

  const openPicker = useCallback(() => setPickerOpen(true), []);
  const closePicker = useCallback(() => setPickerOpen(false), []);

  const value = useMemo<MobileWalletContextValue>(
    () => ({
      pickerOpen,
      openPicker,
      closePicker,
      pendingResume,
      setPendingResume,
    }),
    [pickerOpen, openPicker, closePicker, pendingResume],
  );

  return (
    <MobileWalletContext.Provider value={value}>
      {children}
    </MobileWalletContext.Provider>
  );
}

export function useMobileWallet(): MobileWalletContextValue {
  const ctx = useContext(MobileWalletContext);
  if (!ctx) {
    throw new Error(
      "useMobileWallet must be used inside <MobileWalletProvider> (mounted by SolanaProvider).",
    );
  }
  return ctx;
}
