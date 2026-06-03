/**
 * Fetch SOL, PBTC, and USDC balances for a given wallet address.
 * Routed through the same-origin /api/rpc proxy so the Helius key
 * stays server-side.
 */

import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";

const PBTC_MINT = "HfMbPyDdZH6QMaDDUokjYCkHxzjoGBMpgaUvpLWGbF5p";
const DEFAULT_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

function getUsdcMint(): string {
  return process.env.NEXT_PUBLIC_USDC_MINT?.trim() || DEFAULT_USDC_MINT;
}

function getConnection(): Connection {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return new Connection(`${origin}/api/rpc`, "confirmed");
}

export interface WalletBalances {
  sol: number;
  pbtc: number;
  usdc: number;
}

export async function fetchWalletBalances(address: string): Promise<WalletBalances> {
  const connection = getConnection();
  const owner = new PublicKey(address);

  // SOL balance
  const lamports = await connection.getBalance(owner);
  const sol = lamports / LAMPORTS_PER_SOL;

  // SPL token accounts (PBTC + USDC in one call)
  const tokenAccounts = await connection.getParsedTokenAccountsByOwner(owner, {
    programId: TOKEN_PROGRAM_ID,
  });

  let pbtc = 0;
  let usdc = 0;
  const usdcMint = getUsdcMint();

  for (const { account } of tokenAccounts.value) {
    const info = account.data.parsed?.info;
    if (!info) continue;
    const mint: string = info.mint;
    const amount: number = info.tokenAmount?.uiAmount ?? 0;
    if (mint === PBTC_MINT) pbtc += amount;
    if (mint === usdcMint) usdc += amount;
  }

  return { sol, pbtc, usdc };
}
