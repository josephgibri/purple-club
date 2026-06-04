"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import type { WalletName } from "@solana/wallet-adapter-base";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { useWalletAuth } from "@/hooks/useWalletAuth";
import { useMobileWallet } from "@/components/auth/mobile-wallet-context";
import { usePurpleWalletContext } from "@/components/auth/purple-wallet-provider";
import {
  getInjectedWalletKind,
  isMobileExternalBrowser,
  isMobileWalletWebView,
} from "@/lib/device";

const PURPLE_WALLET_NAME = "Purple Wallet";

// Must stay in sync with the key written by useWalletAuth.ts.
const PC_AUTH_PREFIX = "pc_auth:";

/**
 * Returns true if sessionStorage already holds a non-expired SIWS proof
 * for the given wallet address. Checked synchronously so we can skip
 * re-requesting a signature when the adapter reconnects silently on a
 * returning session (adapter remembered in localStorage, proof still
 * valid in sessionStorage).
 */
function hasValidStoredProof(address: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = sessionStorage.getItem(PC_AUTH_PREFIX + address);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { publicKey?: string; expiresAt?: number };
    return parsed.publicKey === address && Boolean(parsed.expiresAt && parsed.expiresAt > Date.now());
  } catch {
    return false;
  }
}

// wallet-adapter persists the last-selected wallet name here (default key).
// On a hard refresh the adapter for that name re-attaches only once the wallet
// announces itself via the Wallet Standard — which can lag behind the user's
// first click while the extension's content script is still booting.
const WALLET_NAME_LS_KEY = "walletName";

function hasRememberedWallet(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(WALLET_NAME_LS_KEY);
    if (!raw) return false;
    // Stored JSON-encoded (e.g. "\"Phantom\""); fall back to the raw string.
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed === "string") return parsed.length > 0;
    return raw.length > 0;
  } catch {
    return false;
  }
}

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
  const purple = usePurpleWalletContext();
  const router = useRouter();
  const pathname = usePathname();

  const [isPending, setIsPending] = useState(false);
  const [siwsPending, setSiwsPending] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const watchdogTimerRef = useRef<number | null>(null);
  // Guards against two callers (the connect state machine and the Purple
  // Wallet auto-sign effect) both firing runSignIn at once.
  const signingInFlightRef = useRef(false);
  // Tracks the Purple Wallet address we've already auto-signed for, so we
  // don't re-prompt a signature on every render once connected.
  const purpleAutoSignRef = useRef<string | null>(null);
  // Dedupes the Purple Wallet direct-verify so a burst of renders during the
  // unlock → connect transition can't fire multiple signatures at once.
  const purpleSignInFlightRef = useRef(false);
  // When the user explicitly chose to enter the club (vs. a silent
  // reconnect), redirect into /account once SIWS lands. Lets a freshly
  // created Purple Wallet (0 PBTC) reach its dashboard instead of stalling
  // on the landing page.
  const enterIntentRef = useRef(false);
  // Latest Purple Wallet context, read inside runSignIn without forcing it to
  // be recreated on every unlock/lock transition.
  const purpleRef = useRef(purple);
  useEffect(() => {
    purpleRef.current = purple;
  }, [purple]);

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
    if (signingInFlightRef.current) return;
    signingInFlightRef.current = true;
    setLocalError(null);
    setError(null);
    setIsPending(true);
    try {
      if (!wallet.connected) {
        await wallet.connect();
      }
      // Close the wallet-picker modal as soon as the adapter is connected,
      // before we even request the SIWS signature. Without this the modal
      // stays open on top of the signature prompt (or stays open forever
      // when the adapter was already selected from a previous session).
      setVisible(false);
      // Skip re-signing if sessionStorage already holds a valid proof for
      // this wallet. This happens when the adapter was remembered from
      // localStorage (autoConnect=false so connected=false on load) but the
      // 24-hour proof is still live — we reconnect silently without asking
      // the user to sign again. useWalletAuth's own effect will re-sync the
      // server cookie from the stored proof.
      const address = wallet.publicKey?.toBase58();
      // Purple Wallet: sign the SIWS message with the in-memory keypair
      // directly. The wallet-adapter signMessage round-trip (adapter →
      // standard-wallet → bridge → signer) can silently no-op if the bridge
      // isn't wired yet, which is what left users stuck on "Sign to Enter".
      // Signing through the live context is deterministic.
      const isPurple = wallet.wallet?.adapter?.name === PURPLE_WALLET_NAME;

      // External wallets: if a valid SIWS proof is already stored, skip the
      // signature so we don't trigger a redundant extension popup. Purple
      // Wallet signs SILENTLY with the in-memory key, so we always (re)sign —
      // re-running verify also re-emits the proof event, resyncing any
      // useWalletAuth instance that missed the first write. That stale-sync was
      // what left the header stuck on "Sign to Enter" with clicks doing
      // nothing (runSignIn kept early-returning here while isVerified was false).
      if (!isPurple && address && hasValidStoredProof(address)) return;

      const pw = purpleRef.current;
      if (isPurple && address) {
        if (pw.state !== "unlocked" || pw.address !== address) {
          // Locked (e.g. auto-locked) — prompt unlock. The provider resolves
          // the unlock and the auto-sign effect retries once it's unlocked.
          pw.openModal("unlock");
          return;
        }
        await verify({ address, signMessage: pw.signMessage });
      } else {
        await verify();
      }
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
      signingInFlightRef.current = false;
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
    setVisible,
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
    // Purple Wallet sign-in is owned by the dedicated auto-login effect below
    // (it signs silently with the in-memory key the moment the wallet is
    // unlocked). Driving it through runSignIn here too created a race: one pass
    // could read a still-"locked" ref, bail, reopen the unlock modal, and
    // consume the auto-sign guard so SIWS never fired. External wallets still
    // go through runSignIn (they need the adapter signMessage round-trip).
    if (wallet.wallet?.adapter?.name !== PURPLE_WALLET_NAME) {
      void runSignIn();
    }
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
    // Resuming from a picker / deep-link is an explicit intent to enter.
    enterIntentRef.current = true;
    armWatchdog();
    try {
      const name =
        pendingResume === "phantom"
          ? "Phantom"
          : pendingResume === "solflare"
            ? "Solflare"
            : "Purple Wallet";
      wallet.select(name as WalletName<string>);
    } catch {
      // Adapter not registered — should never happen since Phantom/Solflare
      // and Purple Wallet are all Wallet Standard wallets.
    }
    // wallet/setPendingResume/armWatchdog change on every render; this
    // effect must only act when pendingResume transitions to a value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingResume]);

  // Purple Wallet auto-login — the single source of truth for Purple Wallet
  // SIWS. The wallet only "connects" after the user explicitly unlocks/creates
  // it (password required), so a connected + unlocked Purple Wallet is an
  // unambiguous intent to sign in. We call verify() DIRECTLY with the live
  // context's silent signMessage instead of routing through runSignIn — that
  // path read a ref that could lag the unlock, bail, reopen the modal, and
  // leave the user stuck on "Sign to Enter". Gating on the reactive
  // purple.state means this re-fires the instant the unlock lands.
  useEffect(() => {
    if (wallet.wallet?.adapter?.name !== PURPLE_WALLET_NAME) return;
    if (!wallet.connected || !wallet.publicKey) {
      purpleAutoSignRef.current = null;
      return;
    }
    if (isVerified) return;
    const address = wallet.publicKey.toBase58();
    // Reset the one-shot guard whenever the wallet isn't unlocked, so a fresh
    // unlock always re-attempts (and a failed verify can be retried by
    // re-unlocking) without ever looping while unlocked + verified.
    if (purple.state !== "unlocked") {
      purpleAutoSignRef.current = null;
      return;
    }
    if (purple.address !== address) return;
    if (purpleAutoSignRef.current === address) return;
    if (purpleSignInFlightRef.current) return;

    purpleAutoSignRef.current = address;
    purpleSignInFlightRef.current = true;
    clearWatchdog();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSiwsPending(false);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsPending(true);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocalError(null);
    setError(null);
    setVisible(false);

    // Unlocking/creating the built-in wallet is an explicit intent to enter,
    // so route into /account once SIWS lands (handled by the redirect effect).
    enterIntentRef.current = true;
    const signMessage = purple.signMessage;
    void (async () => {
      try {
        await verify({ address, signMessage });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Sign-in failed.";
        setLocalError(msg);
        setError(msg);
        // Allow a retry on the next unlock/click.
        purpleAutoSignRef.current = null;
      } finally {
        purpleSignInFlightRef.current = false;
        setIsPending(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    wallet.connected,
    wallet.publicKey,
    wallet.wallet,
    isVerified,
    purple.state,
    purple.address,
    purple.signMessage,
    verify,
    setError,
    setVisible,
    clearWatchdog,
  ]);

  // Post-sign-in redirect. When the user explicitly chose to enter (clicked
  // "Enter Purple Club" / "Sign to Enter") and SIWS has now landed, route them
  // into their dashboard. Scoped to the public landing page so gated product
  // pages (/perks, /stay, /account) unlock in place without an extra hop.
  useEffect(() => {
    if (!isVerified || !enterIntentRef.current) return;
    enterIntentRef.current = false;
    if (pathname === "/") {
      router.push("/account");
    }
  }, [isVerified, pathname, router]);

  /**
   * Single entry point. Branches by environment:
   *
   *   - Already SIWS-verified → no-op.
   *   - Adapter attached + connected + publicKey → fire SIWS directly.
   *   - Inside a wallet's in-app browser → select the injected adapter
   *     and let the state machine handle connect + SIWS.
   *   - Mobile external browser → open the bottom-sheet picker that
   *     fires a `?walletAuth=` deep-link.
   *   - Adapter already selected but not yet connected (e.g. remembered
   *     from localStorage on a desktop reload) → skip the picker modal
   *     and let the state machine connect + SIWS. Without this guard the
   *     modal AND the extension popup both open simultaneously.
   *   - Desktop with no adapter selected → open the wallet-picker modal;
   *     the state machine fires SIWS once the user picks a wallet.
   */
  const enter = useCallback(async () => {
    setLocalError(null);
    // Explicit user intent to enter the club — remember it so we can route
    // into /account once SIWS completes (see the redirect effect below).
    enterIntentRef.current = true;
    if (isVerified) return;

    // Already fully connected — just sign.
    if (wallet.wallet?.adapter && wallet.publicKey) {
      const isPurple = wallet.wallet.adapter.name === PURPLE_WALLET_NAME;
      if (isPurple) {
        // Built-in wallet: verify DIRECTLY with the live context. No
        // runSignIn (which reads a possibly-stale ref and is gated by an
        // in-flight flag that can wedge the button into a no-op).
        const address = wallet.publicKey.toBase58();
        if (purple.state !== "unlocked" || purple.address !== address) {
          // Locked / auto-locked — prompt unlock. The auto-login effect signs
          // the moment the unlock lands.
          purple.openModal("unlock");
          return;
        }
        setIsPending(true);
        setError(null);
        try {
          await verify({ address, signMessage: purple.signMessage });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Sign-in failed.";
          setLocalError(msg);
          setError(msg);
        } finally {
          setIsPending(false);
        }
        return;
      }
      await runSignIn();
      return;
    }

    // Mobile: in-wallet WebView takes priority so the injected adapter
    // is selected before any other check.
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

    // Mobile external browser: deep-link picker.
    if (isMobileExternalBrowser()) {
      openPicker();
      return;
    }

    // Desktop: adapter already selected (remembered from a previous
    // session) but not yet connected. Arm the state machine and skip
    // opening the picker modal — otherwise the extension popup and the
    // modal both appear at the same time.
    if (wallet.wallet?.adapter) {
      setIsPending(true);
      setSiwsPending(true);
      armWatchdog();
      return;
    }

    // Desktop: no adapter attached yet, but a wallet was remembered from a
    // previous session. The Wallet Standard registration just hasn't landed
    // (common on a hard refresh while the extension is still booting). Arm the
    // state machine and wait — the connect effect re-fires the moment the
    // adapter re-attaches, so the FIRST click connects instead of no-opping
    // and forcing the user to refresh again.
    if (hasRememberedWallet()) {
      setIsPending(true);
      setSiwsPending(true);
      armWatchdog();
      return;
    }

    // Desktop: no adapter selected — show the picker so the user can
    // choose between installed extensions.
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
    purple,
    verify,
    setError,
  ]);

  return {
    isPending: isPending || siwsPending,
    error: localError,
    enter,
  };
}
