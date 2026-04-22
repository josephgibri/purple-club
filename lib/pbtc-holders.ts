import { Connection, PublicKey } from "@solana/web3.js";

import { PBTC_MINT } from "@/lib/solana";

const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);

const SPL_TOKEN_ACCOUNT_SIZE = 165;

const HOLDER_COUNT_ENDPOINTS = [
  process.env.NEXT_PUBLIC_HELIUS_RPC_URL,
  process.env.NEXT_PUBLIC_ALCHEMY_RPC_URL,
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL,
].filter((value): value is string => Boolean(value));

export type PbtcHoldersResult = {
  totalAccounts: number;
  activeHolders: number;
  endpoint: string;
};

export async function getPbtcHolderCount(): Promise<PbtcHoldersResult> {
  if (HOLDER_COUNT_ENDPOINTS.length === 0) {
    throw new Error(
      "No private RPC endpoint configured. Holder count requires Helius/Alchemy/custom RPC.",
    );
  }

  let lastError: unknown;

  for (const endpoint of HOLDER_COUNT_ENDPOINTS) {
    try {
      const connection = new Connection(endpoint, "confirmed");

      const accounts = await connection.getParsedProgramAccounts(
        TOKEN_PROGRAM_ID,
        {
          filters: [
            { dataSize: SPL_TOKEN_ACCOUNT_SIZE },
            {
              memcmp: {
                offset: 0,
                bytes: PBTC_MINT.toBase58(),
              },
            },
          ],
        },
      );

      let activeHolders = 0;
      for (const entry of accounts) {
        const data = entry.account.data;
        if (!("parsed" in data)) continue;
        const parsed = data.parsed as
          | { info?: { tokenAmount?: { uiAmount?: number | null } } }
          | undefined;
        const uiAmount = Number(parsed?.info?.tokenAmount?.uiAmount ?? 0);
        if (uiAmount > 0) activeHolders += 1;
      }

      return {
        totalAccounts: accounts.length,
        activeHolders,
        endpoint,
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error("Unable to fetch PBTC holder count from any RPC.");
}
