/**
 * Live USD prices for the Purple Wallet assets, via Jupiter's free Price API.
 *
 * Endpoint: https://lite-api.jup.ag/price/v3?ids=<mint>,<mint>
 * Response is a flat map keyed by mint:
 *   { "<mint>": { usdPrice: number, decimals: number, priceChange24h: number } }
 */

import { TOKEN_MINTS } from "./jupiter";

const PRICE_API = "https://lite-api.jup.ag/price/v3";

export interface TokenPricesUsd {
  sol: number;
  pbtc: number;
  usdc: number;
}

interface PriceEntry {
  usdPrice?: number;
}

export async function fetchTokenPricesUsd(): Promise<TokenPricesUsd> {
  const ids = [TOKEN_MINTS.SOL, TOKEN_MINTS.PBTC, TOKEN_MINTS.USDC].join(",");
  const res = await fetch(`${PRICE_API}?ids=${ids}`);
  if (!res.ok) {
    throw new Error(`Jupiter price fetch failed: ${res.statusText}`);
  }
  const data = (await res.json()) as Record<string, PriceEntry>;
  const price = (mint: string) => Number(data?.[mint]?.usdPrice ?? 0);

  return {
    sol: price(TOKEN_MINTS.SOL),
    pbtc: price(TOKEN_MINTS.PBTC),
    // USDC should be ~1; fall back to 1 if the feed omits it.
    usdc: price(TOKEN_MINTS.USDC) || 1,
  };
}

/** Format a number as a compact USD string, e.g. $1,234.56. */
export function formatUsd(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
