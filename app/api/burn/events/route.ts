import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const revalidate = 60;

export async function GET() {
  try {
    const events = await prisma.burnEvent.findMany({
      orderBy: [{ kind: "asc" }, { committedAt: "desc" }],
      select: {
        id: true,
        kind: true,
        periodLabel: true,
        fulfilledStaysCount: true,
        pbtcLamportsBurned: true,
        txSignature: true,
        txSignatures: true,
        note: true,
        committedAt: true,
      },
    });

    const monthly = events
      .filter((e) => e.kind === "MONTHLY")
      .map((e) => ({
        id: e.id,
        kind: e.kind,
        periodLabel: e.periodLabel,
        fulfilledStaysCount: e.fulfilledStaysCount,
        pbtcLamportsBurned: e.pbtcLamportsBurned.toString(),
        txSignature: e.txSignature,
        txSignatures: Array.isArray(e.txSignatures) ? e.txSignatures : null,
        note: e.note,
        committedAt: e.committedAt.toISOString(),
      }));

    const genesis = events
      .filter((e) => e.kind === "GENESIS")
      .map((e) => ({
        id: e.id,
        kind: e.kind,
        periodLabel: e.periodLabel,
        fulfilledStaysCount: e.fulfilledStaysCount,
        pbtcLamportsBurned: e.pbtcLamportsBurned.toString(),
        txSignature: e.txSignature,
        txSignatures: Array.isArray(e.txSignatures) ? e.txSignatures : null,
        note: e.note,
        committedAt: e.committedAt.toISOString(),
      }));

    return NextResponse.json(
      {
        events: [...monthly, ...genesis],
        count: events.length,
      },
      {
        headers: {
          "Cache-Control": "s-maxage=60, stale-while-revalidate=300",
        },
      },
    );
  } catch (error) {
    console.error("[burn/events] failed:", error);
    return NextResponse.json(
      { error: "Could not load burn events." },
      { status: 502 },
    );
  }
}
