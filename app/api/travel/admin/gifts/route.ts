import { NextResponse } from "next/server";
import { GiftStatus } from "@prisma/client";
import { isFounderWallet, readSession } from "@/lib/wallet-session";
import { fulfillGiftClaim } from "@/lib/gift-fulfillment";
import { dispatchNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 60;

const ADMIN_GIFT_SELECT = {
  id: true,
  code: true,
  status: true,
  txSignature: true,
  agentNote: true,
  fulfillmentError: true,
  fulfillmentAttempts: true,
  fulfillmentStartedAt: true,
  recipientWallet: true,
  recipientEmail: true,
  createdAt: true,
  claimedAt: true,
  fulfilledAt: true,
  creator: { select: { wallet: true, email: true } },
  recipient: { select: { wallet: true, email: true } },
} as const;

async function ensureFounder() {
  const session = await readSession();
  if (!session?.wallet) {
    return { error: NextResponse.json({ error: "Wallet authentication required." }, { status: 401 }) };
  }
  if (!isFounderWallet(session.wallet)) {
    return { error: NextResponse.json({ error: "Founder access required." }, { status: 403 }) };
  }
  return { session };
}

export async function GET() {
  const guard = await ensureFounder();
  if (guard.error) return guard.error;

  const gifts = await prisma.giftClaim.findMany({
    orderBy: [
      { status: "asc" },
      { claimedAt: { sort: "desc", nulls: "last" } },
      { createdAt: "desc" },
    ],
    select: ADMIN_GIFT_SELECT,
  });
  return NextResponse.json({ gifts });
}

export async function PATCH(req: Request) {
  const guard = await ensureFounder();
  if (guard.error) return guard.error;

  const body = (await req.json().catch(() => null)) as
    | { id?: string; action?: string; txSignature?: string; agentNote?: string }
    | null;
  if (!body?.id || !body.action) {
    return NextResponse.json({ error: "id and action are required." }, { status: 400 });
  }

  const existing = await prisma.giftClaim.findUnique({
    where: { id: body.id },
    select: {
      id: true,
      code: true,
      status: true,
      fulfillmentStartedAt: true,
      recipientWallet: true,
      recipientEmail: true,
      creator: { select: { email: true } },
    },
  });
  if (!existing) {
    return NextResponse.json({ error: "Gift not found." }, { status: 404 });
  }

  // A gift can land in FULFILLING and never escape if the worker that
  // claimed the lock died mid-transfer (instance restart, OOM, network
  // blip during the on-chain submit). Once that lock is older than this
  // threshold an agent can safely "kick" it via retry_fulfillment — the
  // underlying transferPbtcFromTreasury is idempotent on its own
  // signature lookups, but in practice a fresh attempt is what unblocks
  // the recipient. 10 minutes is generous: a healthy fulfill-and-confirm
  // is < 30s, so anything beyond 10 minutes is unambiguously stuck.
  const STUCK_FULFILLING_MS = 10 * 60 * 1000;
  const isStuckFulfilling =
    existing.status === GiftStatus.FULFILLING &&
    (existing.fulfillmentStartedAt === null ||
      existing.fulfillmentStartedAt.getTime() <
        Date.now() - STUCK_FULFILLING_MS);

  if (body.action === "mark_fulfilled") {
    if (
      existing.status !== GiftStatus.CLAIMED &&
      existing.status !== GiftStatus.FULFILLMENT_FAILED &&
      existing.status !== GiftStatus.FULFILLING
    ) {
      return NextResponse.json(
        { error: "Only claimed/failed gifts can be marked as fulfilled." },
        { status: 409 },
      );
    }
    const tx = body.txSignature?.trim();
    if (!tx) {
      return NextResponse.json(
        { error: "txSignature is required to fulfil." },
        { status: 400 },
      );
    }
    const updated = await prisma.giftClaim.update({
      where: { id: existing.id },
      data: {
        status: GiftStatus.FULFILLED,
        txSignature: tx,
        agentNote: body.agentNote?.trim() || null,
        fulfilledAt: new Date(),
        fulfillmentError: null,
      },
      select: ADMIN_GIFT_SELECT,
    });
    void dispatchNotification({
      event: "gift_fulfilled",
      member: { email: existing.creator?.email ?? null },
      context: {
        requestCode: existing.code,
        giftCode: existing.code,
        giftRecipientWallet: existing.recipientWallet,
        giftRecipientEmail: existing.recipientEmail,
        giftTxSignature: tx,
      },
    });
    return NextResponse.json({ gift: updated });
  }

  if (body.action === "retry_fulfillment") {
    if (
      existing.status !== GiftStatus.FULFILLMENT_FAILED &&
      existing.status !== GiftStatus.CLAIMED &&
      !isStuckFulfilling
    ) {
      return NextResponse.json(
        {
          error:
            existing.status === GiftStatus.FULFILLING
              ? "Fulfillment is in progress — wait a few minutes before retrying."
              : "Only claimed/failed gifts can be retried.",
        },
        { status: 409 },
      );
    }
    // For FULFILLMENT_FAILED and stuck FULFILLING alike, reset to CLAIMED
    // and clear the lock timestamp so fulfillGiftClaim can re-acquire it
    // through its standard CLAIMED-only updateMany guard.
    if (
      existing.status === GiftStatus.FULFILLMENT_FAILED ||
      isStuckFulfilling
    ) {
      await prisma.giftClaim.update({
        where: { id: existing.id },
        data: {
          status: GiftStatus.CLAIMED,
          fulfillmentStartedAt: null,
          fulfillmentError: null,
        },
      });
    }
    const result = await fulfillGiftClaim(existing.id);
    const refreshed = await prisma.giftClaim.findUnique({
      where: { id: existing.id },
      select: ADMIN_GIFT_SELECT,
    });
    return NextResponse.json({
      gift: refreshed,
      fulfillment: result.ok
        ? { ok: true, signature: result.signature }
        : { ok: false, reason: result.reason },
    });
  }

  if (body.action === "reject") {
    const updated = await prisma.giftClaim.update({
      where: { id: existing.id },
      data: {
        status: GiftStatus.REJECTED,
        agentNote: body.agentNote?.trim() || null,
      },
      select: ADMIN_GIFT_SELECT,
    });
    return NextResponse.json({ gift: updated });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
