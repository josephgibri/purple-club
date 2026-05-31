"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import bs58 from "bs58";
import { useCallback, useEffect, useState } from "react";
import nacl from "tweetnacl";

const SESSION_KEY_PREFIX = "pc_auth:";
const DOMAIN = "purpleclub.org";
const PROOF_TTL_MS = 24 * 60 * 60 * 1000;
const PROOF_EVENT = "pc:auth:updated";

type Proof = {
  publicKey: string;
  message: string;
  signature: string;
  issuedAt: number;
  expiresAt: number;
};

type WalletAuthState = {
  isVerified: boolean;
  isSigning: boolean;
  error: string | null;
  proof: Proof | null;
  verify: () => Promise<void>;
  clear: () => void;
  setError: (value: string | null) => void;
};

function buildMessage(publicKey: string, nonce: string, issuedAt: number): string {
  const iso = new Date(issuedAt).toISOString();
  return [
    `${DOMAIN} wants you to prove ownership of your Solana wallet.`,
    "",
    `Wallet: ${publicKey}`,
    `Nonce: ${nonce}`,
    `Issued: ${iso}`,
    "",
    "Signing this message is free, does not move any funds,",
    "and is used only to verify this wallet belongs to you.",
  ].join("\n");
}

function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function readStoredProof(publicKey: string): Proof | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY_PREFIX + publicKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Proof;
    if (parsed.publicKey !== publicKey) return null;
    if (parsed.expiresAt < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredProof(proof: Proof): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(SESSION_KEY_PREFIX + proof.publicKey, JSON.stringify(proof));
  window.dispatchEvent(
    new CustomEvent(PROOF_EVENT, { detail: { publicKey: proof.publicKey } }),
  );
}

function clearStoredProof(publicKey: string): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(SESSION_KEY_PREFIX + publicKey);
  window.dispatchEvent(
    new CustomEvent(PROOF_EVENT, { detail: { publicKey } }),
  );
}

export function useWalletAuth(): WalletAuthState {
  const { publicKey, connected, signMessage } = useWallet();
  const [proof, setProof] = useState<Proof | null>(null);
  const [isSigning, setIsSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!publicKey || !connected) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProof(null);
      setError(null);
      return;
    }
    const address = publicKey.toBase58();
    setProof(readStoredProof(address));

    function onProofChange(e: Event) {
      const detail = (e as CustomEvent<{ publicKey?: string }>).detail;
      if (detail?.publicKey && detail.publicKey !== address) return;
      setProof(readStoredProof(address));
    }

    window.addEventListener(PROOF_EVENT, onProofChange);
    return () => window.removeEventListener(PROOF_EVENT, onProofChange);
  }, [publicKey, connected]);

  const verify = useCallback(async () => {
    setError(null);

    if (!publicKey || !connected) {
      setError("Connect your wallet first.");
      return;
    }
    if (!signMessage) {
      setError("This wallet does not support message signing.");
      return;
    }

    setIsSigning(true);
    try {
      const pubkeyStr = publicKey.toBase58();
      const nonce = generateNonce();
      const issuedAt = Date.now();
      const message = buildMessage(pubkeyStr, nonce, issuedAt);
      const encoded = new TextEncoder().encode(message);

      const signature = await signMessage(encoded);

      const valid = nacl.sign.detached.verify(
        encoded,
        signature,
        publicKey.toBytes(),
      );

      if (!valid) {
        throw new Error("Signature verification failed.");
      }

      const verified: Proof = {
        publicKey: pubkeyStr,
        message,
        signature: bs58.encode(signature),
        issuedAt,
        expiresAt: issuedAt + PROOF_TTL_MS,
      };

      writeStoredProof(verified);
      setProof(verified);
    } catch (value) {
      const msg =
        value instanceof Error
          ? value.message.includes("User rejected")
            ? "Signature declined."
            : value.message
          : "Signature failed.";
      setError(msg);
    } finally {
      setIsSigning(false);
    }
  }, [publicKey, connected, signMessage]);

  const clear = useCallback(() => {
    if (publicKey) clearStoredProof(publicKey.toBase58());
    setProof(null);
    setError(null);
  }, [publicKey]);

  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const isVerified = Boolean(
    proof &&
      publicKey &&
      proof.publicKey === publicKey.toBase58() &&
      proof.expiresAt > now,
  );

  return {
    isVerified,
    isSigning,
    error,
    proof,
    verify,
    clear,
    setError,
  };
}
