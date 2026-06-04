"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
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

/**
 * Optional direct-signer override for `verify()`. Lets a caller (e.g. the
 * built-in Purple Wallet) produce the SIWS signature with its own in-memory
 * keypair instead of going through the wallet-adapter `signMessage` plumbing,
 * which can silently no-op when the standard-wallet bridge isn't ready. The
 * address must match the currently connected adapter so `isVerified` resolves.
 */
type SignOverride = {
  address: string;
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
};

type WalletAuthState = {
  isVerified: boolean;
  isSigning: boolean;
  error: string | null;
  proof: Proof | null;
  verify: (override?: SignOverride) => Promise<void>;
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

// Bridge the client proof into the server `pc_session` cookie used by the
// travel / gifts / admin APIs. Fire-and-forget: the client-side gate does
// not depend on this, it only powers server routes.
function syncServerSession(proof: Proof): void {
  if (typeof window === "undefined") return;
  void fetch("/api/wallet-auth/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      publicKey: proof.publicKey,
      message: proof.message,
      signature: proof.signature,
      issuedAt: proof.issuedAt,
    }),
  }).catch(() => {});
}

function endServerSession(): void {
  if (typeof window === "undefined") return;
  void fetch("/api/wallet-auth/logout", { method: "POST" }).catch(() => {});
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
    const stored = readStoredProof(address);
    setProof(stored);
    // Re-establish the server cookie from a still-valid stored proof after a
    // reload, so the travel/admin APIs stay authenticated without re-signing.
    if (stored) syncServerSession(stored);

    function onProofChange(e: Event) {
      const detail = (e as CustomEvent<{ publicKey?: string }>).detail;
      if (detail?.publicKey && detail.publicKey !== address) return;
      setProof(readStoredProof(address));
    }

    window.addEventListener(PROOF_EVENT, onProofChange);
    return () => window.removeEventListener(PROOF_EVENT, onProofChange);
  }, [publicKey, connected]);

  const verify = useCallback(async (override?: SignOverride) => {
    setError(null);

    // Resolve the signer + address. With an override (Purple Wallet) we sign
    // with the in-memory keypair directly and don't require the adapter's
    // signMessage; we still need the connected adapter's publicKey to match
    // so the stored proof lines up with `isVerified`.
    const signFn = override?.signMessage ?? signMessage;
    const pubkeyStr = override?.address ?? publicKey?.toBase58() ?? null;

    if (!pubkeyStr || (!override && (!publicKey || !connected))) {
      setError("Connect your wallet first.");
      return;
    }
    if (!signFn) {
      setError("This wallet does not support message signing.");
      return;
    }

    const pubkeyBytes = override
      ? new PublicKey(override.address).toBytes()
      : publicKey!.toBytes();

    setIsSigning(true);
    try {
      const nonce = generateNonce();
      const issuedAt = Date.now();
      const message = buildMessage(pubkeyStr, nonce, issuedAt);
      const encoded = new TextEncoder().encode(message);

      const signature = await signFn(encoded);

      const valid = nacl.sign.detached.verify(
        encoded,
        signature,
        pubkeyBytes,
      );

      console.warn("[PurpleAuth] verify", {
        usedOverride: Boolean(override),
        pubkeyStr,
        sigLen: signature?.length,
        valid,
      });

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
      syncServerSession(verified);
      console.warn("[PurpleAuth] proof written + setProof for", pubkeyStr);
    } catch (value) {
      const msg =
        value instanceof Error
          ? value.message.includes("User rejected")
            ? "Signature declined."
            : value.message
          : "Signature failed.";
      console.warn("[PurpleAuth] verify failed:", msg);
      setError(msg);
    } finally {
      setIsSigning(false);
    }
  }, [publicKey, connected, signMessage]);

  const clear = useCallback(() => {
    if (publicKey) clearStoredProof(publicKey.toBase58());
    setProof(null);
    setError(null);
    endServerSession();
  }, [publicKey]);

  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const isVerified = Boolean(
    proof &&
      publicKey &&
      proof.publicKey === publicKey.toBase58() &&
      proof.expiresAt > now,
  );

  useEffect(() => {
    console.warn("[PurpleAuth] state", {
      adapterPubkey: publicKey?.toBase58() ?? null,
      connected,
      proofPubkey: proof?.publicKey ?? null,
      proofMatches: proof && publicKey ? proof.publicKey === publicKey.toBase58() : null,
      isVerified,
    });
  }, [publicKey, connected, proof, isVerified]);

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
