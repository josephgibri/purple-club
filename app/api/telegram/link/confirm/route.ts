/**
 * POST /api/telegram/link/confirm
 * Called by the /link/telegram page after the user has completed SIWS.
 * Requires an active pc_session cookie (set by /api/wallet-auth/verify).
 * Binds the session's telegramId to the verified wallet's User record.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readSession } from "@/lib/wallet-session";
import { sendMessage } from "@/lib/telegram/client";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  // Require active SIWS session
  const session = await readSession();
  if (!session?.wallet) {
    return NextResponse.json({ ok: false, error: "Not signed in. Please complete wallet sign-in first." }, { status: 401 });
  }

  let body: { token?: string };
  try {
    body = (await request.json()) as { token?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid body." }, { status: 400 });
  }

  const token = body.token?.trim() ?? "";
  if (!token) {
    return NextResponse.json({ ok: false, error: "Token is required." }, { status: 400 });
  }

  const linkSession = await prisma.telegramLinkSession.findUnique({ where: { token } });

  if (!linkSession || linkSession.consumedAt || linkSession.expiresAt < new Date()) {
    return NextResponse.json({
      ok: false,
      error: "Link is invalid or expired. Use /link in the bot to get a new one.",
    }, { status: 410 });
  }

  // Upsert the Purple Club User for this wallet
  const user = await prisma.user.upsert({
    where: { wallet: session.wallet },
    create: { wallet: session.wallet },
    update: {},
  });

  // Check if another Telegram account is already linked to this wallet
  const existingLink = await prisma.telegramMember.findFirst({
    where: { userId: user.id, NOT: { telegramId: linkSession.telegramId } },
  });
  if (existingLink) {
    return NextResponse.json({
      ok: false,
      error: "This wallet is already linked to a different Telegram account.",
    }, { status: 409 });
  }

  // Link the telegram member to this user
  await prisma.telegramMember.update({
    where: { telegramId: linkSession.telegramId },
    data: { userId: user.id },
  });

  // Mark session consumed
  await prisma.telegramLinkSession.update({
    where: { token },
    data: { consumedAt: new Date() },
  });

  // Notify in Telegram
  await sendMessage({
    chatId: linkSession.telegramId,
    text:
      `✅ *Wallet linked!*\n\n` +
      `\`${session.wallet.slice(0, 6)}…${session.wallet.slice(-4)}\` is now verified.\n\n` +
      `Use /join to request your group invite, or /status to see your current tier.`,
  }).catch(() => undefined);

  return NextResponse.json({ ok: true });
}
