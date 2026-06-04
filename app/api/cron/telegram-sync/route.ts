/**
 * GET /api/cron/telegram-sync
 *
 * Scheduled hourly via vercel.json cron. Iterates all linked Telegram members,
 * re-reads their PBTC balance, applies the tier state machine, and enforces
 * group eligibility. Staggered to avoid hammering the RPC.
 *
 * Secured by the CRON_SECRET header (Vercel sets this automatically for
 * cron invocations; manual calls must supply it in Authorization).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncMember } from "@/lib/telegram/member-service";

export const runtime = "nodejs";
export const maxDuration = 60;

function validateCronSecret(req: Request): boolean {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) return false;
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${expected}`;
}

export async function GET(request: Request): Promise<Response> {
  if (!validateCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch all members that have a linked wallet
  const members = await prisma.telegramMember.findMany({
    where: { userId: { not: null } },
    select: { telegramId: true },
  });

  let synced = 0;
  let errors = 0;

  for (const { telegramId } of members) {
    try {
      await syncMember(telegramId);
      synced++;
    } catch (err) {
      errors++;
      console.error(`[telegram-sync] failed for ${telegramId}:`, err);
    }
    // Small delay to avoid RPC rate limits
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log(`[telegram-sync] done — synced: ${synced}, errors: ${errors}`);
  return NextResponse.json({ ok: true, synced, errors });
}
