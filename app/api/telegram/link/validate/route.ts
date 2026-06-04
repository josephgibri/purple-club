/**
 * GET /api/telegram/link/validate?token=<token>
 * Called by the /link/telegram page on mount to check the token is valid
 * before asking the user to sign in.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token")?.trim() ?? "";

  if (!token) {
    return NextResponse.json({ ok: false, error: "Token is required." }, { status: 400 });
  }

  const session = await prisma.telegramLinkSession.findUnique({ where: { token } });

  if (!session) {
    return NextResponse.json({ ok: false, error: "Link not found. Use /link in the bot to get a new one." }, { status: 404 });
  }
  if (session.consumedAt) {
    return NextResponse.json({ ok: false, error: "This link has already been used. Use /link to get a new one." }, { status: 410 });
  }
  if (session.expiresAt < new Date()) {
    return NextResponse.json({ ok: false, error: "This link has expired. Use /link to get a new one." }, { status: 410 });
  }

  // Look up the Telegram username for the UI
  const member = await prisma.telegramMember.findUnique({
    where: { telegramId: session.telegramId },
  });

  return NextResponse.json({ ok: true, username: member?.username ?? null });
}
