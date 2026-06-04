/**
 * Jupiter Swap API + swap transaction builder.
 *
 * Purple Club earns 0.25% (25 bps) on every swap. The fee is collected
 * on-chain by Jupiter and deposited directly into a treasury token account.
 * This is trustless — Jupiter's contracts enforce it; Purple Club never
 * touches user funds.
 *
 * Fee setup (one-time, in your Vercel env):
 *   NEXT_PUBLIC_JUPITER_FEE_WALLET = <treasury wallet OWNER address, base58>
 *
 * The treasury wallet must have an initialised associated token account (ATA)
 * for each mint we collect fees in. Because we take the fee on the output mint
 * — or the input mint when the output is native SOL — the treasury only ever
 * needs a USDC ATA and a PBTC ATA (never a transient wSOL one).
 *
 * IMPORTANT: Jupiter's `feeAccount` must be an *initialised token account*, not
 * a wallet address. Passing a wallet address (or an uninitialised ATA) yields
 * on-chain error 0x1789 (6025 = InvalidTokenAccount).
 *
 * Docs: https://dev.jup.ag/docs/swap/v1/add-fees-to-swap
 *
 * Note: quote-api.jup.ag/v6 has been retired. All requests go through
 * lite-api.jup.ag/swap/v1 (no API key required for public rate limits).
 */

import { Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

const QUOTE_API = "https://lite-api.jup.ag/swap/v1";

export const PURPLE_FEE_BPS = 25; // 0.25%

const WSOL_MINT = "So11111111111111111111111111111111111111112";

export const TOKEN_MINTS = {
  SOL: WSOL_MINT,
  USDC: process.env.NEXT_PUBLIC_USDC_MINT ?? "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  PBTC: "HfMbPyDdZH6QMaDDUokjYCkHxzjoGBMpgaUvpLWGbF5p",
} as const;

/** Treasury wallet that owns the fee token accounts (base58 owner address). */
function getFeeWalletOwner(): string | null {
  const owner =
    process.env.NEXT_PUBLIC_JUPITER_FEE_WALLET?.trim() ||
    // Back-compat: earlier env name. Treated as the owner wallet address.
    process.env.NEXT_PUBLIC_JUPITER_FEE_ACCOUNT?.trim();
  return owner || null;
}

function getRpcConnection(): Connection | null {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  if (!origin) return null;
  return new Connection(`${origin}/api/rpc`, "confirmed");
}

/**
 * Resolve the token account that should receive the platform fee for a given
 * swap. Returns null when no fee wallet is configured, or when the fee token
 * account does not yet exist on-chain.
 *
 * Fee-mint rules (ExactIn): the fee mint must be the input or output mint of
 * the pair. We prefer the output mint, but fall back to the input mint when the
 * output is native SOL so we never need a (transient) wSOL fee account.
 *
 * Jupiter rejects an uninitialised fee account with 0x1789 (InvalidTokenAccount)
 * and fails the whole swap. To make swaps bulletproof, we verify the derived
 * ATA exists first; if it doesn't, we simply skip the fee so the swap still
 * succeeds (fee-free) instead of erroring out.
 */
async function resolveFeeAccount(
  inputMint: string,
  outputMint: string,
): Promise<string | null> {
  const owner = getFeeWalletOwner();
  if (!owner) return null;

  const feeMint = outputMint === WSOL_MINT ? inputMint : outputMint;
  // Native SOL can't be a fee mint directly; if both sides are SOL-ish, skip.
  if (feeMint === WSOL_MINT) return null;

  let ata: PublicKey;
  try {
    ata = getAssociatedTokenAddressSync(new PublicKey(feeMint), new PublicKey(owner));
  } catch {
    return null;
  }

  // Verify the treasury's fee token account is initialised on-chain.
  try {
    const conn = getRpcConnection();
    if (!conn) return ata.toBase58();
    const info = await conn.getAccountInfo(ata);
    if (!info) {
      if (typeof console !== "undefined") {
        console.info(
          `[swap] fee account ${ata.toBase58()} (mint ${feeMint}) is not initialised — skipping the 0.25% fee for this swap`,
        );
      }
      return null;
    }
    return ata.toBase58();
  } catch {
    // If we can't verify, err on the side of a working swap (no fee).
    return null;
  }
}

export type TokenSymbol = keyof typeof TOKEN_MINTS;

export interface QuoteResponse {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  priceImpactPct: string;
  routePlan: unknown[];
  // plus additional Jupiter fields
  [key: string]: unknown;
}

export interface SwapResult {
  quote: QuoteResponse;
  /** base64-encoded unsigned transaction */
  swapTransactionBase64: string;
  lastValidBlockHeight: number;
}

/**
 * Fetch a swap quote from Jupiter.
 * @param inputMint  Source token mint (base58)
 * @param outputMint Destination token mint (base58)
 * @param amountLamports  Input amount in smallest unit (lamports / micro-USDC / etc.)
 * @param slippageBps     Max accepted slippage in bps (default 50 = 0.5%)
 */
export async function getSwapQuote(
  inputMint: string,
  outputMint: string,
  amountLamports: string,
  slippageBps = 50,
): Promise<QuoteResponse> {
  const feeAccount = await resolveFeeAccount(inputMint, outputMint);

  const params = new URLSearchParams({
    inputMint,
    outputMint,
    amount: amountLamports,
    slippageBps: String(slippageBps),
    restrictIntermediateTokens: "true",
    ...(feeAccount ? { platformFeeBps: String(PURPLE_FEE_BPS) } : {}),
  });

  const res = await fetch(`${QUOTE_API}/quote?${params.toString()}`);
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`Jupiter quote failed: ${err}`);
  }
  return res.json() as Promise<QuoteResponse>;
}

/**
 * Build the swap transaction from a quote response.
 * Returns the base64-encoded transaction ready for signing.
 */
export async function buildSwapTransaction(
  quote: QuoteResponse,
  walletAddress: string,
): Promise<SwapResult> {
  const feeAccount = await resolveFeeAccount(quote.inputMint, quote.outputMint);

  const body: Record<string, unknown> = {
    quoteResponse: quote,
    userPublicKey: walletAddress,
    wrapAndUnwrapSol: true,
    dynamicComputeUnitLimit: true,
    prioritizationFeeLamports: "auto",
    ...(feeAccount ? { feeAccount } : {}),
  };

  const res = await fetch(`${QUOTE_API}/swap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`Jupiter swap build failed: ${err}`);
  }

  const data = (await res.json()) as {
    swapTransaction: string;
    lastValidBlockHeight: number;
  };

  return {
    quote,
    swapTransactionBase64: data.swapTransaction,
    lastValidBlockHeight: data.lastValidBlockHeight,
  };
}

/** Format a lamport/micro-unit amount as a human-readable string. */
export function formatTokenAmount(
  lamports: string | number,
  decimals: number,
): string {
  const n = Number(lamports) / 10 ** decimals;
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals > 6 ? 4 : 2,
  });
}

export const TOKEN_DECIMALS: Record<TokenSymbol, number> = {
  SOL: 9,
  USDC: 6,
  PBTC: 9,
};
