import crypto from "node:crypto";
import { cookies } from "next/headers";
import { Connection, PublicKey } from "@solana/web3.js";
import { parseSignInMessage } from "@solana/wallet-standard-util";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { getRpcUrl } from "./pbtc";

const NONCE_COOKIE = "pc_auth_nonce";

// Server-side wallet session for the travel / gifts / admin APIs. Purple
// Club already proves wallet ownership client-side (see hooks/useWalletAuth.ts)
// with a single SIWS-style signature. The /api/wallet-auth/verify route
// re-verifies that exact proof on the server and mints this HMAC cookie so
// server routes can trust `readSession().wallet` without re-signing.

const SESSION_COOKIE = "pc_session";
const PROOF_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const PROOF_DOMAIN = "purpleclub.org";

export type SessionData = {
  wallet: string;
  pbtcBalance: number;
  issuedAt: string;
};

function getSessionSecret(): Buffer | null {
  const raw = process.env.SESSION_SECRET?.trim();
  if (!raw || raw.length < 16) {
    return null;
  }
  return Buffer.from(raw, "utf8");
}

function signPayload(payloadB64: string, secret: Buffer): string {
  return crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url");
}

function verifySignature(payloadB64: string, signature: string, secret: Buffer): boolean {
  const expected = signPayload(payloadB64, secret);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export type ClubProof = {
  publicKey: string;
  message: string;
  signature: string;
  issuedAt: number;
};

/**
 * Verifies the client proof minted by useWalletAuth.ts. The browser signs a
 * fixed-format message; here we re-verify the nacl signature over that exact
 * message and sanity-check the domain, wallet binding, and freshness.
 */
export function verifyClubProof(proof: ClubProof): boolean {
  try {
    if (
      typeof proof?.publicKey !== "string" ||
      typeof proof?.message !== "string" ||
      typeof proof?.signature !== "string" ||
      typeof proof?.issuedAt !== "number"
    ) {
      return false;
    }

    // Freshness: reject proofs older than the proof TTL or from the future.
    const age = Date.now() - proof.issuedAt;
    if (!Number.isFinite(age) || age < -60_000 || age > PROOF_MAX_AGE_MS) {
      return false;
    }

    // Domain + wallet binding must be present in the signed message so a
    // signature captured for another site cannot be replayed here.
    if (!proof.message.includes(`${PROOF_DOMAIN} wants you to prove`)) return false;
    if (!proof.message.includes(`Wallet: ${proof.publicKey}`)) return false;

    const messageBytes = new TextEncoder().encode(proof.message);
    const signatureBytes = bs58.decode(proof.signature);
    if (signatureBytes.length !== 64) return false;
    const publicKeyBytes = new PublicKey(proof.publicKey).toBytes();
    return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
  } catch {
    return false;
  }
}

/**
 * Reads a wallet's live PBTC balance directly from chain. Ported from
 * Purple Club so gift / invite routes can re-verify holdings at claim time
 * instead of trusting the cookie snapshot. Uses PBTC_MINT + the shared RPC.
 */
export async function getPbtcBalance(wallet: string): Promise<number> {
  const mintAddress = process.env.PBTC_MINT;
  if (!mintAddress) {
    throw new Error("PBTC_MINT is not configured.");
  }

  const connection = new Connection(getRpcUrl(), "confirmed");
  const owner = new PublicKey(wallet);
  const mint = new PublicKey(mintAddress);

  const response = await connection.getParsedTokenAccountsByOwner(owner, { mint });

  return response.value.reduce((sum, account) => {
    const amount =
      account.account.data.parsed.info.tokenAmount.uiAmount ??
      Number(account.account.data.parsed.info.tokenAmount.amount ?? 0);
    return sum + amount;
  }, 0);
}

// ---------------------------------------------------------------------------
// Server-issued nonce + SIWS verification (ported from Purple Club). Powers the
// MembershipPill connect flow for users who land directly on a hotels page
// without first signing in through Purple Club's client gate.
// ---------------------------------------------------------------------------

export function buildSigninMessage(wallet: string, nonce: string) {
  return `Sign in to Purple Club\nWallet: ${wallet}\nNonce: ${nonce}`;
}

export function generateNonce() {
  return crypto.randomBytes(16).toString("hex");
}

export async function setNonceCookie(wallet: string | null, nonce: string) {
  const store = await cookies();
  store.set(NONCE_COOKIE, JSON.stringify({ wallet, nonce }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 10 * 60,
  });
}

export async function readNonceCookie() {
  const store = await cookies();
  const value = store.get(NONCE_COOKIE)?.value;
  if (!value) return null;
  try {
    return JSON.parse(value) as { wallet: string | null; nonce: string };
  } catch {
    return null;
  }
}

export async function clearNonceCookie() {
  const store = await cookies();
  store.delete(NONCE_COOKIE);
}

export function verifyWalletSignature(params: {
  wallet: string;
  nonce: string;
  signature: string;
  message: string;
}) {
  const expectedMessage = buildSigninMessage(params.wallet, params.nonce);
  if (params.message !== expectedMessage) return false;
  try {
    const messageBytes = new TextEncoder().encode(params.message);
    const signatureBytes = bs58.decode(params.signature);
    const publicKeyBytes = new PublicKey(params.wallet).toBytes();
    return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
  } catch {
    return false;
  }
}

function normalizeSiwsHost(host: string): string {
  let h = host.trim().toLowerCase();
  h = h.replace(/^https?:\/\//i, "");
  h = h.replace(/\/$/, "");
  h = h.replace(/:443$/i, "");
  h = h.replace(/:80$/i, "");
  return h;
}

function siwsHostsMatch(messageDomain: string, requestHost: string): boolean {
  const a = normalizeSiwsHost(messageDomain);
  const b = normalizeSiwsHost(requestHost);
  if (a === b) return true;
  const stripWww = (x: string) => x.replace(/^www\./, "");
  return stripWww(a) === stripWww(b);
}

export function verifySiwsSignature(params: {
  wallet: string;
  nonce: string;
  signedMessageBase64: string;
  signatureBase58: string;
  expectedDomain: string;
}) {
  try {
    const messageBytes = Buffer.from(params.signedMessageBase64, "base64");
    if (messageBytes.length === 0) return false;
    const u8 = new Uint8Array(messageBytes);

    const parsed = parseSignInMessage(u8);
    if (parsed?.domain && parsed.address && parsed.nonce) {
      if (!siwsHostsMatch(parsed.domain, params.expectedDomain)) return false;
      if (parsed.address !== params.wallet) return false;
      if (parsed.nonce !== params.nonce) return false;
      const signatureBytes = bs58.decode(params.signatureBase58);
      if (signatureBytes.length !== 64) return false;
      const publicKeyBytes = new PublicKey(params.wallet).toBytes();
      return nacl.sign.detached.verify(u8, signatureBytes, publicKeyBytes);
    }

    const messageText = messageBytes.toString("utf8");
    const lines = messageText.split("\n");
    if (lines.length < 2) return false;
    const domainMatch = lines[0].match(/^(\S+) wants you to sign in/i);
    if (!domainMatch) return false;
    if (!siwsHostsMatch(domainMatch[1], params.expectedDomain)) return false;
    if (lines[1].trim() !== params.wallet) return false;
    const nonceLine = lines.find((line) => line.startsWith("Nonce:"));
    if (!nonceLine) return false;
    if (nonceLine.replace("Nonce:", "").trim() !== params.nonce) return false;
    const signatureBytes = bs58.decode(params.signatureBase58);
    if (signatureBytes.length !== 64) return false;
    const publicKeyBytes = new PublicKey(params.wallet).toBytes();
    return nacl.sign.detached.verify(u8, signatureBytes, publicKeyBytes);
  } catch {
    return false;
  }
}

export async function setSessionCookie(wallet: string, pbtcBalance: number) {
  const secret = getSessionSecret();
  if (!secret) {
    throw new Error(
      "SESSION_SECRET is not configured (must be set to a long random string).",
    );
  }
  const store = await cookies();
  const data: SessionData = {
    wallet,
    pbtcBalance,
    issuedAt: new Date().toISOString(),
  };
  const payloadB64 = Buffer.from(JSON.stringify(data)).toString("base64url");
  const signature = signPayload(payloadB64, secret);
  store.set(SESSION_COOKIE, `${payloadB64}.${signature}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function readSession(): Promise<SessionData | null> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const secret = getSessionSecret();
  if (!secret) {
    if (process.env.NODE_ENV !== "test") {
      console.warn(
        "[wallet-session] SESSION_SECRET is not set — refusing to authenticate any session.",
      );
    }
    return null;
  }
  const parts = raw.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, signature] = parts;
  if (!verifySignature(payloadB64, signature, secret)) return null;
  try {
    const json = Buffer.from(payloadB64, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as SessionData;
    if (typeof parsed?.wallet !== "string" || typeof parsed?.issuedAt !== "string") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Unified role model. One wallet identity; elevated capabilities come from
// env allowlists. Founder wallets are SUPER ADMINS — they implicitly pass
// every capability check.
// ---------------------------------------------------------------------------

function parseWalletList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((wallet) => wallet.trim())
    .filter(Boolean);
}

/** Founder wallets — super admins with access to every elevated surface. */
export function getFounderWallets() {
  return parseWalletList(process.env.FOUNDER_WALLETS);
}

/** Concierge/booking-ops operators. Falls back to MAINTAINER_WALLETS. */
export function getAgentWallets() {
  const explicit = parseWalletList(process.env.AGENT_WALLETS);
  if (explicit.length > 0) return explicit;
  return parseWalletList(process.env.MAINTAINER_WALLETS);
}

/** Non-founder merchant (Perks) reviewers. */
export function getPerksAdminWallets() {
  return parseWalletList(process.env.PERKS_ADMIN_WALLETS);
}

export function isFounderWallet(wallet: string | null | undefined): boolean {
  if (!wallet) return false;
  return getFounderWallets().includes(wallet);
}

export function isAgentWallet(wallet: string | null | undefined): boolean {
  if (!wallet) return false;
  if (isFounderWallet(wallet)) return true;
  return getAgentWallets().includes(wallet);
}

export function isPerksAdminWallet(wallet: string | null | undefined): boolean {
  if (!wallet) return false;
  if (isFounderWallet(wallet)) return true;
  return getPerksAdminWallets().includes(wallet);
}

/** Concierge desk access = agent OR founder. */
export function hasConciergeAccess(wallet: string | null | undefined): boolean {
  if (!wallet) return false;
  return isFounderWallet(wallet) || isAgentWallet(wallet);
}

/** Perks (merchant) review access = perks admin OR founder. */
export function hasPerksAdminAccess(wallet: string | null | undefined): boolean {
  if (!wallet) return false;
  return isFounderWallet(wallet) || isPerksAdminWallet(wallet);
}

/**
 * Legacy alias used by ported travel code. "Admin console" historically meant
 * concierge-desk access (agent OR founder).
 */
export function hasAdminConsoleAccess(wallet: string | null | undefined): boolean {
  return hasConciergeAccess(wallet);
}

export function getMaintainerWallets() {
  return Array.from(new Set([...getAgentWallets(), ...getFounderWallets()]));
}
