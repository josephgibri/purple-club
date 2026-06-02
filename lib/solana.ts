import { clusterApiUrl, Connection, PublicKey } from "@solana/web3.js";

export const PBTC_MINT = new PublicKey(
  "HfMbPyDdZH6QMaDDUokjYCkHxzjoGBMpgaUvpLWGbF5p",
);

const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);

const COMMITMENT = "confirmed";

/**
 * Endpoints used for client-side balance reads, in priority order.
 *
 * Primary is the same-origin `/api/rpc` proxy, which forwards to Helius using
 * the SERVER-ONLY key — so the membership gate (which reads balances for every
 * visitor) never ships an RPC API key to the browser. The public mainnet RPC
 * is a keyless last-resort fallback if the proxy is unreachable.
 *
 * We intentionally no longer read `NEXT_PUBLIC_*` Helius/Alchemy URLs here:
 * those inline the key into the bundle, which is exactly the exposure we're
 * closing. The wallet adapter still uses a (domain-restricted) client RPC for
 * connect/send/confirm — that's a separate, low-volume path.
 */
function getReadEndpoints(): string[] {
  const endpoints: string[] = [];

  if (typeof window !== "undefined") {
    endpoints.push(`${window.location.origin}/api/rpc`);
  } else {
    const base = process.env.PUBLIC_SITE_URL?.replace(/\/+$/, "");
    if (base) endpoints.push(`${base}/api/rpc`);
  }

  endpoints.push(clusterApiUrl("mainnet-beta"));
  return endpoints;
}

export type GateBalanceResult = {
  uiAmount: number;
  endpoint: string;
};

export async function getPbtcBalanceWithFallback(
  owner: PublicKey,
): Promise<GateBalanceResult> {
  let lastError: unknown;

  for (const endpoint of getReadEndpoints()) {
    try {
      const connection = new Connection(endpoint, COMMITMENT);
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(owner, {
        programId: TOKEN_PROGRAM_ID,
      });

      let totalBalance = 0;
      for (const account of tokenAccounts.value) {
        const parsed = account.account.data.parsed?.info;
        if (!parsed) continue;
        if (parsed.mint !== PBTC_MINT.toBase58()) continue;

        const uiAmount = Number(parsed.tokenAmount?.uiAmount ?? 0);
        totalBalance += uiAmount;
      }

      return {
        uiAmount: totalBalance,
        endpoint,
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error("Unable to reach any configured Solana RPC.");
}
