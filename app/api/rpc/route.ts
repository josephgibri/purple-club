import { NextResponse } from "next/server";
import { getRpcUrl } from "@/lib/pbtc";

export const runtime = "nodejs";
// Never cache — every call is a live on-chain read forwarded upstream.
export const dynamic = "force-dynamic";

/**
 * Same-origin Solana RPC proxy.
 *
 * The browser used to read PBTC balances directly from Helius using a
 * NEXT_PUBLIC_* RPC URL, which inlines the API key into the client bundle.
 * This route forwards JSON-RPC calls to Helius using the SERVER-ONLY
 * `HELIUS_API_KEY` (via `getRpcUrl()`), so the key never ships to the
 * browser for the high-volume, anonymous membership-gate reads.
 *
 * Because a naive proxy is just an open relay (anyone could drain our quota),
 * it is locked down:
 *   - explicit method allowlist (reads + sendTransaction for Purple Wallet swap/send),
 *   - per-IP rate limit,
 *   - request body size cap,
 *   - bounded batch size.
 *
 * sendTransaction is included so Purple Wallet can broadcast signed swap and
 * send transactions without exposing the Helius API key to the client bundle.
 * The per-IP rate limit (80 req / 10 s) is the abuse guard.
 */
const ALLOWED_METHODS = new Set<string>([
  "getTokenAccountsByOwner",
  "getTokenAccountBalance",
  "getBalance",
  "getAccountInfo",
  "getMultipleAccounts",
  "getLatestBlockhash",
  "getSignatureStatuses",
  "getSlot",
  "getHealth",
  "sendTransaction",
]);

const MAX_BODY_BYTES = 16 * 1024; // 16 KB is plenty for read RPC payloads
const MAX_BATCH = 10;
const WINDOW_MS = 10_000;
const MAX_REQ_PER_WINDOW = 80;

// In-memory token bucket. Note: serverless instances don't share memory, so
// this is a per-instance speed bump, not a global limiter. Move to Vercel KV
// / Upstash if you need a hard global cap.
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

function withinRateLimit(ip: string): boolean {
  const now = Date.now();
  const bucket = buckets.get(ip);
  if (!bucket || now > bucket.resetAt) {
    buckets.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= MAX_REQ_PER_WINDOW;
}

function methodsAreAllowed(payload: unknown): boolean {
  const entries = Array.isArray(payload) ? payload : [payload];
  if (entries.length === 0 || entries.length > MAX_BATCH) return false;
  for (const entry of entries) {
    const method = (entry as { method?: unknown })?.method;
    if (typeof method !== "string" || !ALLOWED_METHODS.has(method)) {
      return false;
    }
  }
  return true;
}

export async function POST(request: Request): Promise<Response> {
  const ip =
    (request.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() ||
    "unknown";

  if (!withinRateLimit(ip)) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Slow down." },
      { status: 429 },
    );
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!methodsAreAllowed(payload)) {
    return NextResponse.json(
      { error: "RPC method not allowed." },
      { status: 403 },
    );
  }

  try {
    const upstream = await fetch(getRpcUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: raw,
    });
    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return NextResponse.json(
      { error: "Upstream RPC unavailable." },
      { status: 502 },
    );
  }
}
