"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useCallback, useEffect, useState } from "react";

import { useWalletAuth } from "@/hooks/useWalletAuth";
import { getPbtcBalanceWithFallback } from "@/lib/solana";

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
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourceRpc, setSourceRpc] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!publicKey || !connected) {
      setBalance(0);
      setError(null);
      setSourceRpc(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await getPbtcBalanceWithFallback(publicKey);
      setBalance(result.uiAmount);
      setSourceRpc(result.endpoint);
    } catch (value) {
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
