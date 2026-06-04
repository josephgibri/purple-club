/**
 * Founding-member registry.
 *
 * The first {@link getFoundingLimit} wallets observed holding >= 1 PBTC (after
 * this shipped) are recorded with a locked sequence number. Membership never
 * reshuffles once assigned. The "Founding Member" seal is shown only while the
 * wallet still holds >= 1 PBTC — that gate lives at the display layer, not here.
 */
import { prisma } from "@/lib/prisma";

const DEFAULT_FOUNDING_LIMIT = 200;

export function getFoundingLimit(): number {
  const raw = Number(process.env.FOUNDING_MEMBER_LIMIT);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_FOUNDING_LIMIT;
}

export type FoundingStatus = {
  founding: boolean;
  /** 1-based arrival position, or null if the wallet never claimed a slot. */
  seq: number | null;
  limit: number;
};

/**
 * Records `wallet` as a founding member if slots remain and it isn't already
 * recorded. Idempotent and safe to call on every verified sign-in. Returns the
 * wallet's sequence number, or null if all slots are taken. Only call this once
 * the wallet is verified AND confirmed to hold >= 1 PBTC.
 */
export async function claimFoundingSlot(wallet: string): Promise<number | null> {
  const existing = await prisma.foundingMember.findUnique({ where: { wallet } });
  if (existing) return existing.seq;

  const limit = getFoundingLimit();

  // A couple of retries absorb the rare seq collision when two new wallets
  // verify at the same instant (seq is @unique, so one create loses the race).
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const seq = await prisma.$transaction(async (tx) => {
        const count = await tx.foundingMember.count();
        if (count >= limit) return null;
        const created = await tx.foundingMember.create({
          data: { wallet, seq: count + 1 },
        });
        return created.seq;
      });
      return seq;
    } catch {
      // Either this wallet got recorded by a concurrent call, or a seq
      // collision occurred. Re-read; if we're now recorded, return it.
      const after = await prisma.foundingMember.findUnique({ where: { wallet } });
      if (after) return after.seq;
      // Otherwise it was a seq collision for a *different* wallet — retry.
    }
  }
  return null;
}

export async function getFoundingStatus(wallet: string): Promise<FoundingStatus> {
  const limit = getFoundingLimit();
  const record = await prisma.foundingMember.findUnique({ where: { wallet } });
  if (!record) return { founding: false, seq: null, limit };
  return { founding: record.seq <= limit, seq: record.seq, limit };
}
