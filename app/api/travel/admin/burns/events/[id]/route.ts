import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { isFounderWallet, readSession } from "@/lib/wallet-session";
import { prisma } from "@/lib/prisma";
import { pbtcToLamports } from "@/lib/burns";

export const runtime = "nodejs";

const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

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

function isWithinEditWindow(committedAt: Date): boolean {
  return Date.now() - committedAt.getTime() <= EDIT_WINDOW_MS;
}

type Params = Promise<{ id: string }>;

type PatchBody = {
  pbtcAmount?: string;
  fulfilledStaysCount?: number | null;
  usdSpent?: string | null;
  note?: string | null;
  txSignature?: string | null;
  txSignatures?: string[] | null;
};

export async function PATCH(request: NextRequest, ctx: { params: Params }) {
  const guard = await ensureFounder();
  if (guard.error) return guard.error;

  const { id } = await ctx.params;

  const existing = await prisma.burnEvent.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Burn event not found." }, { status: 404 });
  }
  if (!isWithinEditWindow(existing.committedAt)) {
    return NextResponse.json(
      { error: "Edit window expired. Burn events become immutable 24h after commit." },
      { status: 409 },
    );
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const data: Prisma.BurnEventUpdateInput = {};

  if (body.pbtcAmount != null) {
    let lamports: bigint;
    try {
      lamports = pbtcToLamports(body.pbtcAmount);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Invalid PBTC amount." },
        { status: 400 },
      );
    }
    if (lamports <= 0n) {
      return NextResponse.json(
        { error: "PBTC burned must be greater than zero." },
        { status: 400 },
      );
    }
    data.pbtcLamportsBurned = lamports;
  }

  if (body.fulfilledStaysCount !== undefined) {
    if (body.fulfilledStaysCount === null) {
      data.fulfilledStaysCount = null;
    } else {
      const num = Number(body.fulfilledStaysCount);
      if (!Number.isFinite(num) || num < 0 || !Number.isInteger(num)) {
        return NextResponse.json(
          { error: "Stays count must be a non-negative integer." },
          { status: 400 },
        );
      }
      data.fulfilledStaysCount = num;
    }
  }

  if (body.usdSpent !== undefined) {
    if (body.usdSpent === null || body.usdSpent === "") {
      data.usdSpent = null;
    } else {
      const num = Number(body.usdSpent);
      if (!Number.isFinite(num) || num < 0) {
        return NextResponse.json(
          { error: "USD spent must be a non-negative number." },
          { status: 400 },
        );
      }
      data.usdSpent = new Prisma.Decimal(num.toFixed(2));
    }
  }

  if (body.note !== undefined) {
    data.note = body.note ? body.note.trim() : null;
  }

  if (body.txSignature !== undefined) {
    const trimmed = body.txSignature ? body.txSignature.trim() : "";
    data.txSignature = trimmed || null;
  }

  if (body.txSignatures !== undefined) {
    if (Array.isArray(body.txSignatures)) {
      const cleaned = body.txSignatures
        .map((s) => String(s).trim())
        .filter(Boolean);
      data.txSignatures = (cleaned as unknown as Prisma.InputJsonValue) ?? Prisma.JsonNull;
    } else {
      data.txSignatures = Prisma.JsonNull;
    }
  }

  try {
    const updated = await prisma.burnEvent.update({ where: { id }, data });
    return NextResponse.json({
      event: {
        id: updated.id,
        kind: updated.kind,
        periodLabel: updated.periodLabel,
        fulfilledStaysCount: updated.fulfilledStaysCount,
        usdSpent: updated.usdSpent ? updated.usdSpent.toFixed(2) : null,
        pbtcLamportsBurned: updated.pbtcLamportsBurned.toString(),
        txSignature: updated.txSignature,
        txSignatures: Array.isArray(updated.txSignatures) ? updated.txSignatures : null,
        note: updated.note,
        committedAt: updated.committedAt.toISOString(),
        committedBy: updated.committedBy,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        { error: "This transaction signature is already recorded on another event." },
        { status: 409 },
      );
    }
    console.error("[burn/events] patch failed:", error);
    return NextResponse.json(
      { error: "Could not update burn event." },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: NextRequest, ctx: { params: Params }) {
  const guard = await ensureFounder();
  if (guard.error) return guard.error;

  const { id } = await ctx.params;
  const existing = await prisma.burnEvent.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Burn event not found." }, { status: 404 });
  }
  if (!isWithinEditWindow(existing.committedAt)) {
    return NextResponse.json(
      { error: "Delete window expired. Burn events become immutable 24h after commit." },
      { status: 409 },
    );
  }

  await prisma.burnEvent.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
