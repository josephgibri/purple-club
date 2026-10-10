import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "pc_session";
const HOLD_COOKIE = "pc_hold";
const HOLD_TTL_MS = 60_000;
const PBTC_MINT = "HfMbPyDdZH6QMaDDUokjYCkHxzjoGBMpgaUvpLWGbF5p";
const TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

/**
 * Rooms stay closed until a verified wallet holds at least 1 PBTC.
 * The cookie proves the sign-in. A live read proves the key.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = await readSession(request);

  if (isPublic(pathname)) {
    if (pathname === "/" && session) {
      const gate = await holdsKey(request, session);
      if (gate.ok) {
        const response = NextResponse.redirect(rewrite(request, "/account"));
        applyHold(response, gate.hold);
        return response;
      }
    }
    return NextResponse.next();
  }

  const gate = session ? await holdsKey(request, session) : { ok: false as const, hold: null };
  if (!gate.ok) {
    const response = NextResponse.redirect(rewrite(request, "/"));
    response.cookies.delete(HOLD_COOKIE);
    return response;
  }
  const response = NextResponse.next();
  applyHold(response, gate.hold);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|brand/|.*\\.(?:png|jpg|jpeg|svg|ico|webp|webmanifest|txt|xml)$).*)",
  ],
};

function isPublic(pathname: string): boolean {
  if (
    pathname === "/" ||
    pathname === "/terms" ||
    pathname === "/forgot" ||
    pathname === "/reset" ||
    pathname === "/verify" ||
    pathname === "/offline" ||
    pathname === "/unsubscribe" ||
    pathname === "/welcome" ||
    pathname === "/email/confirm"
  ) {
    return true;
  }
  return ["/api", "/claim", "/invite", "/link/telegram", "/merchant", "/admin"].some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function rewrite(request: NextRequest, pathname: string): URL {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  return url;
}

type Session = { wallet: string; pbtcBalance: number };

async function readSession(request: NextRequest): Promise<Session | null> {
  const raw = request.cookies.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const secret = sessionSecret();
  if (!secret) return null;
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = raw.slice(0, dot);
  const signature = raw.slice(dot + 1);
  if (!(await hmacMatches(payload, signature, secret))) return null;
  try {
    const parsed = JSON.parse(fromBase64Url(payload)) as {
      wallet?: string;
      pbtcBalance?: number;
    };
    if (typeof parsed.wallet !== "string" || typeof parsed.pbtcBalance !== "number") {
      return null;
    }
    return { wallet: parsed.wallet, pbtcBalance: parsed.pbtcBalance };
  } catch {
    return null;
  }
}

async function holdsKey(
  request: NextRequest,
  session: Session,
): Promise<{ ok: true; hold: string | null } | { ok: false; hold: null }> {
  if (await holdCookieValid(request, session.wallet)) return { ok: true, hold: null };
  let live: number | null = null;
  try {
    live = await readPbtc(session.wallet);
  } catch {
    live = null;
  }
  const balance = live ?? session.pbtcBalance;
  if (balance < 1) return { ok: false, hold: null };
  return { ok: true, hold: await mintHold(session.wallet) };
}

async function mintHold(wallet: string): Promise<string | null> {
  const secret = sessionSecret();
  if (!secret) return null;
  const exp = Date.now() + HOLD_TTL_MS;
  const payload = `${wallet}.${exp}`;
  const signature = await hmac(payload, secret);
  return `${payload}.${signature}`;
}

function applyHold(response: NextResponse, hold: string | null) {
  if (!hold) return;
  response.cookies.set(HOLD_COOKIE, hold, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.ceil(HOLD_TTL_MS / 1000),
  });
}

async function holdCookieValid(request: NextRequest, wallet: string): Promise<boolean> {
  const raw = request.cookies.get(HOLD_COOKIE)?.value;
  if (!raw) return false;
  const secret = sessionSecret();
  if (!secret) return false;
  const parts = raw.split(".");
  if (parts.length !== 3) return false;
  const [cookieWallet, expRaw, signature] = parts;
  if (cookieWallet !== wallet) return false;
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp <= Date.now()) return false;
  return hmacMatches(`${cookieWallet}.${expRaw}`, signature, secret);
}

async function readPbtc(wallet: string): Promise<number> {
  const endpoint = rpcUrl();
  const byMint = await rpc(endpoint, "getTokenAccountsByOwner", [
    wallet,
    { mint: PBTC_MINT },
    { encoding: "jsonParsed" },
  ]);
  const fromMint = sumAccounts(byMint);
  if (fromMint > 0) return fromMint;
  const byProgram = await rpc(endpoint, "getTokenAccountsByOwner", [
    wallet,
    { programId: TOKEN_2022 },
    { encoding: "jsonParsed" },
  ]);
  return sumAccounts(byProgram, PBTC_MINT);
}

function sumAccounts(value: unknown, mint?: string): number {
  const rows = (value as { value?: Array<{ account?: { data?: { parsed?: { info?: { mint?: string; tokenAmount?: { uiAmount?: number | null; uiAmountString?: string } } } } } }> })?.value;
  if (!Array.isArray(rows)) return 0;
  return rows.reduce((sum, row) => {
    const info = row.account?.data?.parsed?.info;
    if (mint && info?.mint !== mint) return sum;
    const token = info?.tokenAmount;
    const amount = token?.uiAmount != null ? Number(token.uiAmount) : Number(token?.uiAmountString ?? 0);
    return sum + (Number.isFinite(amount) ? amount : 0);
  }, 0);
}

async function rpc(endpoint: string, method: string, params: unknown[]): Promise<unknown> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`RPC ${response.status}`);
  const body = (await response.json()) as { result?: unknown; error?: { message?: string } };
  if (body.error) throw new Error(body.error.message || "RPC error");
  return body.result;
}

function rpcUrl(): string {
  const explicit = process.env.SOLANA_RPC_URL?.trim();
  if (explicit && explicit.includes("://")) return explicit;
  const helius = process.env.HELIUS_API_KEY?.trim();
  if (helius) {
    if (helius.includes("://")) return helius;
    return `https://mainnet.helius-rpc.com/?api-key=${helius}`;
  }
  for (const name of ["NEXT_PUBLIC_HELIUS_RPC_URL", "NEXT_PUBLIC_SOLANA_RPC_URL", "NEXT_PUBLIC_ALCHEMY_RPC_URL"]) {
    const url = process.env[name]?.trim();
    if (url && url.includes("://")) return url;
  }
  return "https://api.mainnet-beta.solana.com";
}

function sessionSecret(): string | null {
  const raw = process.env.SESSION_SECRET?.trim() || process.env.JWT_SIGNING_SECRET?.trim();
  if (!raw || raw.length < 16) return null;
  return raw;
}

function encode(value: string): ArrayBuffer {
  const encoded = new TextEncoder().encode(value);
  return encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength) as ArrayBuffer;
}

async function hmac(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, encode(payload));
  return toBase64Url(mac);
}

async function hmacMatches(payload: string, signature: string, secret: string): Promise<boolean> {
  const expected = await hmac(payload, secret);
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}

function toBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return atob(padded + pad);
}
