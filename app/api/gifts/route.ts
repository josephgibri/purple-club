import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { GiftStatus } from "@prisma/client";
import { readSession } from "@/lib/wallet-session";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const GIFT_SELECT = {
  id: true,
  code: true,
  status: true,
  recipientWallet: true,
  recipientEmail: true,
  txSignature: true,
  agentNote: true,
  createdAt: true,
  claimedAt: true,
  fulfilledAt: true,
} as const;

function generateGiftCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(8);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return `PT-${out}`;
}

export async function GET() {
  const session = await readSession();
  if (!session?.wallet) {
    return NextResponse.json({ error: "Wallet authentication required." }, { status: 401 });
  }
  const user = await prisma.user.findUnique({
    where: { wallet: session.wallet },
    select: {
      id: true,
      hasUnlockedGifting: true,
      giftClaimsCreated: { select: GIFT_SELECT, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!user) {
    return NextResponse.json({ unlocked: false, gift: null });
  }
  return NextResponse.json({
    unlocked: user.hasUnlockedGifting,
    gift: user.giftClaimsCreated[0] ?? null,
  });
}

export async function POST() {
  const session = await readSession();
  if (!session?.wallet) {
    return NextResponse.json({ error: "Wallet authentication required." }, { status: 401 });
  }
  const user = await prisma.user.findUnique({
    where: { wallet: session.wallet },
    select: {
      id: true,
      hasUnlockedGifting: true,
      giftClaimsCreated: { select: { id: true, code: true, status: true } },
    },
  });
  if (!user) {
    return NextResponse.json({ error: "Member profile not found." }, { status: 404 });
  }
  if (!user.hasUnlockedGifting) {
    return NextResponse.json(
      { error: "Gifting unlocks after your first verified booking." },
      { status: 403 },
    );
  }
  if (user.giftClaimsCreated.length > 0) {
    return NextResponse.json(
      {
        error: "You have already created your gift claim.",
        gift: user.giftClaimsCreated[0],
      },
      { status: 409 },
    );
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateGiftCode();
    const exists = await prisma.giftClaim.findUnique({ where: { code }, select: { id: true } });
    if (exists) continue;
    const created = await prisma.giftClaim.create({
      data: { code, creatorUserId: user.id, status: GiftStatus.CREATED },
      select: GIFT_SELECT,
    });
    return NextResponse.json({ unlocked: true, gift: created });
  }

  return NextResponse.json(
    { error: "Could not allocate a gift code. Please retry." },
    { status: 500 },
  );
}
