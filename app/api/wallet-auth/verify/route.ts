import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { getPbtcBalanceWithFallback } from "@/lib/solana";
import {
  clearNonceCookie,
  getPbtcBalance,
  hasConciergeAccess,
  isAgentWallet,
  isFounderWallet,
  isPerksAdminWallet,
  readNonceCookie,
  setSessionCookie,
  verifyClubProof,
  verifySiwsSignature,
  verifyWalletSignature,
  type ClubProof,
} from "@/lib/wallet-session";

export const runtime = "nodejs";

// Unified wallet-session minting. Accepts EITHER:
//   (a) Purple Club's single-signature proof from hooks/useWalletAuth.ts
//       ({ publicKey, message, signature, issuedAt }) — bridged automatically
//       so signing in once on /perks or /account also authorizes hotels; or
//   (b) Purple Club's nonce + SIWS/plain flow from the MembershipPill
//       ({ wallet, signature, signedMessage | message }) — used when a member
//       lands directly on a hotels page without an existing session.
// Both mint the same `pc_session` cookie, so the session check in the pill
// prevents a second signature.

type RateBucket = { count: number; resetAt: number };
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_REQUESTS = 10;
const rateBuckets = new Map<string, RateBucket>();

function getClientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

function checkRateLimit(ip: string): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const bucket = rateBuckets.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return { allowed: true, retryAfterSec: 0 };
  }
  if (bucket.count >= RATE_MAX_REQUESTS) {
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }
  bucket.count += 1;
  return { allowed: true, retryAfterSec: 0 };
}

function maybeCleanupRateBuckets() {
  if (rateBuckets.size < 1000) return;
  const now = Date.now();
  for (const [key, bucket] of rateBuckets) {
    if (bucket.resetAt <= now) rateBuckets.delete(key);
  }
}

function getRequestHost(request: Request) {
  const forwarded = request.headers.get("x-forwarded-host");
  if (forwarded) return forwarded.split(",")[0].trim();
  const host = request.headers.get("host");
  if (host) return host.trim();
  try {
    return new URL(request.url).host;
  } catch {
    return "";
  }
}

function roleFlags(wallet: string, pbtcBalance: number) {
  return {
    wallet,
    pbtcBalance,
    pbtcEligible: pbtcBalance >= 1,
    isMaintainer: hasConciergeAccess(wallet),
    isAdmin: hasConciergeAccess(wallet),
    isAgent: isAgentWallet(wallet),
    isFounder: isFounderWallet(wallet),
    isPerksAdmin: isPerksAdminWallet(wallet),
  };
}

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const limit = checkRateLimit(ip);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many sign-in attempts. Please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
    );
  }
  maybeCleanupRateBuckets();

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  // ---- Path (a): Purple Club single-signature proof -----------------------
  if (typeof body.publicKey === "string" && typeof body.issuedAt === "number") {
    const proof = body as unknown as ClubProof;
    if (!verifyClubProof(proof)) {
      return NextResponse.json({ error: "Invalid wallet proof." }, { status: 401 });
    }
    let pbtcBalance = 0;
    try {
      const { uiAmount } = await getPbtcBalanceWithFallback(new PublicKey(proof.publicKey));
      pbtcBalance = uiAmount;
    } catch {
      pbtcBalance = 0;
    }
    try {
      await setSessionCookie(proof.publicKey, pbtcBalance);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to establish session.";
      return NextResponse.json({ error: message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, ...roleFlags(proof.publicKey, pbtcBalance) });
  }

  // ---- Path (b): Purple Club nonce + SIWS/plain flow -----------------------
  try {
    const wallet = typeof body.wallet === "string" ? body.wallet.trim() : "";
    const signature = typeof body.signature === "string" ? body.signature : "";
    const signedMessage = typeof body.signedMessage === "string" ? body.signedMessage : "";
    const message = typeof body.message === "string" ? body.message : "";
    const isSiws = signedMessage.length > 0;

    if (!wallet || !signature || (isSiws ? !signedMessage : !message)) {
      return NextResponse.json(
        { error: "wallet, signature, and message are required." },
        { status: 400 },
      );
    }

    const nonceData = await readNonceCookie();
    if (!nonceData) {
      return NextResponse.json({ error: "Nonce missing. Retry sign-in." }, { status: 400 });
    }

    let valid = false;
    if (isSiws) {
      const expectedDomain = getRequestHost(request);
      if (!expectedDomain) {
        return NextResponse.json({ error: "Unable to determine request origin." }, { status: 400 });
      }
      valid = verifySiwsSignature({
        wallet,
        nonce: nonceData.nonce,
        signedMessageBase64: signedMessage,
        signatureBase58: signature,
        expectedDomain,
      });
    } else {
      if (nonceData.wallet !== wallet) {
        return NextResponse.json(
          { error: "Nonce missing or mismatched. Retry sign-in." },
          { status: 400 },
        );
      }
      valid = verifyWalletSignature({ wallet, nonce: nonceData.nonce, signature, message });
    }

    if (!valid) {
      return NextResponse.json({ error: "Invalid wallet signature." }, { status: 401 });
    }

    let pbtcBalance = 0;
    try {
      pbtcBalance = await getPbtcBalance(wallet);
    } catch (balanceErr) {
      console.warn("[wallet-auth/verify] PBTC balance read failed — minting session with 0:", balanceErr);
    }

    await setSessionCookie(wallet, pbtcBalance);
    await clearNonceCookie();

    return NextResponse.json(roleFlags(wallet, pbtcBalance));
  } catch (error) {
    console.error("Wallet verification failed:", error);
    return NextResponse.json({ error: "Unable to verify wallet sign-in." }, { status: 500 });
  }
}
