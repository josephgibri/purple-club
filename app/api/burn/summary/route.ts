import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readPbtcSupply } from "@/lib/pbtc";

export const runtime = "nodejs";
export const revalidate = 60;

export async function GET() {
  try {
    const [aggregate, monthlyCount, lastMonthly, supply] = await Promise.all([
      prisma.burnEvent.aggregate({
        _sum: { pbtcLamportsBurned: true },
      }),
      prisma.burnEvent.count({ where: { kind: "MONTHLY" } }),
      prisma.burnEvent.findFirst({
        where: { kind: "MONTHLY" },
        orderBy: { committedAt: "desc" },
        select: { periodLabel: true, committedAt: true },
      }),
      readPbtcSupply().catch(() => null),
    ]);

    const bookingBurnsLamports = (aggregate._sum.pbtcLamportsBurned ?? 0n).toString();

    return NextResponse.json(
      {
        bookingBurnsLamports,
        bookingBurnsCount: monthlyCount,
        lastMonthly: lastMonthly
          ? {
              periodLabel: lastMonthly.periodLabel,
              committedAt: lastMonthly.committedAt.toISOString(),
            }
          : null,
        totalBurnsLamports: supply ? supply.burnedLamports : null,
        decimals: 9,
        fetchedAt: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control": "s-maxage=60, stale-while-revalidate=300",
        },
      },
    );
  } catch (error) {
    console.error("[burn/summary] failed:", error);
    return NextResponse.json(
      { error: "Could not load burn summary." },
      { status: 502 },
    );
  }
}
