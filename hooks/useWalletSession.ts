"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

import { useWalletAuth } from "@/hooks/useWalletAuth";

/**
 * Read-only view of the server `pc_session` cookie minted by the global
 * Purple Club auth (TopNav). This replaces the per-page PurpleHeader, which
 * used to both render a (now duplicate) wallet header AND report session via
 * `onSessionChange`. Pages that only need to know "who is this wallet" call
 * this hook instead.
 *
 * Re-fetches when the wallet connects / re-verifies; a single delayed retry
 * absorbs the race where the cookie is still being minted by the SIWS proof
 * sync immediately after signing.
 */
export type WalletSession = {
  authenticated: boolean;
  wallet?: string;
  pbtcBalance?: number;
  pbtcEligible?: boolean;
  isAgent?: boolean;
  isFounder?: boolean;
  isConcierge?: boolean;
  isPerksAdmin?: boolean;
  isPromoter?: boolean;
  // Back-compat aliases for the ported PurpleStay surfaces:
  //   isMaintainer — any concierge/agent/founder operator
  //   isAdmin      — concierge-desk access (agent or founder)
  isMaintainer?: boolean;
  isAdmin?: boolean;
};

const LOGGED_OUT: WalletSession = { authenticated: false };

// The server `pc_session` cookie is minted asynchronously right after the
// SIWS proof is written (fire-and-forget POST /api/wallet-auth/verify). On a
// fresh sign-in our first /session read can therefore land before the cookie
// exists. We poll a few times with backoff so role-gated UI (e.g. the founder
// Operator console) appears without a manual refresh + re-sign-in.
const RETRY_DELAYS_MS = [600, 1200, 2000, 3000];

export function useWalletSession(): WalletSession {
  const { connected, publicKey } = useWallet();
  const { isVerified } = useWalletAuth();
  const [session, setSession] = useState<WalletSession>(LOGGED_OUT);

  useEffect(() => {
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    async function load(): Promise<boolean> {
      if (!connected || !publicKey) {
        if (!cancelled) setSession(LOGGED_OUT);
        return true;
      }
      try {
        const res = await fetch("/api/wallet-auth/session", { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return true;
        if (data?.authenticated) {
          setSession({
            authenticated: true,
            wallet: data.wallet,
            pbtcBalance: data.pbtcBalance,
            pbtcEligible: data.pbtcEligible,
            isAgent: data.isAgent,
            isFounder: data.isFounder,
            isConcierge: data.isConcierge,
            isPerksAdmin: data.isPerksAdmin,
            isPromoter: data.isPromoter,
            isMaintainer: Boolean(
              data.isAgent || data.isFounder || data.isConcierge,
            ),
            isAdmin: Boolean(data.isConcierge || data.isFounder),
          });
          return true;
        }
        setSession(LOGGED_OUT);
        return false;
      } catch {
        if (!cancelled) setSession(LOGGED_OUT);
        return true;
      }
    }

    function scheduleRetries() {
      // Only worth retrying when the client proof exists but the server
      // cookie hasn't caught up yet. Each retry re-checks; once authenticated
      // load() returns true and no further timers fire (they no-op via the
      // cancelled guard, but we also stop scheduling new ones).
      for (const delay of RETRY_DELAYS_MS) {
        const t = setTimeout(() => {
          if (cancelled) return;
          void load();
        }, delay);
        timers.push(t);
      }
    }

    void load().then((settled) => {
      if (!settled && !cancelled && isVerified) {
        scheduleRetries();
      }
    });

    return () => {
      cancelled = true;
      timers.forEach((t) => clearTimeout(t));
    };
  }, [connected, publicKey, isVerified]);

  return session;
}
