/**
 * Starts a website → Telegram link.
 * The signed-in wallet gets a short code. The button opens the bot with that
 * code, and the bot binds the chat to this wallet.
 */
import crypto from "node:crypto";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getBotUsername } from "@/lib/telegram/client";
import { readSession } from "@/lib/wallet-session";

export const runtime = "nodejs";

const TTL_MS = 15 * 60 * 1000;

export async function POST(): Promise<Response> {
  const session = await readSession();
  if (!session?.wallet) {
    return NextResponse.json({ ok: false, error: "Sign in, then try again." }, { status: 401 });
  }

  const user = await prisma.user.upsert({
    where: { wallet: session.wallet },
    create: { wallet: session.wallet },
    update: {},
  });

  const token = crypto.randomBytes(16).toString("hex");
  await prisma.user.update({
    where: { id: user.id },
    data: {
      telegramConnectToken: token,
      telegramConnectExpires: new Date(Date.now() + TTL_MS),
    },
  });

  const url = `https://t.me/${getBotUsername()}?start=c_${token}`;
  return NextResponse.json({ ok: true, url });
}
