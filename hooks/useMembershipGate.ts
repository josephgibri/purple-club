"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useCallback, useEffect, useState } from "react";

import { useWalletAuth } from "@/hooks/useWalletAuth";

type MembershipGateState = {
  balance: number;
  hasPbtc: boolean;
  isVerified: boolean;
  isMember: boolean;
  isLoading: boolean;
  isSigning: boolean;
  error: string | null;
  authError: string | null;
  sourceRpc: string | null;
  signaturePrefix: string | null;
  signedAtIso: string | null;
  refresh: () => Promise<void>;
  verifyOwnership: () => Promise<void>;
};

export function useMembershipGate(): MembershipGateState {
  const { publicKey, connected } = useWallet();
  const { isVerified, isSigning, error: authError, proof, verify } = useWalletAuth();
  const [balance, setBalance] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sourceRpc, setSourceRpc] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!publicKey || !connected) {
      setBalance(0);
      setError(null);
      setSourceRpc(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || "").trim().replace(/\/$/, "");
      const response = await fetch(
        `${basePath}/api/pbtc/balance?wallet=${encodeURIComponent(publicKey.toBase58())}`,
        { cache: "no-store" },
      );
      const body = (await response.json().catch(() => null)) as { balance?: unknown; error?: unknown } | null;
      if (!response.ok || typeof body?.balance !== "number") {
        const message = typeof body?.error === "string" ? body.error : "PBTC balance read failed.";
        throw new Error(message);
      }
      setBalance(body.balance);
      setSourceRpc("api");
    } catch (value) {
      setBalance(0);
      setError(value instanceof Error ? value.message : "RPC balance check failed");
    } finally {
      setIsLoading(false);
    }
  }, [connected, publicKey]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const hasPbtc = balance >= 1;
  const isMember = hasPbtc && isVerified;
  const signaturePrefix =
    proof && isVerified ? `${proof.signature.slice(0, 8)}…${proof.signature.slice(-4)}` : null;
  const signedAtIso =
    proof && isVerified ? new Date(proof.issuedAt).toISOString() : null;

  return {
    balance,
    hasPbtc,
    isVerified,
    isMember,
    isLoading,
    isSigning,
    error,
    authError,
    sourceRpc,
    signaturePrefix,
    signedAtIso,
    refresh,
    verifyOwnership: verify,
  };
}
