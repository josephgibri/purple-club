"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import bs58 from "bs58";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import type { WalletName } from "@solana/wallet-adapter-base";
import { isAndroidWebChrome, isInsideWalletBrowser } from "@/lib/device";
import {
  AndroidWalletPicker,
  WALLET_AUTH_PARAM,
} from "@/components/android-wallet-picker";

/**
 * Phantom adapter's `/ul/browse/` deep-link path is gated on iOS only
 * (isIosAndRedirectable). On Android Chrome the same code path is unreachable,
 * so the wallet modal silently routes the user through Mobile Wallet Adapter
 * — which caches account authorizations and is the root cause of "I switched
 * accounts in Phantom but the dapp keeps signing me in as the old wallet".
 *
 * We sidestep that by firing /ul/browse/ ourselves (via `AndroidWalletPicker`)
 * so the user lands inside Phantom's in-app browser, which always reflects
 * the wallet's currently selected account. No MWA token. No stale account.
 */

type SessionState = {
  authenticated: boolean;
  wallet?: string;
  isMaintainer?: boolean;
  isAdmin?: boolean;
  isAgent?: boolean;
  isFounder?: boolean;
  isPromoter?: boolean;
  pbtcBalance?: number;
  pbtcEligible?: boolean;
};

type SiwsInput = {
  domain?: string;
  address?: string;
  statement?: string;
  uri?: string;
  version?: string;
  chainId?: string;
  nonce?: string;
  issuedAt?: string;
};

type SiwsOutput = {
  account: { address: string; publicKey: Uint8Array };
  signedMessage: Uint8Array;
  signature: Uint8Array;
};

type SiwsAdapter = {
  name: string;
  signIn: (input: SiwsInput) => Promise<SiwsOutput>;
};

type LegacySignerAdapter = {
  name: string;
  publicKey: { toBase58: () => string } | null;
  connect: () => Promise<void>;
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
};

function shortAddress(address: string) {
  if (!address) return "";
  if (address.length <= 9) return address;
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

/**
 * Solana addresses are case-sensitive base58, so we compare raw strings.
 * Trims defensively because some adapters yield `publicKey.toBase58()` with
 * surrounding whitespace on certain mobile WebViews.
 */
function walletsMatch(a: string | null | undefined, b: string | null | undefined) {
  if (!a || !b) return false;
  return a.trim() === b.trim();
}

const PBTC_DISPLAY_DECIMALS = 9;

function formatPbtcBalance(balance: number) {
  if (!Number.isFinite(balance)) return "0";
  return balance.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: PBTC_DISPLAY_DECIMALS,
  });
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * On Android Chrome, the moment after Phantom (or any wallet app) returns
 * control to the tab via Mobile Wallet Adapter, Chrome's network stack can
 * be briefly unattached to the resumed tab. Any fetch issued in that
 * 200-800ms window throws `TypeError: Failed to fetch` immediately — the
 * request never even leaves the device. Retrying once or twice with a
 * small backoff lets the network layer reattach, which lets the verify
 * call go through. No-op on every other platform/flow because real
 * network errors fall through to the throw on the last attempt.
 */
async function fetchWithResumeRetry(
  url: string,
  init: RequestInit,
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await fetch(url, init);
    } catch (err) {
      lastError = err;
      const isResumeBlip =
        err instanceof TypeError &&
        typeof err.message === "string" &&
        /failed to fetch|networkerror|load failed/i.test(err.message);
      if (!isResumeBlip || attempt === 2) break;
      await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
    }
  }
  throw lastError ?? new Error("Network unavailable.");
}

function adapterSupportsSiws(adapter: unknown): adapter is SiwsAdapter {
  return (
    typeof adapter === "object" &&
    adapter !== null &&
    typeof (adapter as { signIn?: unknown }).signIn === "function"
  );
}

function adapterSupportsLegacy(adapter: unknown): adapter is LegacySignerAdapter {
  if (typeof adapter !== "object" || adapter === null) return false;
  const a = adapter as { signMessage?: unknown; connect?: unknown };
  return typeof a.signMessage === "function" && typeof a.connect === "function";
}

/**
 * Brave Wallet's Solana provider exposes transaction signing via
 * Wallet Standard but does not (reliably across versions) advertise
 * `solana:signMessage` or `solana:signIn`. Our SIWS / legacy guards
 * therefore reject it and the user gets a generic "can't sign
 * messages" toast which reads as "site is broken".
 *
 * We special-case the failure so we can show a friendlier recovery
 * card pointing the user at the Phantom extension (which works
 * perfectly inside Brave Browser). Match by adapter name — Brave's
 * Wallet Standard registration uses exactly "Brave Wallet" but we
 * keep a `includes` fallback in case they ever rename to
 * "Brave Solana Wallet" or similar.
 */
function isBraveAdapter(adapter: unknown): boolean {
  if (typeof adapter !== "object" || adapter === null) return false;
  const name = (adapter as { name?: unknown }).name;
  if (typeof name !== "string") return false;
  return /brave/i.test(name);
}

const PHANTOM_CHROME_STORE_URL =
  "https://chromewebstore.google.com/detail/phantom/bfnaelmomeimhlpmgjnjophhpkkoljpa";

export type MembershipPillProps = {
  autoPrompt?: boolean;
  onSessionChange?: (session: SessionState) => void;
  onAuthenticated?: (wallet: string) => void;
  compactOnMobile?: boolean;
};

export function MembershipPill({
  autoPrompt,
  onSessionChange,
  onAuthenticated,
  compactOnMobile = false,
}: MembershipPillProps) {
  const { publicKey, wallet, disconnect, select } = useWallet();
  const { setVisible } = useWalletModal();

  const clearWalletSelection = useCallback(() => {
    try {
      select(null);
    } catch {
    }
  }, [select]);

  const [session, setSession] = useState<SessionState>({ authenticated: false });
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [siwsPending, setSiwsPending] = useState(false);
  const [error, setError] = useState("");
  const [braveBlocked, setBraveBlocked] = useState(false);
  const [toast, setToast] = useState("");
  const [androidPickerOpen, setAndroidPickerOpen] = useState(false);

  const toastTimerRef = useRef<number | null>(null);
  const modalWaitTimerRef = useRef<number | null>(null);

  const flashToast = useCallback((message: string, ms = 4000) => {
    setToast(message);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToast("");
      toastTimerRef.current = null;
    }, ms);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      if (modalWaitTimerRef.current) window.clearTimeout(modalWaitTimerRef.current);
    };
  }, []);

  const onSessionChangeRef = useRef(onSessionChange);
  const onAuthenticatedRef = useRef(onAuthenticated);

  useEffect(() => {
    onSessionChangeRef.current = onSessionChange;
    onAuthenticatedRef.current = onAuthenticated;
  }, [onSessionChange, onAuthenticated]);

  const loadSession = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/wallet-auth/session");
      const data = (await response.json()) as SessionState;
      setSession(data);
      onSessionChangeRef.current?.(data);
      if (data.authenticated && data.wallet) {
        onAuthenticatedRef.current?.(data.wallet);
      }
    } catch {
      const empty: SessionState = { authenticated: false };
      setSession(empty);
      onSessionChangeRef.current?.(empty);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSession();
  }, [loadSession]);

  const runSiws = useCallback(
    async (adapter: SiwsAdapter, expectedAddress?: string | null) => {
      setSigningIn(true);
      setError("");
      try {
        const nonceRes = await fetch("/api/wallet-auth/nonce", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const nonceData = (await nonceRes.json()) as {
          nonce?: string;
          error?: string;
        };
        if (!nonceRes.ok || !nonceData.nonce) {
          throw new Error(nonceData.error ?? "Failed to initialize sign-in.");
        }

        const input: SiwsInput = {
          domain: window.location.host,
          statement: "Sign in to Purple Club",
          uri: window.location.origin,
          version: "1",
          chainId: "solana:mainnet",
          nonce: nonceData.nonce,
          issuedAt: new Date().toISOString(),
        };

        let output: SiwsOutput;
        try {
          output = await adapter.signIn(input);
        } catch (signErr) {
          const message =
            signErr instanceof Error ? signErr.message : String(signErr);
          if (/reject|denied|cancel|user/i.test(message)) {
            throw new Error("Sign-in rejected in wallet.");
          }
          throw new Error(
            "Sign-in failed in wallet. Please try Phantom or Solflare.",
          );
        }

        if (
          !output?.signedMessage ||
          !output?.signature ||
          !output?.account?.address
        ) {
          throw new Error("Wallet did not return a valid sign-in response.");
        }
        if (output.signature.length !== 64) {
          throw new Error("Invalid signature returned by wallet.");
        }

        // Account-mismatch guard. On Android Phantom MWA we have observed
        // the wallet returning a previously-authorized account even when the
        // user has switched the active account in Phantom. The signed message
        // is cryptographically valid for that other account, so the server
        // cheerfully attaches the wrong wallet to the session. We refuse the
        // sign-in if the wallet's currently-connected publicKey disagrees
        // with the SIWS signer, and prompt the user to reconnect cleanly.
        if (
          expectedAddress &&
          !walletsMatch(expectedAddress, output.account.address)
        ) {
          throw new Error(
            "Wallet returned a different account than the one connected. Open Phantom, switch to the wallet you want to use, then tap Verify Member again.",
          );
        }

        const verifyRes = await fetchWithResumeRetry("/api/wallet-auth/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            wallet: output.account.address,
            signedMessage: bytesToBase64(output.signedMessage),
            signature: bs58.encode(output.signature),
          }),
        });
        const verifyData = (await verifyRes.json()) as { error?: string };
        if (!verifyRes.ok) {
          throw new Error(verifyData.error ?? "Wallet verification failed.");
        }
        await loadSession();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Sign-in failed.");
        clearWalletSelection();
      } finally {
        setSigningIn(false);
      }
    },
    [loadSession, clearWalletSelection],
  );

  const runLegacy = useCallback(
    async (adapter: LegacySignerAdapter, expectedAddress?: string | null) => {
      setSigningIn(true);
      setError("");
      try {
        if (!adapter.publicKey) {
          try {
            await adapter.connect();
          } catch (connErr) {
            const message =
              connErr instanceof Error ? connErr.message : String(connErr);
            if (/reject|denied|cancel|user/i.test(message)) {
              throw new Error("Connection rejected in wallet.");
            }
            throw new Error(`Could not connect to ${adapter.name}.`);
          }
        }

        const walletAddress = adapter.publicKey?.toBase58();
        if (!walletAddress) {
          throw new Error(`${adapter.name} did not return a public key.`);
        }

        // Same account-mismatch guard as the SIWS path. Catches the case where
        // the wallet returns a stale/previously-authorized account.
        if (
          expectedAddress &&
          !walletsMatch(expectedAddress, walletAddress)
        ) {
          throw new Error(
            "Wallet returned a different account than the one connected. Open your wallet, switch accounts, then tap Verify Member again.",
          );
        }

        const nonceRes = await fetch("/api/wallet-auth/nonce", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ wallet: walletAddress }),
        });
        const nonceData = (await nonceRes.json()) as {
          nonce?: string;
          message?: string;
          error?: string;
        };
        if (!nonceRes.ok || !nonceData.nonce || !nonceData.message) {
          throw new Error(nonceData.error ?? "Failed to initialize sign-in.");
        }

        const messageBytes = new TextEncoder().encode(nonceData.message);
        let signatureBytes: Uint8Array;
        try {
          signatureBytes = await adapter.signMessage(messageBytes);
        } catch (signErr) {
          const message =
            signErr instanceof Error ? signErr.message : String(signErr);
          if (/reject|denied|cancel|user/i.test(message)) {
            throw new Error("Sign-in rejected in wallet.");
          }
          throw new Error(`Sign-in failed in ${adapter.name}.`);
        }

        if (signatureBytes.length !== 64) {
          throw new Error("Invalid signature returned by wallet.");
        }

        const verifyRes = await fetchWithResumeRetry("/api/wallet-auth/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            wallet: walletAddress,
            message: nonceData.message,
            signature: bs58.encode(signatureBytes),
          }),
        });
        const verifyData = (await verifyRes.json()) as { error?: string };
        if (!verifyRes.ok) {
          throw new Error(verifyData.error ?? "Wallet verification failed.");
        }
        await loadSession();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Sign-in failed.");
        clearWalletSelection();
      } finally {
        setSigningIn(false);
      }
    },
    [loadSession, clearWalletSelection],
  );

  const handleVerify = useCallback(() => {
    setError("");
    setBraveBlocked(false);
    const connectedAddress = publicKey?.toBase58() ?? null;

    // Android Chrome must always see the Phantom + Solflare bottom sheet
    // — including when an adapter is already "selected" (e.g. Solflare via
    // a prior MWA handshake). If we let the existing-adapter path fall
    // through here, members who installed the *other* wallet have no UI
    // affordance to pick it from inside the booking sheet, which is what
    // produced the "Open in Phantom isn't shown on the booking page" bug.
    // The check happens before SIWS/legacy so the dual choice is always
    // surfaced; inside-wallet WebViews short-circuit it because
    // `isAndroidWebChrome()` excludes them.
    if (isAndroidWebChrome()) {
      setAndroidPickerOpen(true);
      return;
    }

    if (wallet?.adapter && adapterSupportsSiws(wallet.adapter)) {
      void runSiws(wallet.adapter, connectedAddress);
      return;
    }
    if (wallet?.adapter && adapterSupportsLegacy(wallet.adapter)) {
      void runLegacy(wallet.adapter, connectedAddress);
      return;
    }

    // No wallet selected yet — open the standard wallet modal. On desktop
    // the user picks the extension; on iOS Safari the Phantom/Solflare
    // adapters fire their own universal link.
    setSiwsPending(true);
    setVisible(true);
    if (modalWaitTimerRef.current) {
      window.clearTimeout(modalWaitTimerRef.current);
    }
    // Generous timeout: mobile universal-link round-trips (Chrome -> Phantom
    // app -> Phantom in-app browser -> SIWS -> back) can legitimately take
    // 20-30s on slower devices. Desktop extension is much faster but extra
    // headroom is harmless.
    modalWaitTimerRef.current = window.setTimeout(() => {
      modalWaitTimerRef.current = null;
      setSiwsPending((current) => {
        if (!current) return current;
        flashToast(
          "Wallet didn't respond in time — try again or open this site in your wallet app.",
          6000,
        );
        return false;
      });
    }, 30000);
  }, [wallet, publicKey, runSiws, runLegacy, setVisible, flashToast]);

  useEffect(() => {
    if (!siwsPending) return;
    if (!wallet?.adapter) return;
    if (modalWaitTimerRef.current) {
      window.clearTimeout(modalWaitTimerRef.current);
      modalWaitTimerRef.current = null;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSiwsPending(false);
    // After the user picks a wallet in the modal (or after MWA returns),
    // pin the expected address to whatever the adapter says it just
    // connected as. The runSiws/runLegacy guard then refuses to attach
    // a session if the signed message disagrees.
    const expected = publicKey?.toBase58() ?? null;
    if (adapterSupportsSiws(wallet.adapter)) {
      void runSiws(wallet.adapter, expected);
    } else if (adapterSupportsLegacy(wallet.adapter)) {
      void runLegacy(wallet.adapter, expected);
    } else if (isBraveAdapter(wallet.adapter)) {
      // Brave Wallet doesn't (reliably) expose `solana:signMessage` or
      // `solana:signIn`. Surface a guided recovery card instead of the
      // generic toast — most Brave users just need to swap to the
      // Phantom extension which installs cleanly into Brave Browser.
      setBraveBlocked(true);
      clearWalletSelection();
    } else {
      setError(
        `${wallet.adapter.name} can't sign messages. Try Phantom or Solflare.`,
      );
      clearWalletSelection();
    }
  }, [siwsPending, wallet, publicKey, runSiws, runLegacy, clearWalletSelection]);

  // Auto-resume after Phantom / Solflare deep-link redirect. When the user
  // taps Phantom in the Android picker we redirect to /ul/browse/...
  // ?walletAuth=phantom — Phantom opens its in-app browser to that URL.
  // Inside the WebView, we detect the param, strip it from the URL, and
  // call select("Phantom") so the existing siwsPending effect picks up
  // the connection and fires SIWS automatically. One tap to verify.
  const walletAuthAttemptedRef = useRef(false);
  useEffect(() => {
    if (walletAuthAttemptedRef.current) return;
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const flag = url.searchParams.get(WALLET_AUTH_PARAM);
    if (!flag) return;
    walletAuthAttemptedRef.current = true;
    url.searchParams.delete(WALLET_AUTH_PARAM);
    window.history.replaceState({}, "", url.toString());
    if (!isInsideWalletBrowser()) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSiwsPending(true);

    // Mirror the modal-path watchdog: if `select()` fails or the adapter
    // never reattaches inside Phantom's WebView, siwsPending would otherwise
    // stay true forever, leaving Verify Member permanently disabled and the
    // drift watchdog blocked. After 30s without progress we surface a toast
    // and unstick the state so the user can retry.
    if (modalWaitTimerRef.current) {
      window.clearTimeout(modalWaitTimerRef.current);
    }
    modalWaitTimerRef.current = window.setTimeout(() => {
      modalWaitTimerRef.current = null;
      setSiwsPending((current) => {
        if (!current) return current;
        flashToast(
          "Couldn't reach your wallet — open Phantom and tap Verify Member again.",
          6000,
        );
        return false;
      });
    }, 30000);

    if (flag === "phantom") {
      try {
        select("Phantom" as WalletName<"Phantom">);
      } catch {
      }
    } else if (flag === "solflare") {
      try {
        select("Solflare" as WalletName<"Solflare">);
      } catch {
      }
    }
  }, [select, flashToast]);

  const wasConnectedRef = useRef(false);
  useEffect(() => {
    if (publicKey) {
      wasConnectedRef.current = true;
      return;
    }
    if (
      !publicKey &&
      wasConnectedRef.current &&
      session.authenticated &&
      !loading
    ) {
      wasConnectedRef.current = false;
      void (async () => {
        await fetch("/api/wallet-auth/logout", { method: "POST" });
        await loadSession();
      })();
    }
  }, [publicKey, session.authenticated, loading, loadSession]);

  /**
   * Account-drift watchdog. If the wallet adapter's currently-connected
   * publicKey ever stops matching the wallet our server-side session was
   * minted for, we force a logout and a fresh sign-in. This catches:
   *  - User switches accounts inside Phantom while the page is open.
   *  - Phantom MWA on Android quietly re-authorizes a different account on a
   *    later connect than the one currently bound to the session cookie.
   * Without this we'd silently keep displaying the old wallet's PBTC
   * balance and attribute new actions to the wrong identity.
   */
  useEffect(() => {
    if (loading) return;
    if (signingIn || siwsPending) return;
    if (!session.authenticated || !session.wallet) return;
    if (!publicKey) return;
    const connectedAddress = publicKey.toBase58();
    if (walletsMatch(connectedAddress, session.wallet)) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    flashToast(
      "Wallet changed — please verify again with the new account.",
      6000,
    );
    void (async () => {
      await fetch("/api/wallet-auth/logout", { method: "POST" });
      try {
        await disconnect();
      } catch {
      }
      clearWalletSelection();
      wasConnectedRef.current = false;
      await loadSession();
    })();
  }, [
    publicKey,
    session.authenticated,
    session.wallet,
    loading,
    signingIn,
    siwsPending,
    disconnect,
    clearWalletSelection,
    loadSession,
    flashToast,
  ]);

  const logout = useCallback(async () => {
    await fetch("/api/wallet-auth/logout", { method: "POST" });
    try {
      await disconnect();
    } catch {
    }
    clearWalletSelection();
    wasConnectedRef.current = false;
    await loadSession();
  }, [disconnect, clearWalletSelection, loadSession]);

  useEffect(() => {
    if (!autoPrompt) return;
    if (loading) return;
    // Bail as soon as the wallet is authenticated, regardless of PBTC
    // eligibility. Re-prompting an ineligible-but-signed-in user would
    // pop the wallet modal again every time the modal-wait watchdog
    // expires (~30s loop) — and a fresh signature can't change their
    // PBTC balance anyway. The pill already shows an "Insufficient PBTC"
    // badge so they can act on it deliberately.
    if (session.authenticated) return;
    if (signingIn) return;
    if (siwsPending) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    handleVerify();
  }, [
    autoPrompt,
    loading,
    session.authenticated,
    signingIn,
    siwsPending,
    handleVerify,
  ]);

  /**
   * External "verify" trigger for surfaces that aren't the pill itself —
   * e.g. the OnboardingSteps stepper on /claim and /invite pages dispatches
   * `purplestay:verify-wallet` so the same Android picker / SIWS / error
   * state machine fires. Keeps the pill as the single owner of wallet-auth
   * UI without forcing each surface to replicate the SIWS dance.
   */
  useEffect(() => {
    const onExternalVerify = () => {
      if (signingIn || siwsPending) return;
      if (session.authenticated && session.pbtcEligible) return;
      handleVerify();
    };
    window.addEventListener("purplestay:verify-wallet", onExternalVerify);
    return () => {
      window.removeEventListener("purplestay:verify-wallet", onExternalVerify);
    };
  }, [
    handleVerify,
    signingIn,
    siwsPending,
    session.authenticated,
    session.pbtcEligible,
  ]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60 backdrop-blur-md">
        <span className="h-2 w-2 animate-pulse rounded-full bg-white/40" />
        Checking wallet…
      </div>
    );
  }

  if (!session.authenticated) {
    const isBusy = signingIn || siwsPending;
    return (
      <>
        <div className="flex flex-col items-end gap-1.5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleVerify}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-full border border-[#EAB308]/60 bg-[#EAB308]/10 px-4 py-2 text-xs font-semibold text-[#FDE68A] hover:bg-[#EAB308]/20 disabled:opacity-60 sm:min-h-0 sm:py-1.5"
              disabled={isBusy}
            >
              <span className="text-sm">🛡</span>
              {isBusy ? "Signing in…" : "Verify Member"}
            </button>
            {error && !braveBlocked ? (
              <span
                className="max-w-[220px] truncate text-xs text-red-300"
                title={error}
              >
                {error}
              </span>
            ) : null}
          </div>
          {braveBlocked ? (
            // Recovery card for Brave Wallet users. Brave Wallet's Solana
            // provider doesn't expose message signing, so SIWS / legacy
            // sign-in cannot complete. We don't say "broken" — we explain
            // the gap and route them to the Phantom extension, which
            // installs cleanly inside Brave Browser and signs in normally.
            <div className="w-full max-w-[320px] rounded-2xl border border-[#EAB308]/35 bg-[#1A1033]/95 p-3 text-left shadow-[0_8px_30px_rgba(0,0,0,0.45)]">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#FDE68A]">
                  Brave Wallet · sign-in not supported
                </p>
                <button
                  type="button"
                  onClick={() => setBraveBlocked(false)}
                  aria-label="Dismiss"
                  className="text-white/45 hover:text-white"
                >
                  ×
                </button>
              </div>
              <p className="mt-1.5 text-[12px] leading-relaxed text-white/75">
                Brave Wallet on Solana doesn&apos;t support our sign-in
                standard yet. Install Phantom for Brave (one click) and
                tap Verify Member again.
              </p>
              <a
                href={PHANTOM_CHROME_STORE_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-[#EAB308]/45 bg-[#EAB308]/15 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-[#FDE68A] hover:bg-[#EAB308]/25"
              >
                Install Phantom for Brave →
              </a>
              <p className="mt-2 text-[10px] text-white/45">
                Phantom installs into Brave like any Chrome extension.
                Already have it? Disable Brave Wallet&apos;s Solana
                support in <span className="font-mono">brave://settings/wallet</span>
                {" "}and reload.
              </p>
            </div>
          ) : null}
          {toast ? (
            <span className="max-w-[260px] rounded-full border border-[#EAB308]/40 bg-[#1A1033]/90 px-3 py-1 text-[11px] text-[#FDE68A] shadow-lg">
              {toast}
            </span>
          ) : null}
        </div>
        <AndroidWalletPicker
          open={androidPickerOpen}
          onClose={() => setAndroidPickerOpen(false)}
        />
      </>
    );
  }

  const balance =
    typeof session.pbtcBalance === "number" ? session.pbtcBalance : 0;
  const eligible = Boolean(session.pbtcEligible);
  const verifiedLabel = eligible
    ? compactOnMobile
      ? "Verified"
      : "Verified Member"
    : "Insufficient PBTC";
  const sessionAddress = shortAddress(session.wallet ?? "");

  return (
    <div className="flex items-center gap-2">
      <div
        className={`flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] backdrop-blur-md transition sm:gap-3 sm:px-3 sm:py-1.5 sm:text-xs ${
          eligible
            ? "border-[#EAB308]/50 bg-[#1A1033]/70 text-[#FDE68A] shadow-[0_0_24px_rgba(234,179,8,0.18)]"
            : "border-red-400/40 bg-red-500/10 text-red-200"
        }`}
      >
        <span className="flex items-center gap-1.5">
          <span className="text-[14px]">🔥</span>
          <span className="font-semibold tabular-nums text-white">
            {formatPbtcBalance(balance)}
          </span>
          <span className="text-white/55">PBTC</span>
        </span>
        {sessionAddress ? (
          <>
            <span className="h-4 w-px bg-white/15" />
            <span
              className="font-mono text-[10px] text-white/70 sm:text-[11px]"
              title={`Signed in as ${session.wallet ?? ""}`}
            >
              {sessionAddress}
            </span>
            <span className="h-4 w-px bg-white/15" />
          </>
        ) : null}
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${
            eligible
              ? "bg-[#EAB308]/15 text-[#FDE047]"
              : "bg-red-500/15 text-red-200"
          }`}
        >
          <span>🛡</span>
          {verifiedLabel}
        </span>
      </div>
      <button
        type="button"
        onClick={() => void logout()}
        className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-full border border-white/10 px-2 py-1 text-[10px] text-white/50 hover:text-white/80 sm:min-h-0 sm:min-w-0"
        title="Disconnect wallet"
        aria-label="Disconnect wallet"
      >
        <span className="hidden sm:inline">Disconnect</span>
        <span className="text-base leading-none sm:hidden">×</span>
      </button>
    </div>
  );
}
