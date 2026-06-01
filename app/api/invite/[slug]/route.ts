import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { CampaignClaimStatus } from "@prisma/client";
import { getPbtcBalance, readSession } from "@/lib/wallet-session";
import { fulfillCampaignClaim } from "@/lib/gift-fulfillment";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 60;

function clientIp(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

function hashIp(ip: string) {
  const salt = process.env.IP_HASH_SALT ?? "purple-stay";
  return crypto.createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

function publicCampaignDto(campaign: {
  slug: string;
  label: string;
  maxClaims: number;
  claimsUsed: number;
  rewardLamports: string;
  endsAt: Date;
  paused: boolean;
}) {
  const ended = campaign.endsAt.getTime() < Date.now();
  const exhausted = campaign.claimsUsed >= campaign.maxClaims;
  return {
    slug: campaign.slug,
    label: campaign.label,
    maxClaims: campaign.maxClaims,
    claimsUsed: campaign.claimsUsed,
    rewardLamports: campaign.rewardLamports,
    endsAt: campaign.endsAt.toISOString(),
    paused: campaign.paused,
    state: campaign.paused
      ? "paused"
      : ended
        ? "ended"
        : exhausted
          ? "exhausted"
          : "live",
  } as const;
}

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  if (!slug) {
    return NextResponse.json({ error: "Missing campaign slug." }, { status: 400 });
  }
  const campaign = await prisma.influencerCampaign.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      label: true,
      maxClaims: true,
      claimsUsed: true,
      rewardLamports: true,
      endsAt: true,
      paused: true,
    },
  });
  if (!campaign) {
    return NextResponse.json({ error: "This invite link is not valid." }, { status: 404 });
  }
  return NextResponse.json({ campaign: publicCampaignDto(campaign) });
}

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const session = await readSession();
  if (!session?.wallet) {
    return NextResponse.json(
      { error: "Connect your Solana wallet first." },
      { status: 401 },
    );
  }
  const { slug } = await ctx.params;

  const campaign = await prisma.influencerCampaign.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      label: true,
      maxClaims: true,
      claimsUsed: true,
      rewardLamports: true,
      endsAt: true,
      paused: true,
    },
  });
  if (!campaign) {
    return NextResponse.json({ error: "This invite link is not valid." }, { status: 404 });
  }
  if (campaign.paused) {
    return NextResponse.json({ error: "This campaign is paused." }, { status: 409 });
  }
  if (campaign.endsAt.getTime() < Date.now()) {
    return NextResponse.json({ error: "This invite link has expired." }, { status: 409 });
  }
  if (campaign.claimsUsed >= campaign.maxClaims) {
    return NextResponse.json(
      { error: "This drop has reached its claim limit." },
      { status: 409 },
    );
  }

  // Campaign drops are an onboarding tool — same rule as the gift flow:
  // a wallet that already holds PBTC has no need for the giveaway.
  try {
    const balance = await getPbtcBalance(session.wallet);
    if (balance > 0) {
      return NextResponse.json(
        {
          error:
            "This wallet already holds PBTC. Please connect a wallet that doesn't hold PBTC yet to claim.",
        },
        { status: 400 },
      );
    }
  } catch (error) {
    console.error("[invite] failed to read PBTC balance for claim guard:", error);
  }

  // We still capture an `ipHash` for forensics on the claim record, but
  // intentionally do NOT block per-IP within a campaign. Influencer drops
  // are designed for organic word-of-mouth — households, dorms, mobile
  // CGNAT, and office WiFi all share IPs, and an IP cap punishes exactly
  // the warm spread we want (mom + son, partners, roommates, friend
  // groups). At our current scale the Sybil downside (one farmer cycling
  // fresh wallets from a single IP) is small and bypassed by anyone with
  // a $5 residential proxy anyway. We'd rather eat that risk than block
  // legitimate friend pairs. Long-term fix is the unique-per-recipient
  // code model (see agency-disclosure.md decision log + GiftClaim);
  // until then, keep the gate open.
  const ipHash = hashIp(clientIp(req));

  const recipient = await prisma.user.upsert({
    where: { wallet: session.wallet },
    update: {},
    create: { wallet: session.wallet },
    select: { id: true, email: true },
  });

  let claimId: string | null = null;
  try {
    claimId = await prisma.$transaction(async (tx) => {
      const reserved = await tx.influencerCampaign.updateMany({
        where: {
          id: campaign.id,
          paused: false,
          endsAt: { gt: new Date() },
          claimsUsed: { lt: campaign.maxClaims },
        },
        data: { claimsUsed: { increment: 1 } },
      });
      if (reserved.count === 0) {
        throw new Error("This drop has reached its claim limit or expired.");
      }
      const claim = await tx.influencerCampaignClaim.create({
        data: {
          campaignId: campaign.id,
          recipientUserId: recipient.id,
          recipientWallet: session.wallet,
          status: CampaignClaimStatus.CLAIMED,
          ipHash,
        },
        select: { id: true },
      });
      return claim.id;
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      return NextResponse.json(
        { error: "This wallet has already claimed from this campaign." },
        { status: 409 },
      );
    }
    const message = error instanceof Error ? error.message : "Could not record claim.";
    return NextResponse.json({ error: message }, { status: 409 });
  }

  if (!claimId) {
    return NextResponse.json({ error: "Could not record claim." }, { status: 500 });
  }

  const fulfillment = await fulfillCampaignClaim(claimId).catch((error) => {
    console.error("[invite] auto-fulfill threw:", error);
    return { ok: false, reason: "Auto-fulfillment crashed.", retryable: true } as const;
  });

  const finalClaim = await prisma.influencerCampaignClaim.findUnique({
    where: { id: claimId },
    select: {
      id: true,
      status: true,
      txSignature: true,
      claimedAt: true,
      fulfilledAt: true,
    },
  });

  const refreshed = await prisma.influencerCampaign.findUnique({
    where: { id: campaign.id },
    select: {
      slug: true,
      label: true,
      maxClaims: true,
      claimsUsed: true,
      rewardLamports: true,
      endsAt: true,
      paused: true,
    },
  });

  return NextResponse.json({
    claim: finalClaim,
    campaign: refreshed ? publicCampaignDto(refreshed) : null,
    fulfillment: fulfillment.ok
      ? { ok: true, signature: fulfillment.signature }
      : { ok: false, reason: fulfillment.reason },
  });
}
