/**
 * Tier state machine for the Telegram social layer.
 *
 * Rules:
 *   - Promotions require a 7-day continuous hold at or above the new floor.
 *   - Demotions are immediate (balance drops below current floor → tier drops).
 *   - Eligibility (≥ 1 PBTC) has a 48-hour grace window before kick.
 *     This absorbs transient RPC blips and brief sells.
 */

import { getRank, PURPLE_COURT, SOVEREIGN } from "@/lib/ranks";

export const PROMOTION_HOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const GRACE_WINDOW_MS = 48 * 60 * 60 * 1000;       // 48 hours

export type TierUpdate = {
  /** The tier the live balance qualifies for RIGHT NOW. */
  qualifyingTier: string | null;
  /** The tier that should be displayed / enforced after applying hold rules. */
  effectiveTier: string | null;
  /** A pending promotion waiting on its 7-day hold. */
  pendingTier: string | null;
  pendingSince: Date | null;
  tierSince: Date | null;
  /** True when the user should be kicked (below threshold + past grace). */
  shouldKick: boolean;
  /** True when the effective tier changed (caller should notify member). */
  tierChanged: boolean;
};

type CurrentState = {
  effectiveTier: string | null;
  tierSince: Date | null;
  pendingTier: string | null;
  pendingSince: Date | null;
  belowThresholdSince: Date | null;
  inGroup: boolean;
};

/**
 * Given a live balance and the member's current DB state, compute the
 * next state to write back.
 */
export function computeTierUpdate(
  balance: number,
  state: CurrentState,
  now = new Date(),
): TierUpdate {
  const rank = getRank(balance);
  const qualifyingTier = rank.current?.title ?? null;
  const eligible = balance >= 1;

  // ── Eligibility / kick logic ──────────────────────────────────────────────
  let shouldKick = false;
  let belowThresholdSince = state.belowThresholdSince;

  if (!eligible) {
    if (!belowThresholdSince) {
      belowThresholdSince = now; // start the grace clock
    } else if (now.getTime() - belowThresholdSince.getTime() > GRACE_WINDOW_MS) {
      shouldKick = true;
    }
  } else {
    belowThresholdSince = null; // reset grace clock on recovery
  }

  if (shouldKick) {
    return {
      qualifyingTier: null,
      effectiveTier: null,
      pendingTier: null,
      pendingSince: null,
      tierSince: null,
      shouldKick: true,
      tierChanged: state.effectiveTier !== null,
    };
  }

  if (!eligible) {
    // Grace window in progress — keep current tier display, don't promote.
    return {
      qualifyingTier,
      effectiveTier: state.effectiveTier,
      pendingTier: state.pendingTier,
      pendingSince: state.pendingSince,
      tierSince: state.tierSince,
      shouldKick: false,
      tierChanged: false,
    };
  }

  // ── Demotion (immediate) ──────────────────────────────────────────────────
  const currentFloor = tierFloor(state.effectiveTier);
  if (balance < currentFloor) {
    // Drop to the qualifying tier immediately, clear any pending promotion.
    return {
      qualifyingTier,
      effectiveTier: qualifyingTier,
      pendingTier: null,
      pendingSince: null,
      tierSince: now,
      shouldKick: false,
      tierChanged: state.effectiveTier !== qualifyingTier,
    };
  }

  // ── Promotion (7-day hold) ────────────────────────────────────────────────
  const qualifyingFloor = tierFloor(qualifyingTier);
  const currentEffectiveFloor = tierFloor(state.effectiveTier);

  if (qualifyingFloor > currentEffectiveFloor) {
    // A higher tier is reachable.
    if (state.pendingTier === qualifyingTier && state.pendingSince) {
      // Already holding — check if the 7-day window has passed.
      const elapsed = now.getTime() - state.pendingSince.getTime();
      if (elapsed >= PROMOTION_HOLD_MS) {
        return {
          qualifyingTier,
          effectiveTier: qualifyingTier,
          pendingTier: null,
          pendingSince: null,
          tierSince: now,
          shouldKick: false,
          tierChanged: true,
        };
      }
      // Still in hold — no change.
      return {
        qualifyingTier,
        effectiveTier: state.effectiveTier,
        pendingTier: state.pendingTier,
        pendingSince: state.pendingSince,
        tierSince: state.tierSince,
        shouldKick: false,
        tierChanged: false,
      };
    }

    // New promotion candidate — start the hold clock.
    return {
      qualifyingTier,
      effectiveTier: state.effectiveTier ?? qualifyingTier,
      pendingTier: qualifyingTier,
      pendingSince: now,
      tierSince: state.tierSince ?? now,
      shouldKick: false,
      // Assign the qualifying tier immediately if this is a first-time link
      tierChanged: state.effectiveTier === null,
    };
  }

  // ── No change ─────────────────────────────────────────────────────────────
  // Balance meets current tier, no promotion pending.
  return {
    qualifyingTier,
    effectiveTier: state.effectiveTier ?? qualifyingTier,
    pendingTier: null,
    pendingSince: null,
    tierSince: state.tierSince ?? now,
    shouldKick: false,
    tierChanged: state.effectiveTier === null,
  };
}

/** Minimum PBTC balance for a named tier (0 for null/unknown). */
function tierFloor(tier: string | null | undefined): number {
  if (!tier) return 0;
  if (tier === SOVEREIGN.title) return Number.MAX_SAFE_INTEGER;
  return PURPLE_COURT.find((t) => t.title === tier)?.min ?? 0;
}
