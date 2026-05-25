"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import type { WalletName } from "@solana/wallet-adapter-base";
import { useCallback, useEffect, useRef, useState } from "react";

import { useWalletAuth } from "@/hooks/useWalletAuth";
import { useMobileWallet } from "@/components/auth/mobile-wallet-context";
import {
  getInjectedWalletKind,
  isMobileExternalBrowser,
  isMobileWalletWebView,
} from "@/lib/device";

type SignInState = {
  isPending: boolean;
  error: string | null;
  enter: () => Promise<void>;
};

/**
 * If the connect → SIWS state machine doesn't make forward progress in
 * this many ms (connect never resolves, wallet WebView never re-injects,
 * etc.) we unstick `siwsPending` and surface an error so the button is
 * usable again. Generous to absorb mobile universal-link round-trips,
 * which can legitimately take 20–30s on slower devices.
 */
const SIWS_WATCHDOG_MS = 30_000;

/**
 * Central wallet sign-in hook. Owns a two-step state machine driven by
 * `siwsPending`:
 *
 *   1. User picks a wallet (header modal, mobile picker deep-link, or
 *      programmatic `select()` inside a wallet WebView). The adapter
 *      becomes the selected one but isn't connected yet.
 *   2. Effect notices `wallet.wallet?.adapter` is now set, calls
 *      `wallet.connect()` (the provider has `autoConnect={false}` so we
 *      drive this ourselves).
 *   3. Effect notices `wallet.publicKey` lands, fires `runSignIn()` →
 *      writes the SIWS proof into sessionStorage.
 *
 * `enter()` is the single entry point — every Club call site funnels
 * through it. Device branching happens here so the picker, WebView
 * auto-select, and desktop modal flows all share the same downstream
 * logic.
 */
export function useWalletSignIn(): SignInState {
  const wallet = useWallet();
  const { setVisible } = useWalletModal();
  const { isVerified, verify, setError } = useWalletAuth();
  const { openPicker, pendingResume, setPendingResume } = useMobileWallet();

  const [isPending, setIsPending] = useState(false);
  const [siwsPending, setSiwsPending] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const watchdogTimerRef = useRef<number | null>(null);

  const clearWatchdog = useCallback(() => {
    if (watchdogTimerRef.current !== null) {
      window.clearTimeout(watchdogTimerRef.current);
      watchdogTimerRef.current = null;
    }
  }, []);

  const armWatchdog = useCallback(() => {
    clearWatchdog();
    watchdogTimerRef.current = window.setTimeout(() => {
      watchdogTimerRef.current = null;
      setSiwsPending((current) => {
        if (!current) return current;
        const msg = "Wallet didn't respond — try again or open your wallet app.";
        setLocalError(msg);
        setError(msg);
        setIsPending(false);
        return false;
      });
    }, SIWS_WATCHDOG_MS);
  }, [clearWatchdog, setError]);

  useEffect(() => () => clearWatchdog(), [clearWatchdog]);

  const clearWalletSelection = useCallback(() => {
    try {
      wallet.select(null);
    } catch {
      // Some adapters throw when there's nothing selected — fine.
    }
  }, [wallet]);

  const runSignIn = useCallback(async () => {
    if (!wallet.wallet?.adapter) return;
    setLocalError(null);
    setError(null);
    setIsPending(true);
    try {
      if (!wallet.connected) {
        await wallet.connect();
      }
      await verify();
    } catch (value) {
      const raw =
        value instanceof Error ? value.message : "Sign-in failed.";
      const msg =
        raw.includes("User rejected") ||
        raw.includes("rejected") ||
        raw.includes("declined")
          ? "Sign-in declined."
          : raw;
      setLocalError(msg);
      setError(msg);
      clearWalletSelection();
    } finally {
      setIsPending(false);
    }
    // useWallet() returns a fresh object every render so we depend on
    // the specific fields we read, not the wallet object itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    wallet.wallet,
    wallet.connect,
    wallet.connected,
    verify,
    setError,
    clearWalletSelection,
  ]);

  // State machine: once `siwsPending` is true, drive
  // select → connect → publicKey → runSignIn. The two halves
  // (connect, then SIWS) run in two passes of this effect because
  // `wallet.publicKey` becoming non-null is what re-fires it.
  useEffect(() => {
    if (!siwsPending) return;
    if (!wallet.wallet?.adapter) return;

    if (!wallet.publicKey) {
      if (wallet.connecting) return;
      void wallet.connect().catch((err) => {
        const message =
          err instanceof Error ? err.message : "Wallet connection rejected.";
        setLocalError(message);
        setError(message);
        clearWatchdog();
        setSiwsPending(false);
        setIsPending(false);
        clearWalletSelection();
      });
      return;
    }

    clearWatchdog();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSiwsPending(false);
    void runSignIn();
    // useWallet() returns a fresh object every render so we list the
    // specific fields we read; disable exhaustive-deps for that reason.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    siwsPending,
    wallet.wallet,
    wallet.publicKey,
    wallet.connecting,
    wallet.connect,
    runSignIn,
    clearWalletSelection,
    clearWatchdog,
    setError,
  ]);

  // Deep-link auto-resume. When the user comes back inside Phantom or
  // Solflare's WebView via `?walletAuth=...`, MobileWalletHost stashes
  // the wallet kind in context. We pick it up here, programmatically
  // select that adapter, and let the state machine above drive the
  // rest. Cleared after consumption so other hook instances don't
  // double-fire.
  useEffect(() => {
    if (!pendingResume) return;
    // Each of these setState calls is the legitimate "react-to-external-
    // signal" pattern: pendingResume is set by MobileWalletHost based on
    // the URL the user just landed on, and we need to flip our internal
    // machine into a pending state synchronously so the consumer's
    // button reflects "Signing in…" on the very first render after the
    // WebView re-mounts the page.
    /* eslint-disable react-hooks/set-state-in-effect */
    setPendingResume(null);
    setIsPending(true);
    setSiwsPending(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    armWatchdog();
    try {
      wallet.select(
        (pendingResume === "phantom" ? "Phantom" : "Solflare") as WalletName<string>,
      );
    } catch {
      // Adapter not registered — should never happen since we always
      // register both in SolanaProvider.
    }
    // wallet/setPendingResume/armWatchdog change on every render; this
    // effect must only act when pendingResume transitions to a value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingResume]);

  /**
   * Single entry point. Branches by environment:
   *
   *   - Already SIWS-verified → no-op.
   *   - Adapter already attached + connected → fire SIWS directly.
   *   - Inside a wallet's in-app browser → select the injected adapter
   *     and let the state machine handle connect + SIWS.
   *   - Mobile external browser → open the bottom-sheet picker that
   *     fires a `?walletAuth=` deep-link.
   *   - Desktop (any OS) → standard wallet adapter modal so users can
   *     pick between extensions; the state machine fires SIWS once
   *     they select.
   */
  const enter = useCallback(async () => {
    setLocalError(null);
    if (isVerified) return;

    if (wallet.wallet?.adapter && wallet.publicKey) {
      await runSignIn();
      return;
    }

    if (isMobileWalletWebView()) {
      const injected = getInjectedWalletKind();
      if (injected) {
        setIsPending(true);
        setSiwsPending(true);
        armWatchdog();
        try {
          wallet.select(
            (injected === "phantom" ? "Phantom" : "Solflare") as WalletName<string>,
          );
        } catch {
          // adapter not registered — extremely unlikely.
        }
        return;
      }
    }

    if (isMobileExternalBrowser()) {
      openPicker();
      return;
    }

    setIsPending(true);
    setSiwsPending(true);
    armWatchdog();
    setVisible(true);
  }, [
    isVerified,
    wallet,
    runSignIn,
    setVisible,
    openPicker,
    armWatchdog,
  ]);

  return {
    isPending: isPending || siwsPending,
    error: localError,
    enter,
  };
}
