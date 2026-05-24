"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useWalletAuth } from "@/hooks/useWalletAuth";

/**
 * `usePassToken` is the bridge between the on-device wallet proof and the
 * server-signed pass JWT that's embedded in the QR code.
 *
 * It only fires while the parent surface (modal, /pass page) declares it's
 * active via `enabled`. The token has a 90s TTL and we proactively re-mint
 * ~10s before expiry so the QR never goes stale mid-scan. Disabling the
 * hook releases the timer; the cached token survives until it expires so
 * re-opening the pass shortly after closing it doesn't trigger another
 * RPC round-trip.
 */

type PassTokenState = {
  url: string | null;
  expiresAt: number | null;
  isMinting: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const REFRESH_LEAD_MS = 10_000;

export function usePassToken({
  enabled,
  origin,
}: {
  enabled: boolean;
  origin?: string;
}): PassTokenState {
  const { proof, isVerified } = useWalletAuth();
  const [token, setToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [isMinting, setIsMinting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  const mint = useCallback(async () => {
    if (!proof || !isVerified) {
      setError("Wallet not verified.");
      return;
    }
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setIsMinting(true);
    setError(null);
    try {
      const res = await fetch("/api/pass/mint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicKey: proof.publicKey,
          message: proof.message,
          signature: proof.signature,
        }),
      });
      const data = (await res.json()) as
        | { token: string; expiresAt: number }
        | { error: string };
      if (!res.ok || !("token" in data)) {
        setToken(null);
        setExpiresAt(null);
        setError("error" in data ? data.error : "Could not mint pass.");
        return;
      }
      setToken(data.token);
      setExpiresAt(data.expiresAt);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Could not mint pass.");
    } finally {
      inFlightRef.current = false;
      setIsMinting(false);
    }
  }, [proof, isVerified]);

  // Mint immediately when the surface goes active and we have a fresh proof.
  useEffect(() => {
    if (!enabled) return;
    if (!isVerified || !proof) return;
    if (token && expiresAt && expiresAt - Date.now() > REFRESH_LEAD_MS) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void mint();
  }, [enabled, isVerified, proof, token, expiresAt, mint]);

  // Auto-refresh shortly before expiry while the surface stays active.
  useEffect(() => {
    if (!enabled || !expiresAt) return;
    const wait = Math.max(expiresAt - Date.now() - REFRESH_LEAD_MS, 0);
    const timer = window.setTimeout(() => {
      void mint();
    }, wait);
    return () => window.clearTimeout(timer);
  }, [enabled, expiresAt, mint]);

  const url = (() => {
    if (!token) return null;
    const base =
      origin ?? (typeof window !== "undefined" ? window.location.origin : "");
    if (!base) return null;
    const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").trim();
    const root = `${base.replace(/\/+$/, "")}${basePath}`;
    return `${root}/verify?t=${encodeURIComponent(token)}`;
  })();

  return {
    url,
    expiresAt,
    isMinting,
    error,
    refresh: mint,
  };
}
