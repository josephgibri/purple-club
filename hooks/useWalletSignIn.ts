"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useCallback, useEffect, useRef, useState } from "react";

import { useWalletAuth } from "@/hooks/useWalletAuth";

type SignInState = {
  isPending: boolean;
  error: string | null;
  enter: () => Promise<void>;
};

export function useWalletSignIn(): SignInState {
  const { wallet, connected, connect } = useWallet();
  const { setVisible } = useWalletModal();
  const { isVerified, verify, setError } = useWalletAuth();

  const [isPending, setIsPending] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const pendingRef = useRef(false);

  const runSignIn = useCallback(async () => {
    const adapter = wallet?.adapter;
    if (!adapter) return;

    setLocalError(null);
    setError(null);
    setIsPending(true);

    try {
      if (!connected) {
        await connect();
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
    } finally {
      pendingRef.current = false;
      setIsPending(false);
    }
  }, [wallet, connect, connected, verify, setError]);

  useEffect(() => {
    if (!pendingRef.current) return;
    if (!wallet?.adapter) return;
    if (isVerified) {
      pendingRef.current = false;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsPending(false);
      return;
    }
    void runSignIn();
  }, [wallet, isVerified, runSignIn]);

  const enter = useCallback(async () => {
    setLocalError(null);
    if (isVerified) return;

    if (!wallet?.adapter) {
      pendingRef.current = true;
      setIsPending(true);
      setVisible(true);
      return;
    }

    await runSignIn();
  }, [wallet, isVerified, setVisible, runSignIn]);

  return {
    isPending,
    error: localError,
    enter,
  };
}
