import { NextResponse } from "next/server";
import { GiftStatus } from "@prisma/client";
import { getPbtcBalance, readSession } from "@/lib/wallet-session";
import { fulfillGiftClaim } from "@/lib/gift-fulfillment";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 60;

function maskWallet(wallet: string | null | undefined) {
  if (!wallet || wallet.length < 8) return wallet ?? null;
  return `${wallet.slice(0, 4)}…${wallet.slice(-4)}`;
}

export async function GET(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  if (!code) {
    return NextResponse.json({ error: "Missing gift code." }, { status: 400 });
  }
  const gift = await prisma.giftClaim.findUnique({
    where: { code: code.toUpperCase() },
    select: {
      code: true,
      status: true,
      createdAt: true,
      claimedAt: true,
      fulfilledAt: true,
      txSignature: true,
      creator: { select: { wallet: true } },
      recipient: { select: { wallet: true } },
      // Promoter-minted codes carry a campaign attribution so the
      // claim page can say "from {campaign.label}" instead of
      // exposing the promoter's wallet. Organic peer-to-peer gifts
      // leave this null and we keep the existing wallet-tag UX.
      campaign: { select: { label: true } },
    },
  });
  if (!gift) {
    return NextResponse.json({ error: "This gift link is no longer valid." }, { status: 404 });
  }
  return NextResponse.json({
    gift: {
      code: gift.code,
      status: gift.status,
      createdAt: gift.createdAt,
      claimedAt: gift.claimedAt,
      fulfilledAt: gift.fulfilledAt,
      txSignature: gift.txSignature,
      creatorWalletMasked: maskWallet(gift.creator?.wallet ?? null),
      recipientWalletMasked: maskWallet(gift.recipient?.wallet ?? null),
      campaignLabel: gift.campaign?.label ?? null,
    },
  });
}

export async function POST(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  const session = await readSession();
  if (!session?.wallet) {
    return NextResponse.json(
      { error: "Connect your Solana wallet first to claim this gift." },
      { status: 401 },
    );
  }
  const { code } = await ctx.params;

  const gift = await prisma.giftClaim.findUnique({
    where: { code: code.toUpperCase() },
    select: {
      id: true,
      code: true,
      status: true,
      creatorUserId: true,
      creator: { select: { wallet: true, email: true } },
    },
  });
  if (!gift) {
    return NextResponse.json({ error: "This gift link is no longer valid." }, { status: 404 });
  }
  if (gift.status !== GiftStatus.CREATED) {
    return NextResponse.json(
      { error: "This gift has already been claimed." },
      { status: 409 },
    );
  }
  if (gift.creator?.wallet === session.wallet) {
    return NextResponse.json(
      { error: "You cannot claim your own gift." },
      { status: 400 },
    );
  }

  // Gifts are an onboarding tool — a wallet that already holds PBTC has
  // already unlocked Purple Club through some other path, so the gift would
  // be a no-op. Read the on-chain balance and reject early.
  try {
    const balance = await getPbtcBalance(session.wallet);
    if (balance > 0) {
      return NextResponse.json(
        {
          error:
            "This wallet already holds PBTC. Gifts are reserved for new members — please connect a wallet that doesn't hold PBTC yet.",
        },
        { status: 400 },
      );
    }
  } catch (error) {
    console.error("[gifts] failed to read PBTC balance for claim guard:", error);
    // Fail open: don't block a claim because the RPC was momentarily
    // unreachable. The fulfillment path will still work for genuinely
    // empty wallets.
  }

  const recipient = await prisma.user.upsert({
    where: { wallet: session.wallet },
    update: {},
    create: { wallet: session.wallet },
    select: { id: true, email: true },
  });

  // Race-safe claim transition. The earlier `gift.status === CREATED` check
  // is a friendly guard, but two near-simultaneous claims (e.g. a friend
  // double-tapping the link, or two devices hitting it at once) can both
  // observe `CREATED` and proceed. Without a conditional update, the second
  // writer would silently overwrite the first claim's recipient — handing
  // the funds to whoever happens to win the last write. The `updateMany`
  // below only flips the row if it's still in `CREATED`; the loser's
  // `count === 0` returns the same friendly 409 the read-then-update path
  // already produces, and fulfillment runs at most once.
  const claim = await prisma.giftClaim.updateMany({
    where: { id: gift.id, status: GiftStatus.CREATED },
    data: {
      status: GiftStatus.CLAIMED,
      recipientUserId: recipient.id,
      recipientWallet: session.wallet,
      recipientEmail: recipient.email,
      claimedAt: new Date(),
    },
  });
  if (claim.count === 0) {
    return NextResponse.json(
      { error: "This gift has already been claimed." },
      { status: 409 },
    );
  }

  const updated = await prisma.giftClaim.findUniqueOrThrow({
    where: { id: gift.id },
    select: {
      id: true,
      code: true,
      status: true,
      claimedAt: true,
      recipientWallet: true,
      recipientEmail: true,
    },
  });

  // We deliberately skip the gift_claimed email here. Auto-fulfillment runs
  // synchronously below and dispatches the gift_fulfilled email — sending
  // both back-to-back was confusing the gifter ("did the same thing happen
  // twice?"). gift_fulfilled alone covers the success case; if fulfillment
  // fails the agent gets the failure notification through the queue page.

  const fulfillment = await fulfillGiftClaim(updated.id).catch((error) => {
    console.error("[gifts] auto-fulfill threw:", error);
    return { ok: false, reason: "Auto-fulfillment crashed.", retryable: true } as const;
  });

  const finalGift = await prisma.giftClaim.findUnique({
    where: { id: updated.id },
    select: {
      code: true,
      status: true,
      claimedAt: true,
      fulfilledAt: true,
      txSignature: true,
      recipientWallet: true,
      recipientEmail: true,
    },
  });

  return NextResponse.json({
    gift: finalGift ?? updated,
    fulfillment: fulfillment.ok
      ? { ok: true, signature: fulfillment.signature }
      : { ok: false, reason: fulfillment.reason },
  });
}
