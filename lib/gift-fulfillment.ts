import { GiftStatus, CampaignClaimStatus } from "@prisma/client";
import { PublicKey } from "@solana/web3.js";
import { prisma } from "./prisma";
import { transferPbtcFromTreasury } from "./treasury";
import { dispatchNotification } from "./notifications";

const STALE_LOCK_MS = 2 * 60 * 1000;
const MAX_FULFILLMENT_ATTEMPTS = 5;

export type FulfillResult =
  | { ok: true; signature: string }
  | { ok: false; reason: string; retryable: boolean };

function isValidSolanaWallet(wallet: string | null | undefined): wallet is string {
  if (!wallet) return false;
  try {
    new PublicKey(wallet);
    return true;
  } catch {
    return false;
  }
}

export async function fulfillGiftClaim(giftId: string): Promise<FulfillResult> {
  const claimedLock = await prisma.giftClaim.updateMany({
    where: {
      id: giftId,
      status: GiftStatus.CLAIMED,
      fulfillmentAttempts: { lt: MAX_FULFILLMENT_ATTEMPTS },
      OR: [
        { fulfillmentStartedAt: null },
        { fulfillmentStartedAt: { lt: new Date(Date.now() - STALE_LOCK_MS) } },
      ],
    },
    data: {
      status: GiftStatus.FULFILLING,
      fulfillmentStartedAt: new Date(),
      fulfillmentAttempts: { increment: 1 },
    },
  });

  if (claimedLock.count === 0) {
    return {
      ok: false,
      reason: `Already in progress, not in CLAIMED state, or reached ${MAX_FULFILLMENT_ATTEMPTS} fulfillment attempts.`,
      retryable: false,
    };
  }

  const gift = await prisma.giftClaim.findUnique({
    where: { id: giftId },
    select: {
      id: true,
      code: true,
      recipientWallet: true,
      recipientEmail: true,
      creator: { select: { email: true } },
    },
  });

  if (!isValidSolanaWallet(gift?.recipientWallet)) {
    await prisma.giftClaim.update({
      where: { id: giftId },
      data: {
        status: GiftStatus.FULFILLMENT_FAILED,
        fulfillmentError: "Missing or invalid recipient wallet.",
      },
    });
    return { ok: false, reason: "Missing or invalid recipient wallet.", retryable: false };
  }

  try {
    const result = await transferPbtcFromTreasury({
      recipientWallet: gift.recipientWallet,
    });

    await prisma.giftClaim.update({
      where: { id: giftId },
      data: {
        status: GiftStatus.FULFILLED,
        txSignature: result.signature,
        fulfilledAt: new Date(),
        fulfillmentError: null,
      },
    });

    void dispatchNotification({
      event: "gift_fulfilled",
      member: { email: gift.creator?.email ?? null },
      context: {
        requestCode: gift.code,
        giftCode: gift.code,
        giftRecipientWallet: gift.recipientWallet,
        giftRecipientEmail: gift.recipientEmail ?? null,
        giftTxSignature: result.signature,
      },
    });

    return { ok: true, signature: result.signature };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown transfer error.";
    console.error(`[gift-fulfillment] failed for ${giftId}:`, error);
    await prisma.giftClaim.update({
      where: { id: giftId },
      data: {
        status: GiftStatus.FULFILLMENT_FAILED,
        fulfillmentError: message.slice(0, 500),
      },
    });
    return { ok: false, reason: message, retryable: true };
  }
}

export async function fulfillCampaignClaim(claimId: string): Promise<FulfillResult> {
  const lock = await prisma.influencerCampaignClaim.updateMany({
    where: {
      id: claimId,
      status: CampaignClaimStatus.CLAIMED,
      fulfillmentAttempts: { lt: MAX_FULFILLMENT_ATTEMPTS },
      OR: [
        { fulfillmentStartedAt: null },
        { fulfillmentStartedAt: { lt: new Date(Date.now() - STALE_LOCK_MS) } },
      ],
    },
    data: {
      status: CampaignClaimStatus.FULFILLING,
      fulfillmentStartedAt: new Date(),
      fulfillmentAttempts: { increment: 1 },
    },
  });

  if (lock.count === 0) {
    return {
      ok: false,
      reason: `Already in progress, not in CLAIMED state, or reached ${MAX_FULFILLMENT_ATTEMPTS} fulfillment attempts.`,
      retryable: false,
    };
  }

  const claim = await prisma.influencerCampaignClaim.findUnique({
    where: { id: claimId },
    select: {
      id: true,
      recipientWallet: true,
      campaign: { select: { rewardLamports: true } },
    },
  });

  if (!claim) {
    return { ok: false, reason: "Claim not found.", retryable: false };
  }
  if (!isValidSolanaWallet(claim.recipientWallet)) {
    await prisma.influencerCampaignClaim.update({
      where: { id: claimId },
      data: {
        status: CampaignClaimStatus.FULFILLMENT_FAILED,
        fulfillmentError: "Missing or invalid recipient wallet.",
      },
    });
    return { ok: false, reason: "Missing or invalid recipient wallet.", retryable: false };
  }

  let amount: bigint | undefined;
  try {
    amount = BigInt(claim.campaign.rewardLamports);
  } catch {
    amount = undefined;
  }

  try {
    const result = await transferPbtcFromTreasury({
      recipientWallet: claim.recipientWallet,
      amountLamports: amount,
    });

    await prisma.influencerCampaignClaim.update({
      where: { id: claimId },
      data: {
        status: CampaignClaimStatus.FULFILLED,
        txSignature: result.signature,
        fulfilledAt: new Date(),
        fulfillmentError: null,
      },
    });

    return { ok: true, signature: result.signature };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown transfer error.";
    console.error(`[campaign-fulfillment] failed for ${claimId}:`, error);
    await prisma.influencerCampaignClaim.update({
      where: { id: claimId },
      data: {
        status: CampaignClaimStatus.FULFILLMENT_FAILED,
        fulfillmentError: message.slice(0, 500),
      },
    });
    return { ok: false, reason: message, retryable: true };
  }
}
