"use client";

import { useEffect, useRef } from "react";

import { isInsideWalletBrowser } from "@/lib/device";

import { MobileWalletPicker, WALLET_AUTH_PARAM } from "./mobile-wallet-picker";
import { useMobileWallet } from "./mobile-wallet-context";

/**
 * Mounted once globally by `SolanaProvider`. Two jobs:
 *
 *  1. Render the bottom-sheet `MobileWalletPicker` driven by the
 *     context's `pickerOpen` flag. Keeping a single picker instance
 *     means consumer components don't have to render their own — they
 *     just call `openPicker()` from the hook.
 *
 *  2. Run the auto-resume effect exactly once on first mount. When a
 *     user comes back inside Phantom / Solflare's in-app browser via
 *     the `?walletAuth=phantom|solflare` deep-link, we strip the flag
 *     from the URL and stash the wallet kind into context so the
 *     useWalletSignIn hook can fire its SIWS state machine the moment
 *     it mounts.
 */
export function MobileWalletHost() {
  const { pickerOpen, closePicker, setPendingResume } = useMobileWallet();
  const consumedRef = useRef(false);

  useEffect(() => {
    if (consumedRef.current) return;
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const flag = url.searchParams.get(WALLET_AUTH_PARAM);
    if (!flag) return;
    consumedRef.current = true;
    url.searchParams.delete(WALLET_AUTH_PARAM);
    window.history.replaceState({}, "", url.toString());
    // Only act on the flag if we actually landed inside the wallet's
    // in-app browser. Otherwise it's a stale URL from a shared link and
    // forcing a wallet select would just pop a useless modal.
    if (!isInsideWalletBrowser()) return;
    if (flag === "phantom" || flag === "solflare") {
      setPendingResume(flag);
    }
    // Only meant to run once on first mount; setPendingResume is stable
    // (created with useCallback) so we don't list it here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <MobileWalletPicker open={pickerOpen} onClose={closePicker} />;
}
