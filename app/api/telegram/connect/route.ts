/**
 * Website-first Telegram onboarding.
 *
 * GET  — returns the signed-in wallet's current Telegram connection state so
 *        the Community Lounge card can render the right step. Always returns
 *        the bot username so the client can mount the Login Widget.
 *
 * POST — receives a Telegram Login Widget payload, verifies its signature
 *        against the bot token, binds the verified telegram_id to the
 *        signed-in wallet's User, checks PBTC eligibility, and (if eligible)
 *        returns a one-time group invite link.
 *
 * Both require an active pc_session cookie (the wallet is already SIWS-verified
 * on the website before any of this runs — that's the whole point of doing the
 * link from the site rather than inside Telegram's in-app browser).
 */
import crypto from "node:crypto";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { readSession } from "@/lib/wallet-session";
import {
  createInviteLink,
  getBotUsername,
  getChatMember,
  getMainGroupId,
  sendMessage,
} from "@/lib/telegram/client";
import { fetchBalance } from "@/lib/telegram/member-service";
import { computeTierUpdate } from "@/lib/telegram/tier-machine";

export const runtime = "nodejs";
export const maxDuration = 30;

const AUTH_MAX_AGE_SECONDS = 60 * 60; // reject Login Widget payloads older than 1h

type TelegramAuthPayload = {
  id?: number | string;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date?: number | string;
  hash?: string;
};

/**
 * Verifies a Telegram Login Widget payload per
 * https://core.telegram.org/widgets/login#checking-authorization.
 * secret = SHA256(bot_token); HMAC-SHA256 over the sorted key=value lines.
 */
function verifyTelegramAuth(payload: TelegramAuthPayload, botToken: string): boolean {
  const { hash, ...rest } = payload;
  if (!hash || typeof hash !== "string") return false;

  const dataCheckString = Object.keys(rest)
    .filter((k) => rest[k as keyof typeof rest] !== undefined && rest[k as keyof typeof rest] !== null)
    .sort()
    .map((k) => `${k}=${String(rest[k as keyof typeof rest])}`)
    .join("\n");

  const secretKey = crypto.createHash("sha256").update(botToken).digest();
  const expected = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  const a = Buffer.from(expected);
  const b = Buffer.from(hash);
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Refreshes the DB inGroup flag against Telegram's live membership state. */
async function reconcileGroupMembership(
  telegramId: bigint,
  currentInGroup: boolean,
): Promise<boolean> {
  try {
    const member = await getChatMember(getMainGroupId(), Number(telegramId));
    const inGroup = ["member", "administrator", "creator", "restricted"].includes(member.status);
    if (inGroup !== currentInGroup) {
      await prisma.telegramMember.update({ where: { telegramId }, data: { inGroup } });
    }
    return inGroup;
  } catch {
    return currentInGroup;
  }
}

// ── GET: current connection state ───────────────────────────────────────────

export async function GET(): Promise<Response> {
  const botUsername = getBotUsername();

  const session = await readSession();
  if (!session?.wallet) {
    return NextResponse.json({ ok: false, error: "Not signed in.", botUsername }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { wallet: session.wallet } });
  const member = user
    ? await prisma.telegramMember.findUnique({ where: { userId: user.id } })
    : null;

  if (!member) {
    return NextResponse.json({
      ok: true,
      botUsername,
      connected: false,
      inGroup: false,
      username: null,
      tier: null,
    });
  }

  const inGroup = await reconcileGroupMembership(member.telegramId, member.inGroup);

  return NextResponse.json({
    ok: true,
    botUsername,
    connected: true,
    inGroup,
    username: member.username,
    tier: member.effectiveTier,
  });
}

// ── POST: verify Login Widget + link + invite ───────────────────────────────

export async function POST(request: Request): Promise<Response> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!botToken) {
    return NextResponse.json({ ok: false, error: "Telegram is not configured." }, { status: 500 });
  }

  const session = await readSession();
  if (!session?.wallet) {
    return NextResponse.json(
      { ok: false, error: "Not signed in. Please sign in with your wallet first." },
      { status: 401 },
    );
  }

  let payload: TelegramAuthPayload;
  try {
    payload = (await request.json()) as TelegramAuthPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid body." }, { status: 400 });
  }

  if (!verifyTelegramAuth(payload, botToken)) {
    return NextResponse.json(
      { ok: false, error: "Telegram verification failed. Please try again." },
      { status: 401 },
    );
  }

  const authDate = Number(payload.auth_date ?? 0);
  if (!Number.isFinite(authDate) || Date.now() / 1000 - authDate > AUTH_MAX_AGE_SECONDS) {
    return NextResponse.json(
      { ok: false, error: "Telegram login expired. Please try again." },
      { status: 401 },
    );
  }

  const telegramId = BigInt(payload.id!);
  const username = payload.username ?? null;

  // Bind wallet ↔ telegram_id. Guard against cross-account collisions.
  const user = await prisma.user.upsert({
    where: { wallet: session.wallet },
    create: { wallet: session.wallet },
    update: {},
  });

  const existingForUser = await prisma.telegramMember.findUnique({ where: { userId: user.id } });
  if (existingForUser && existingForUser.telegramId !== telegramId) {
    return NextResponse.json(
      { ok: false, error: "This wallet is already linked to a different Telegram account." },
      { status: 409 },
    );
  }

  const existingForTelegram = await prisma.telegramMember.findUnique({ where: { telegramId } });
  if (existingForTelegram?.userId && existingForTelegram.userId !== user.id) {
    return NextResponse.json(
      { ok: false, error: "This Telegram account is already linked to a different wallet." },
      { status: 409 },
    );
  }

  await prisma.telegramMember.upsert({
    where: { telegramId },
    create: { telegramId, username, userId: user.id },
    update: { username, userId: user.id },
  });

  // Eligibility check against live balance.
  const balance = await fetchBalance(session.wallet);
  if (balance < 1) {
    return NextResponse.json({
      ok: true,
      status: "ineligible",
      balance,
    });
  }

  const member = await prisma.telegramMember.findUnique({ where: { telegramId } });
  const update = computeTierUpdate(balance, {
    effectiveTier: member?.effectiveTier ?? null,
    tierSince: member?.tierSince ?? null,
    pendingTier: member?.pendingTier ?? null,
    pendingSince: member?.pendingSince ?? null,
    belowThresholdSince: member?.belowThresholdSince ?? null,
    inGroup: member?.inGroup ?? false,
  });

  await prisma.telegramMember.update({
    where: { telegramId },
    data: {
      lastBalance: balance,
      lastCheckedAt: new Date(),
      effectiveTier: update.effectiveTier,
      tierSince: update.tierSince ?? new Date(),
      pendingTier: update.pendingTier,
      pendingSince: update.pendingSince,
      belowThresholdSince: null,
    },
  });

  // Already in the group? Don't mint a redundant invite.
  const inGroup = await reconcileGroupMembership(telegramId, member?.inGroup ?? false);
  if (inGroup) {
    return NextResponse.json({ ok: true, status: "in_group" });
  }

  let inviteLink: string;
  try {
    inviteLink = await createInviteLink(getMainGroupId());
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not create your invite. Please try again shortly." },
      { status: 502 },
    );
  }

  // Backup copy in Telegram DM (non-critical).
  await sendMessage({
    chatId: telegramId,
    text:
      `✅ *Wallet verified on purpleclub.org!*\n\n` +
      `Here's your 1-time invite to the Purple Club group:\n${inviteLink}\n\n` +
      `_This link expires in 1 hour and works once._`,
  }).catch(() => undefined);

  return NextResponse.json({ ok: true, status: "eligible", inviteLink });
}
