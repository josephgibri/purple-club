/**
 * Single source of truth for brand strings, the PBTC asset, and the
 * surface URLs the consolidated Purple Club shell links out to.
 *
 * Internal routes: You, Community, Stays, Places.
 * Lending, OTC, and the weekly lottery are not part of the club.
 */

export const BRAND_NAME = "Purple Club";
export const BRAND_TAGLINE = "Members-only network for PBTC holders";

export const PRODUCT_NAME = "Purple Bitcoin";
export const PRODUCT_TICKER = "PBTC";
export const PBTC_TOTAL_SUPPLY_WHOLE = 21_000_000;

export const PBTC_MINT_ADDRESS =
  process.env.NEXT_PUBLIC_PBTC_MINT ?? "HfMbPyDdZH6QMaDDUokjYCkHxzjoGBMpgaUvpLWGbF5p";

// Jupiter "buy" deep link. The `?buy=<mint>` form preselects PBTC as the
// output token (the legacy `/swap/SOL-<mint>` path did not reliably preselect
// PBTC and could land on USDC-SOL). Overridable via env for staging.
export const JUPITER_SWAP_URL =
  process.env.NEXT_PUBLIC_JUPITER_SWAP_URL ??
  `https://jup.ag/?utm_source=phantom&utm_medium=list&buy=${PBTC_MINT_ADDRESS}`;

export const SOLSCAN_TOKEN_URL = `https://solscan.io/token/${PBTC_MINT_ADDRESS}`;
export const SOLSCAN_BURN_ACTIVITY_URL = `${SOLSCAN_TOKEN_URL}?activity_type=ACTIVITY_SPL_BURN`;

/**
 * Surface URLs. Internal routes are relative so they work on any
 * deploy (preview or prod); external surfaces are absolute and
 * overridable via env for staging.
 */
export const SURFACE_URLS = {
  stay: "/stay",
  places: "/places",
  perks: "/places",
  account: "/account",
  community: "/community",
  council: "/council",
} as const;

/**
 * The only burn the club talks about. Funded by the travel partner,
 * from booking value. Not a club fee, and not a deflation claim.
 */
export const BURN_SOURCES = [
  { label: "Of booking value, funded by the travel partner", value: "0.25%" },
] as const;
