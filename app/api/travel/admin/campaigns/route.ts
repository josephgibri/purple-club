import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { CampaignClaimStatus, CampaignMode } from "@prisma/client";
import { isFounderWallet, readSession } from "@/lib/wallet-session";
import { fulfillCampaignClaim } from "@/lib/gift-fulfillment";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 60;

const CAMPAIGN_SELECT = {
  id: true,
  slug: true,
  label: true,
  notes: true,
  maxClaims: true,
  claimsUsed: true,
  rewardLamports: true,
  endsAt: true,
  paused: true,
  createdByWallet: true,
  mode: true,
  promoterWallet: true,
  createdAt: true,
  updatedAt: true,
} as const;

const CAMPAIGN_WITH_CLAIMS_SELECT = {
  ...CAMPAIGN_SELECT,
  claims: {
    orderBy: { claimedAt: "desc" } as const,
    select: {
      id: true,
      recipientWallet: true,
      recipientEmail: true,
      status: true,
      txSignature: true,
      fulfillmentError: true,
      fulfillmentAttempts: true,
      claimedAt: true,
      fulfilledAt: true,
    },
  },
  // For UNIQUE_CODES campaigns, surface the codes the promoter has
  // minted. Each row maps to a GiftClaim that the recipient redeems
  // through `/claim/{code}`. Empty for legacy PUBLIC_SLUG campaigns.
  giftClaims: {
    orderBy: { createdAt: "desc" } as const,
    select: {
      id: true,
      code: true,
      status: true,
      recipientWallet: true,
      recipientEmail: true,
      createdAt: true,
      claimedAt: true,
      fulfilledAt: true,
      txSignature: true,
    },
  },
} as const;

async function ensureFounder() {
  const session = await readSession();
  if (!session?.wallet) {
    return {
      error: NextResponse.json({ error: "Wallet authentication required." }, { status: 401 }),
    };
  }
  if (!isFounderWallet(session.wallet)) {
    return {
      error: NextResponse.json({ error: "Founder access required." }, { status: 403 }),
    };
  }
  return { session };
}

function generateSlug() {
  return crypto.randomBytes(8).toString("base64url");
}

export async function GET() {
  const guard = await ensureFounder();
  if (guard.error) return guard.error;

  const campaigns = await prisma.influencerCampaign.findMany({
    orderBy: [{ paused: "asc" }, { createdAt: "desc" }],
    select: CAMPAIGN_WITH_CLAIMS_SELECT,
  });
  return NextResponse.json({ campaigns });
}

export async function POST(req: Request) {
  const guard = await ensureFounder();
  if (guard.error) return guard.error;

  const body = (await req.json().catch(() => null)) as
    | {
        label?: string;
        notes?: string;
        maxClaims?: number;
        endsAt?: string;
        rewardPbtc?: number;
        mode?: CampaignMode;
        promoterWallet?: string | null;
      }
    | null;

  if (!body?.label || typeof body.label !== "string") {
    return NextResponse.json({ error: "label is required." }, { status: 400 });
  }
  if (!body.maxClaims || body.maxClaims <= 0 || body.maxClaims > 100_000) {
    return NextResponse.json({ error: "maxClaims must be between 1 and 100000." }, { status: 400 });
  }
  if (!body.endsAt) {
    return NextResponse.json({ error: "endsAt is required." }, { status: 400 });
  }
  const endsAt = new Date(body.endsAt);
  if (Number.isNaN(endsAt.getTime()) || endsAt.getTime() <= Date.now()) {
    return NextResponse.json({ error: "endsAt must be a future date." }, { status: 400 });
  }

  const rewardPbtc = body.rewardPbtc ?? 1;
  if (rewardPbtc <= 0 || rewardPbtc > 10) {
    return NextResponse.json({ error: "rewardPbtc must be between 0 and 10." }, { status: 400 });
  }
  const rewardLamports = (BigInt(Math.round(rewardPbtc * 1_000_000)) * 1_000n).toString();

  // Default to legacy PUBLIC_SLUG so old admin clients (or curl-driven
  // automation) keep working without explicitly passing `mode`.
  const mode: CampaignMode =
    body.mode === CampaignMode.UNIQUE_CODES
      ? CampaignMode.UNIQUE_CODES
      : CampaignMode.PUBLIC_SLUG;

  // UNIQUE_CODES requires a promoter wallet — that's the wallet allowed
  // to sign in at /promoter and mint codes. Without it the campaign
  // would be unreachable to the promoter and the codes couldn't be
  // issued. For PUBLIC_SLUG we ignore the field entirely (it's just
  // metadata noise), and we trim any input so a stray space doesn't
  // break SIWS comparison.
  const trimmedPromoter =
    typeof body.promoterWallet === "string" ? body.promoterWallet.trim() : "";
  if (mode === CampaignMode.UNIQUE_CODES && !trimmedPromoter) {
    return NextResponse.json(
      {
        error:
          "promoterWallet is required for UNIQUE_CODES campaigns — paste the influencer's Solana wallet address.",
      },
      { status: 400 },
    );
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = generateSlug();
    const exists = await prisma.influencerCampaign.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (exists) continue;
    const created = await prisma.influencerCampaign.create({
      data: {
        slug,
        label: body.label.trim().slice(0, 120),
        notes: body.notes?.trim()?.slice(0, 500) || null,
        maxClaims: body.maxClaims,
        endsAt,
        rewardLamports,
        createdByWallet: guard.session.wallet,
        mode,
        promoterWallet:
          mode === CampaignMode.UNIQUE_CODES ? trimmedPromoter : null,
      },
      select: CAMPAIGN_SELECT,
    });
    return NextResponse.json({ campaign: created });
  }

  return NextResponse.json({ error: "Could not allocate a slug. Please retry." }, { status: 500 });
}

export async function PATCH(req: Request) {
  const guard = await ensureFounder();
  if (guard.error) return guard.error;

  const body = (await req.json().catch(() => null)) as
    | {
        id?: string;
        action?:
          | "pause"
          | "resume"
          | "extend"
          | "retry_claim"
          | "update_promoter";
        endsAt?: string;
        claimId?: string;
        promoterWallet?: string | null;
      }
    | null;

  if (!body?.action) {
    return NextResponse.json({ error: "action is required." }, { status: 400 });
  }

  if (body.action === "retry_claim") {
    const claimId = body.claimId?.trim();
    if (!claimId) {
      return NextResponse.json({ error: "claimId is required to retry." }, { status: 400 });
    }
    const existingClaim = await prisma.influencerCampaignClaim.findUnique({
      where: { id: claimId },
      select: { id: true, status: true, fulfillmentStartedAt: true },
    });
    if (!existingClaim) {
      return NextResponse.json({ error: "Claim not found." }, { status: 404 });
    }
    // Same stuck-FULFILLING recovery as the gift admin route — see
    // src/app/api/travel/admin/gifts/route.ts for the rationale.
    const STUCK_FULFILLING_MS = 10 * 60 * 1000;
    const isStuckFulfilling =
      existingClaim.status === CampaignClaimStatus.FULFILLING &&
      (existingClaim.fulfillmentStartedAt === null ||
        existingClaim.fulfillmentStartedAt.getTime() <
          Date.now() - STUCK_FULFILLING_MS);
    if (
      existingClaim.status !== CampaignClaimStatus.FULFILLMENT_FAILED &&
      existingClaim.status !== CampaignClaimStatus.CLAIMED &&
      !isStuckFulfilling
    ) {
      return NextResponse.json(
        {
          error:
            existingClaim.status === CampaignClaimStatus.FULFILLING
              ? "Fulfillment is in progress — wait a few minutes before retrying."
              : "Only claimed/failed campaign claims can be retried.",
        },
        { status: 409 },
      );
    }
    if (
      existingClaim.status === CampaignClaimStatus.FULFILLMENT_FAILED ||
      isStuckFulfilling
    ) {
      await prisma.influencerCampaignClaim.update({
        where: { id: existingClaim.id },
        data: {
          status: CampaignClaimStatus.CLAIMED,
          fulfillmentStartedAt: null,
          fulfillmentError: null,
        },
      });
    }
    const result = await fulfillCampaignClaim(existingClaim.id);
    const refreshed = await prisma.influencerCampaignClaim.findUnique({
      where: { id: existingClaim.id },
      select: {
        id: true,
        status: true,
        txSignature: true,
        fulfillmentError: true,
        fulfillmentAttempts: true,
        fulfilledAt: true,
        recipientWallet: true,
      },
    });
    return NextResponse.json({
      claim: refreshed,
      fulfillment: result.ok
        ? { ok: true, signature: result.signature }
        : { ok: false, reason: result.reason },
    });
  }

  if (!body.id) {
    return NextResponse.json({ error: "id is required." }, { status: 400 });
  }

  const existing = await prisma.influencerCampaign.findUnique({
    where: { id: body.id },
    select: { id: true, paused: true, mode: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }

  if (body.action === "update_promoter") {
    if (existing.mode !== CampaignMode.UNIQUE_CODES) {
      return NextResponse.json(
        {
          error:
            "Promoter wallets only apply to UNIQUE_CODES campaigns — switch the mode first.",
        },
        { status: 400 },
      );
    }
    const trimmedPromoter =
      typeof body.promoterWallet === "string" ? body.promoterWallet.trim() : "";
    if (!trimmedPromoter) {
      return NextResponse.json(
        { error: "promoterWallet is required." },
        { status: 400 },
      );
    }
    const updated = await prisma.influencerCampaign.update({
      where: { id: body.id },
      data: { promoterWallet: trimmedPromoter },
      select: CAMPAIGN_SELECT,
    });
    return NextResponse.json({ campaign: updated });
  }

  if (body.action === "pause" || body.action === "resume") {
    const updated = await prisma.influencerCampaign.update({
      where: { id: body.id },
      data: { paused: body.action === "pause" },
      select: CAMPAIGN_SELECT,
    });
    return NextResponse.json({ campaign: updated });
  }

  if (body.action === "extend") {
    if (!body.endsAt) {
      return NextResponse.json({ error: "endsAt is required to extend." }, { status: 400 });
    }
    const newEndsAt = new Date(body.endsAt);
    if (Number.isNaN(newEndsAt.getTime()) || newEndsAt.getTime() <= Date.now()) {
      return NextResponse.json({ error: "endsAt must be a future date." }, { status: 400 });
    }
    const updated = await prisma.influencerCampaign.update({
      where: { id: body.id },
      data: { endsAt: newEndsAt },
      select: CAMPAIGN_SELECT,
    });
    return NextResponse.json({ campaign: updated });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}

export async function DELETE(req: Request) {
  const guard = await ensureFounder();
  if (guard.error) return guard.error;

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id query is required." }, { status: 400 });
  }

  const claimsCount = await prisma.influencerCampaignClaim.count({
    where: {
      campaignId: id,
      status: { in: [CampaignClaimStatus.FULFILLED, CampaignClaimStatus.FULFILLING] },
    },
  });
  if (claimsCount > 0) {
    return NextResponse.json(
      { error: "Cannot delete a campaign with delivered or in-flight claims. Pause instead." },
      { status: 409 },
    );
  }

  // For UNIQUE_CODES campaigns the codes are GiftClaim rows. Refuse
  // delete if any have been minted at all — even unclaimed CREATED
  // codes are typically already in invitee inboxes, and dropping the
  // campaign would null out their `campaignId` attribution and leak
  // the budget back into the global pool.
  const giftCount = await prisma.giftClaim.count({ where: { campaignId: id } });
  if (giftCount > 0) {
    return NextResponse.json(
      {
        error:
          "Cannot delete a campaign that has minted invite codes. Pause instead.",
      },
      { status: 409 },
    );
  }

  await prisma.influencerCampaign.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
