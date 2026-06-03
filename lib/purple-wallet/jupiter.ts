/**
 * Jupiter v6 Quote API + swap transaction builder.
 *
 * Purple Club earns 0.25% (25 bps) on every swap. The fee is collected
 * on-chain by Jupiter and deposited directly into NEXT_PUBLIC_JUPITER_FEE_ACCOUNT.
 * This is trustless — Jupiter's contracts enforce it; Purple Club never
 * touches user funds.
 *
 * Referral fee setup (one-time, in your Vercel env):
 *   NEXT_PUBLIC_JUPITER_FEE_ACCOUNT = <your fee wallet base58 address>
 *
 * Docs: https://station.jup.ag/docs/apis/swap-api
 */

const QUOTE_API = "https://quote-api.jup.ag/v6";

export const PURPLE_FEE_BPS = 25; // 0.25%

export const TOKEN_MINTS = {
  SOL: "So11111111111111111111111111111111111111112",
  USDC: process.env.NEXT_PUBLIC_USDC_MINT ?? "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  PBTC: "HfMbPyDdZH6QMaDDUokjYCkHxzjoGBMpgaUvpLWGbF5p",
} as const;

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
  const feeAccount = process.env.NEXT_PUBLIC_JUPITER_FEE_ACCOUNT?.trim();

  const params = new URLSearchParams({
    inputMint,
    outputMint,
    amount: amountLamports,
    slippageBps: String(slippageBps),
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
  const feeAccount = process.env.NEXT_PUBLIC_JUPITER_FEE_ACCOUNT?.trim();

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
