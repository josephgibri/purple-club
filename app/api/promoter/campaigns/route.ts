import { NextResponse } from "next/server";
import { CampaignMode } from "@prisma/client";
import { readSession } from "@/lib/wallet-session";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * Promoter portal — list campaigns owned by the SIWS-authenticated
 * wallet.
 *
 * The promoter wallet is set by a founder via the admin campaigns page
 * (POST/PATCH `/api/travel/admin/campaigns`). This endpoint never
 * exposes campaigns the caller doesn't own — there's no admin
 * "impersonate" path here, so the only way to see a campaign is to
 * sign in with the wallet that was assigned at creation time.
 *
 * We also restrict to UNIQUE_CODES — the legacy PUBLIC_SLUG flow has
 * no per-invitee codes, so it has nothing for the promoter to do
 * here. Returning a PUBLIC_SLUG campaign would be confusing UX and
 * risks the promoter "minting" against a campaign that has no portal.
 */
export async function GET() {
  const session = await readSession();
  if (!session?.wallet) {
    return NextResponse.json(
      { error: "Sign in with the wallet Purple Club assigned to your campaign." },
      { status: 401 },
    );
  }

  const campaigns = await prisma.influencerCampaign.findMany({
    where: {
      mode: CampaignMode.UNIQUE_CODES,
      promoterWallet: session.wallet,
    },
    orderBy: [{ paused: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      label: true,
      notes: true,
      maxClaims: true,
      claimsUsed: true,
      rewardLamports: true,
      endsAt: true,
      paused: true,
      createdAt: true,
      // Promoter sees their own minted codes — never another
      // promoter's. The relation is already campaign-scoped, so this
      // is safe even with multiple campaigns under one wallet.
      giftClaims: {
        orderBy: { createdAt: "desc" } as const,
        take: 50,
        select: {
          id: true,
          code: true,
          status: true,
          recipientWallet: true,
          createdAt: true,
          claimedAt: true,
          fulfilledAt: true,
        },
      },
    },
  });

  return NextResponse.json({ campaigns });
}
