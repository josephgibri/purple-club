import { NextRequest, NextResponse } from "next/server";
import { Prisma, TravelRequestStatus } from "@prisma/client";
import { isFounderWallet, readSession } from "@/lib/wallet-session";
import { prisma } from "@/lib/prisma";
import { lastCompletedMonthLabel, periodBounds } from "@/lib/burns";

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

export async function GET(request: NextRequest) {
  const guard = await ensureFounder();
  if (guard.error) return guard.error;

  const { searchParams } = new URL(request.url);
  const periodLabel = searchParams.get("period")?.trim() || lastCompletedMonthLabel();

  const bounds = periodBounds(periodLabel);
  if (!bounds) {
    return NextResponse.json(
      { error: "Invalid period label. Expected YYYY-MM." },
      { status: 400 },
    );
  }

  const [stats, alreadyBurned] = await Promise.all([
    prisma.travelRequest.aggregate({
      where: {
        status: TravelRequestStatus.CONFIRMED,
        checkOutDate: {
          gte: bounds.startUtc,
          lt: bounds.endUtcExclusive,
        },
      },
      _count: { _all: true },
      _sum: { purplePriceUsd: true },
    }),
    prisma.burnEvent.findUnique({
      where: { periodLabel },
      select: { id: true, periodLabel: true, committedAt: true },
    }),
  ]);

  const stays = stats._count._all;
  const revenueUsd = (stats._sum.purplePriceUsd ?? new Prisma.Decimal(0)).toFixed(2);
  const suggestedBurnUsd = (
    Number(stats._sum.purplePriceUsd ?? new Prisma.Decimal(0)) * 0.0025
  ).toFixed(2);

  return NextResponse.json({
    periodLabel,
    fulfilledStaysCount: stays,
    revenueUsd,
    suggestedBurnUsd,
    alreadyBurned: alreadyBurned
      ? {
          id: alreadyBurned.id,
          periodLabel: alreadyBurned.periodLabel,
          committedAt: alreadyBurned.committedAt.toISOString(),
        }
      : null,
  });
}
