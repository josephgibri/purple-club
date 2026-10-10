import { Connection, PublicKey } from "@solana/web3.js";

import { getRpcUrl } from "@/lib/pbtc";

export const PBTC_MINT = new PublicKey(
  "HfMbPyDdZH6QMaDDUokjYCkHxzjoGBMpgaUvpLWGbF5p",
);

const TOKEN_2022_PROGRAM_ID = new PublicKey(
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
);

const COMMITMENT = "confirmed";

/**
 * Endpoints used for client-side balance reads, in priority order.
 *
 * Primary is the same-origin `/api/rpc` proxy, which forwards to Helius using
 * the server RPC URL — so the membership gate never calls Helius from the
 * browser. CSP blocks that direct call, and the old public-RPC fallback then
 * surfaced as "Failed to fetch" with a fake zero balance.
 *
 * We intentionally no longer read `NEXT_PUBLIC_*` Helius/Alchemy URLs here:
 * those inline the key into the bundle, which is exactly the exposure we're
 * closing. The wallet adapter still uses a (domain-restricted) client RPC for
 * connect/send/confirm — that's a separate, low-volume path.
 */
/** Same-origin RPC proxy, including the app basePath when the club is mounted under one. */
export function rpcProxyUrl(): string {
  const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || "").trim().replace(/\/$/, "");
  if (typeof window !== "undefined") {
    return `${window.location.origin}${basePath}/api/rpc`;
  }
  const site = process.env.PUBLIC_SITE_URL?.replace(/\/+$/, "");
  return site ? `${site}${basePath}/api/rpc` : "";
}

function getReadEndpoints(): string[] {
  const proxy = rpcProxyUrl();
  return proxy ? [proxy] : [];
}

export type GateBalanceResult = {
  uiAmount: number;
  endpoint: string;
};

export async function getPbtcBalanceWithFallback(
  owner: PublicKey,
): Promise<GateBalanceResult> {
  // Server reads go straight to Helius. The browser uses the same-origin proxy.
  const endpoint = typeof window === "undefined" ? getRpcUrl() : getReadEndpoints()[0];
  if (!endpoint) throw new Error("RPC proxy URL is not configured.");

  const connection = new Connection(endpoint, {
    commitment: COMMITMENT,
    disableRetryOnRateLimit: true,
  });
  let totalBalance = 0;
  let reads = 0;
  let programError: unknown;
  const mintAddress = PBTC_MINT.toBase58();

  try {
    const byMint = await connection.getParsedTokenAccountsByOwner(owner, { mint: PBTC_MINT });
    reads += 1;
    for (const account of byMint.value) {
      const parsed = account.account.data.parsed?.info;
      const ui = parsed?.tokenAmount?.uiAmount;
      totalBalance += ui != null ? Number(ui) : Number(parsed?.tokenAmount?.uiAmountString ?? 0);
    }
  } catch (error) {
    programError = error;
  }

  if (totalBalance === 0) {
    try {
      const byProgram = await connection.getParsedTokenAccountsByOwner(owner, {
        programId: TOKEN_2022_PROGRAM_ID,
      });
      reads += 1;
      for (const account of byProgram.value) {
        const parsed = account.account.data.parsed?.info;
        if (!parsed || parsed.mint !== mintAddress) continue;
        const ui = parsed.tokenAmount?.uiAmount;
        totalBalance += ui != null ? Number(ui) : Number(parsed.tokenAmount?.uiAmountString ?? 0);
      }
    } catch (error) {
      programError = error;
    }
  }

  if (reads === 0) throw programError ?? new Error("PBTC balance read failed.");
  return { uiAmount: totalBalance, endpoint };
}
