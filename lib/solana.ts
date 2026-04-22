import { clusterApiUrl, Connection, PublicKey } from "@solana/web3.js";

export const PBTC_MINT = new PublicKey(
  "HfMbPyDdZH6QMaDDUokjYCkHxzjoGBMpgaUvpLWGbF5p",
);

const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);

const DEFAULT_RPC_ENDPOINTS = [
  process.env.NEXT_PUBLIC_HELIUS_RPC_URL,
  process.env.NEXT_PUBLIC_ALCHEMY_RPC_URL,
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL,
  clusterApiUrl("mainnet-beta"),
].filter((value): value is string => Boolean(value));

const COMMITMENT = "confirmed";

export type GateBalanceResult = {
  uiAmount: number;
  endpoint: string;
};

export async function getPbtcBalanceWithFallback(
  owner: PublicKey,
): Promise<GateBalanceResult> {
  let lastError: unknown;

  for (const endpoint of DEFAULT_RPC_ENDPOINTS) {
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
