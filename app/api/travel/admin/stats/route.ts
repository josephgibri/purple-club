import { NextResponse } from "next/server";
import { Connection, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAccount,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  CampaignClaimStatus,
  GiftStatus,
} from "@prisma/client";
import { isFounderWallet, readSession } from "@/lib/wallet-session";
import { prisma } from "@/lib/prisma";
import { getPbtcMintAddress, getRpcUrl } from "@/lib/pbtc";
import { getTreasuryPublicKey } from "@/lib/treasury";

export const runtime = "nodejs";

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

type GiftCounts = Record<GiftStatus, number>;
type CampaignClaimCounts = Record<CampaignClaimStatus, number>;

function emptyGiftCounts(): GiftCounts {
  return {
    [GiftStatus.CREATED]: 0,
    [GiftStatus.CLAIMED]: 0,
    [GiftStatus.FULFILLING]: 0,
    [GiftStatus.FULFILLED]: 0,
    [GiftStatus.FULFILLMENT_FAILED]: 0,
    [GiftStatus.REJECTED]: 0,
  };
}

function emptyCampaignClaimCounts(): CampaignClaimCounts {
  return {
    [CampaignClaimStatus.CLAIMED]: 0,
    [CampaignClaimStatus.FULFILLING]: 0,
    [CampaignClaimStatus.FULFILLED]: 0,
    [CampaignClaimStatus.FULFILLMENT_FAILED]: 0,
  };
}

async function readTreasuryBalances() {
  try {
    const connection = new Connection(getRpcUrl(), "confirmed");
    const treasury = getTreasuryPublicKey();
    const mint = getPbtcMintAddress();

    const ata = getAssociatedTokenAddressSync(
      mint,
      treasury,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );

    const [solLamports, pbtcAccount] = await Promise.all([
      connection.getBalance(treasury, "confirmed"),
      getAccount(connection, ata, "confirmed", TOKEN_PROGRAM_ID).catch(() => null),
    ]);

    return {
      ok: true as const,
      treasuryWallet: treasury.toBase58(),
      treasuryAta: ata.toBase58(),
      solLamports: solLamports.toString(),
      solBalance: solLamports / LAMPORTS_PER_SOL,
      pbtcLamports: pbtcAccount ? pbtcAccount.amount.toString() : "0",
      pbtcAtaExists: Boolean(pbtcAccount),
    };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Treasury read failed.",
    };
  }
}

export async function GET() {
  const guard = await ensureFounder();
  if (guard.error) return guard.error;

  const now = new Date();

  const [giftStatusGroups, campaigns, campaignClaimGroups, failedGifts, failedClaims] =
    await Promise.all([
      prisma.giftClaim.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
      prisma.influencerCampaign.findMany({
        select: {
          id: true,
          slug: true,
          label: true,
          maxClaims: true,
          claimsUsed: true,
          rewardLamports: true,
          paused: true,
          endsAt: true,
        },
      }),
      prisma.influencerCampaignClaim.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
      prisma.giftClaim.findMany({
        where: { status: GiftStatus.FULFILLMENT_FAILED },
        orderBy: { fulfillmentStartedAt: "desc" },
        take: 25,
        select: {
          id: true,
          code: true,
          recipientWallet: true,
          fulfillmentError: true,
          fulfillmentAttempts: true,
          fulfillmentStartedAt: true,
          claimedAt: true,
        },
      }),
      prisma.influencerCampaignClaim.findMany({
        where: { status: CampaignClaimStatus.FULFILLMENT_FAILED },
        orderBy: { fulfillmentStartedAt: "desc" },
        take: 25,
        select: {
          id: true,
          recipientWallet: true,
          fulfillmentError: true,
          fulfillmentAttempts: true,
          fulfillmentStartedAt: true,
          claimedAt: true,
          campaign: { select: { slug: true, label: true } },
        },
      }),
    ]);

  const giftCounts = emptyGiftCounts();
  let giftTotal = 0;
  for (const row of giftStatusGroups) {
    giftCounts[row.status] = row._count._all;
    giftTotal += row._count._all;
  }

  const campaignClaimCounts = emptyCampaignClaimCounts();
  let campaignClaimTotal = 0;
  for (const row of campaignClaimGroups) {
    campaignClaimCounts[row.status] = row._count._all;
    campaignClaimTotal += row._count._all;
  }

  let activeCampaigns = 0;
  let pausedCampaigns = 0;
  let endedCampaigns = 0;
  let totalClaimsCap = 0;
  let totalClaimsUsed = 0;
  let maxRewardLamports = 0n;
  for (const c of campaigns) {
    totalClaimsCap += c.maxClaims;
    totalClaimsUsed += c.claimsUsed;
    try {
      const r = BigInt(c.rewardLamports);
      if (r > maxRewardLamports) maxRewardLamports = r;
    } catch {
    }
    const ended = c.endsAt.getTime() <= now.getTime();
    if (c.paused) {
      pausedCampaigns += 1;
    } else if (ended) {
      endedCampaigns += 1;
    } else {
      activeCampaigns += 1;
    }
  }

  const treasury = await readTreasuryBalances();

  return NextResponse.json(
    {
      generatedAt: now.toISOString(),
      gifts: {
        total: giftTotal,
        byStatus: giftCounts,
      },
      campaigns: {
        total: campaigns.length,
        active: activeCampaigns,
        paused: pausedCampaigns,
        ended: endedCampaigns,
        claimsUsed: totalClaimsUsed,
        claimsCap: totalClaimsCap,
        claims: {
          total: campaignClaimTotal,
          byStatus: campaignClaimCounts,
        },
        maxRewardLamports: maxRewardLamports.toString(),
      },
      treasury,
      failures: {
        gifts: failedGifts,
        campaignClaims: failedClaims,
      },
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
