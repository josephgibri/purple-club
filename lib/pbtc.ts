import { Connection, PublicKey } from "@solana/web3.js";
import { getMint } from "@solana/spl-token";

export const PBTC_DECIMALS = 9;

const DEFAULT_INITIAL_SUPPLY_PBTC = 21_000_000n;

/**
 * Resolve the Solana RPC URL.
 *
 * Order of preference:
 *   1. SOLANA_RPC_URL when it's a full URL.
 *   2. HELIUS_API_KEY:
 *      - if it's a full URL (legacy form), use it as-is.
 *      - if it's a bare API key, build the canonical Helius mainnet URL.
 *   3. Public Solana mainnet RPC (rate-limited, last-resort fallback).
 */
export function getRpcUrl(): string {
  const explicit = process.env.SOLANA_RPC_URL?.trim();
  if (explicit && explicit.includes("://")) return explicit;
  const helius = process.env.HELIUS_API_KEY?.trim();
  if (helius) {
    if (helius.includes("://")) return helius;
    return `https://mainnet.helius-rpc.com/?api-key=${helius}`;
  }
  return "https://api.mainnet-beta.solana.com";
}

export function getPbtcMintAddress(): PublicKey {
  const mint = process.env.PBTC_MINT;
  if (!mint) throw new Error("PBTC_MINT is not configured.");
  return new PublicKey(mint);
}

export function getInitialSupplyLamports(): bigint {
  const raw = process.env.PBTC_INITIAL_SUPPLY?.trim();
  if (!raw) {
    return DEFAULT_INITIAL_SUPPLY_PBTC * 10n ** BigInt(PBTC_DECIMALS);
  }
  let asInt: bigint;
  try {
    asInt = BigInt(raw);
  } catch {
    return DEFAULT_INITIAL_SUPPLY_PBTC * 10n ** BigInt(PBTC_DECIMALS);
  }
  return asInt * 10n ** BigInt(PBTC_DECIMALS);
}

export type PbtcSupplySnapshot = {
  initialLamports: string;
  currentLamports: string;
  burnedLamports: string;
  decimals: number;
  fetchedAt: string;
};

export async function readPbtcSupply(): Promise<PbtcSupplySnapshot> {
  const connection = new Connection(getRpcUrl(), "confirmed");
  const mint = await getMint(connection, getPbtcMintAddress());
  const initial = getInitialSupplyLamports();
  const current = mint.supply;
  const burned = initial > current ? initial - current : 0n;
  return {
    initialLamports: initial.toString(),
    currentLamports: current.toString(),
    burnedLamports: burned.toString(),
    decimals: mint.decimals,
    fetchedAt: new Date().toISOString(),
  };
}
