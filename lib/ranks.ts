/**
 * The Purple Court — member ranks that reflect on-chain PBTC held.
 *
 * Ranks are STATUS ONLY: identity, recognition, access. They are never
 * financial promises — no airdrops, yield, rate boosts, or voting
 * rights are tied to a tier. They are also private: a holder sees their
 * own rank, it is not a public leaderboard.
 *
 * Tier names were updated Jun 2026 to align with the Purple Club brand.
 * Thresholds and the getRank() logic are unchanged.
 *
 * 7-day hold enforcement lives in the dedicated social/bot layer, not here.
 * The web app always derives rank from the live balance — instant feedback.
 * Sovereign is a founding tier assigned by an env allowlist rather than by balance.
 */

export type RankTier = {
  title: string;
  /** Minimum whole PBTC required for the tier (inclusive). */
  min: number;
  /** Short, status-only flavor line shown on the dashboard. */
  blurb: string;
};

export const PURPLE_COURT: readonly RankTier[] = [
  { title: "Initiate",  min: 1,         blurb: "You hold the asset. You're inside the club." },
  { title: "Patron",    min: 1_000,     blurb: "Past the first gate. Standing earned." },
  { title: "Champion",  min: 10_000,    blurb: "A proven hand in the realm." },
  { title: "Guardian",  min: 25_000,    blurb: "You help hold the line." },
  { title: "Commander", min: 50_000,    blurb: "A name the club recognizes." },
  { title: "Regent",    min: 100_000,   blurb: "Among the highest houses of Purple." },
  { title: "Royal",     min: 250_000,   blurb: "The royal line of PBTC." },
] as const;

export const SOVEREIGN: RankTier = {
  title: "Sovereign",
  min: Number.POSITIVE_INFINITY,
  blurb: "Founding tier. The club starts with you.",
};

/**
 * Founding Sovereign wallets, set via env as a comma-separated list of
 * base58 pubkeys. Kept out of the balance ladder on purpose.
 */
const SOVEREIGN_WALLETS = new Set(
  (process.env.NEXT_PUBLIC_SOVEREIGN_WALLETS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);

export function isSovereign(walletAddress?: string | null): boolean {
  return Boolean(walletAddress && SOVEREIGN_WALLETS.has(walletAddress));
}

export type RankResult = {
  /** The tier the holder currently sits in (null if below 1 PBTC). */
  current: RankTier | null;
  /** The next tier up, or null if already at the top of the ladder. */
  next: RankTier | null;
  /** 0–1 progress from the current tier's floor to the next tier's floor. */
  progress: number;
};

/**
 * Resolve a holder's rank from their live balance (and optional wallet
 * for the Sovereign allowlist). Pure — safe for server or client.
 */
export function getRank(balance: number, walletAddress?: string | null): RankResult {
  if (isSovereign(walletAddress)) {
    return { current: SOVEREIGN, next: null, progress: 1 };
  }

  if (balance < PURPLE_COURT[0].min) {
    return { current: null, next: PURPLE_COURT[0], progress: 0 };
  }

  let currentIndex = 0;
  for (let i = 0; i < PURPLE_COURT.length; i += 1) {
    if (balance >= PURPLE_COURT[i].min) {
      currentIndex = i;
    }
  }

  const current = PURPLE_COURT[currentIndex];
  const next = PURPLE_COURT[currentIndex + 1] ?? null;

  if (!next) {
    return { current, next: null, progress: 1 };
  }

  const span = next.min - current.min;
  const progress = span > 0 ? Math.min(1, Math.max(0, (balance - current.min) / span)) : 1;
  return { current, next, progress };
}
