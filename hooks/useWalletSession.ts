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

export function useWalletSession(): WalletSession {
  const { connected, publicKey } = useWallet();
  const { isVerified } = useWalletAuth();
  const [session, setSession] = useState<WalletSession>(LOGGED_OUT);

  useEffect(() => {
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | undefined;

    async function load(): Promise<boolean> {
      if (!connected || !publicKey) {
        if (!cancelled) setSession(LOGGED_OUT);
        return true;
      }
      try {
        const res = await fetch("/api/wallet-auth/session");
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

    void load().then((settled) => {
      if (!settled && !cancelled && isVerified) {
        retry = setTimeout(() => void load(), 1200);
      }
    });

    return () => {
      cancelled = true;
      if (retry) clearTimeout(retry);
    };
  }, [connected, publicKey, isVerified]);

  return session;
}
