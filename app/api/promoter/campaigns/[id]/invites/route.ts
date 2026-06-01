import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { CampaignMode, GiftStatus, Prisma } from "@prisma/client";
import { readSession } from "@/lib/wallet-session";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * Mirrors `generateGiftCode` in `src/app/api/gifts/route.ts`. We
 * deliberately reuse the same `PT-XXXXXXXX` prefix and alphabet so
 * promoter-minted codes are indistinguishable from organic
 * member-to-member gifts at the `/claim/[code]` page — it dispatches
 * the same fulfillment path either way.
 */
function generateGiftCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(8);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return `PT-${out}`;
}

/**
 * Mint a single one-shot invite code for a UNIQUE_CODES campaign. The
 * caller must be SIWS-authenticated as the campaign's
 * `promoterWallet` (set by a founder via the admin campaigns page).
 *
 * Concurrency strategy:
 *   - We use a serializable transaction to atomically guard the
 *     `claimsUsed < maxClaims` invariant. Without this, two
 *     simultaneous mints near the cap could both pass a stale read
 *     and over-allocate the budget.
 *   - The `code` collision retry loop runs up to 5 attempts; with a
 *     32-char alphabet and 8 chars that's < 1e-12 collision rate per
 *     attempt against the existing pool, so 5 is paranoia.
 *   - Inside the transaction we do an `updateMany` with a where
 *     clause that re-checks the live count, so a serialization
 *     conflict from concurrent mints fails the loser cleanly with a
 *     409 instead of breaching the cap.
 */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await readSession();
  if (!session?.wallet) {
    return NextResponse.json(
      { error: "Sign in with your promoter wallet first." },
      { status: 401 },
    );
  }

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "Missing campaign id." }, { status: 400 });
  }

  const campaign = await prisma.influencerCampaign.findUnique({
    where: { id },
    select: {
      id: true,
      label: true,
      mode: true,
      promoterWallet: true,
      paused: true,
      endsAt: true,
      maxClaims: true,
      claimsUsed: true,
    },
  });
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }
  // Authorize on wallet equality before leaking even shape-of-error
  // information about the campaign (paused, exhausted, expired).
  // 404 instead of 403 keeps the surface minimal for unauthorized
  // probes.
  if (
    campaign.mode !== CampaignMode.UNIQUE_CODES ||
    campaign.promoterWallet !== session.wallet
  ) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }
  if (campaign.paused) {
    return NextResponse.json(
      { error: "This campaign is paused. Contact Purple Club to resume it." },
      { status: 409 },
    );
  }
  if (campaign.endsAt.getTime() <= Date.now()) {
    return NextResponse.json(
      { error: "This campaign has ended. Contact Purple Club to extend it." },
      { status: 409 },
    );
  }
  if (campaign.claimsUsed >= campaign.maxClaims) {
    return NextResponse.json(
      { error: "All invite codes for this campaign have been minted." },
      { status: 409 },
    );
  }

  // Promoter must have a User row so we can stamp `creatorUserId`.
  // The verify endpoint already creates one on first SIWS, but we
  // upsert defensively in case the row was deleted.
  const promoter = await prisma.user.upsert({
    where: { wallet: session.wallet },
    update: {},
    create: { wallet: session.wallet },
    select: { id: true },
  });

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateGiftCode();
    try {
      const minted = await prisma.$transaction(async (tx) => {
        // Re-check live count inside the txn and increment in one
        // statement. `updateMany` only touches the row if the
        // `claimsUsed < maxClaims` predicate is still true; on a
        // race the loser's `count === 0` and we throw to trigger
        // the friendly 409 below.
        const advance = await tx.influencerCampaign.updateMany({
          where: {
            id: campaign.id,
            paused: false,
            endsAt: { gt: new Date() },
            claimsUsed: { lt: campaign.maxClaims },
          },
          data: { claimsUsed: { increment: 1 } },
        });
        if (advance.count === 0) {
          throw new CampaignExhaustedError();
        }
        return tx.giftClaim.create({
          data: {
            code,
            creatorUserId: promoter.id,
            status: GiftStatus.CREATED,
            campaignId: campaign.id,
          },
          select: {
            id: true,
            code: true,
            status: true,
            createdAt: true,
            campaignId: true,
          },
        });
      });

      const origin =
        process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
      return NextResponse.json({
        gift: minted,
        claimUrl: origin ? `${origin}/claim/${minted.code}` : `/claim/${minted.code}`,
        campaign: {
          id: campaign.id,
          label: campaign.label,
          claimsUsed: campaign.claimsUsed + 1,
          maxClaims: campaign.maxClaims,
        },
      });
    } catch (error) {
      if (error instanceof CampaignExhaustedError) {
        return NextResponse.json(
          { error: "All invite codes for this campaign have been minted." },
          { status: 409 },
        );
      }
      // P2002: unique constraint failure on `code`. Generate a new
      // code and retry. Anything else is fatal.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        continue;
      }
      console.error("[promoter mint] failed:", error);
      return NextResponse.json(
        { error: "Could not mint invite. Please retry." },
        { status: 500 },
      );
    }
  }

  return NextResponse.json(
    { error: "Could not allocate a unique code. Please retry." },
    { status: 500 },
  );
}

class CampaignExhaustedError extends Error {
  constructor() {
    super("CAMPAIGN_EXHAUSTED");
  }
}
