import { NextRequest, NextResponse } from "next/server";
import { Prisma, BurnEventKind } from "@prisma/client";
import { isFounderWallet, readSession } from "@/lib/wallet-session";
import { prisma } from "@/lib/prisma";
import { isValidPeriodLabel, pbtcToLamports, verifyBurnTx } from "@/lib/burns";

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

function serializeEvent(event: {
  id: string;
  kind: BurnEventKind;
  periodLabel: string;
  fulfilledStaysCount: number | null;
  usdSpent: Prisma.Decimal | null;
  pbtcLamportsBurned: bigint;
  txSignature: string | null;
  txSignatures: Prisma.JsonValue | null;
  note: string | null;
  committedAt: Date;
  committedBy: string | null;
}) {
  return {
    id: event.id,
    kind: event.kind,
    periodLabel: event.periodLabel,
    fulfilledStaysCount: event.fulfilledStaysCount,
    usdSpent: event.usdSpent ? event.usdSpent.toFixed(2) : null,
    pbtcLamportsBurned: event.pbtcLamportsBurned.toString(),
    txSignature: event.txSignature,
    txSignatures: Array.isArray(event.txSignatures) ? event.txSignatures : null,
    note: event.note,
    committedAt: event.committedAt.toISOString(),
    committedBy: event.committedBy,
  };
}

export async function GET() {
  const guard = await ensureFounder();
  if (guard.error) return guard.error;

  const events = await prisma.burnEvent.findMany({
    orderBy: [{ kind: "asc" }, { committedAt: "desc" }],
  });

  return NextResponse.json({ events: events.map(serializeEvent) });
}

type CreateBody = {
  kind?: "GENESIS" | "MONTHLY";
  periodLabel?: string;
  pbtcAmount?: string;
  fulfilledStaysCount?: number | null;
  usdSpent?: string | null;
  txSignature?: string | null;
  txSignatures?: string[] | null;
  note?: string | null;
  skipVerification?: boolean;
};

export async function POST(request: NextRequest) {
  const guard = await ensureFounder();
  if (guard.error) return guard.error;

  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const kind: BurnEventKind = body.kind === "GENESIS" ? "GENESIS" : "MONTHLY";

  const periodLabel = (body.periodLabel ?? "").trim() || (kind === "GENESIS" ? "GENESIS" : "");
  if (!periodLabel) {
    return NextResponse.json({ error: "Period label is required." }, { status: 400 });
  }
  if (!isValidPeriodLabel(periodLabel)) {
    return NextResponse.json(
      { error: "Period label must be YYYY-MM or 'GENESIS'." },
      { status: 400 },
    );
  }
  if (kind === "GENESIS" && periodLabel !== "GENESIS") {
    return NextResponse.json(
      { error: "Genesis events must use 'GENESIS' as the period label." },
      { status: 400 },
    );
  }
  if (kind === "MONTHLY" && periodLabel === "GENESIS") {
    return NextResponse.json(
      { error: "Monthly events cannot use 'GENESIS'." },
      { status: 400 },
    );
  }

  let lamports: bigint;
  try {
    lamports = pbtcToLamports(body.pbtcAmount ?? "");
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

  let usdSpent: Prisma.Decimal | null = null;
  if (body.usdSpent != null && body.usdSpent !== "") {
    const num = Number(body.usdSpent);
    if (!Number.isFinite(num) || num < 0) {
      return NextResponse.json(
        { error: "USD spent must be a non-negative number." },
        { status: 400 },
      );
    }
    usdSpent = new Prisma.Decimal(num.toFixed(2));
  }

  let fulfilledStaysCount: number | null = null;
  if (body.fulfilledStaysCount != null) {
    const num = Number(body.fulfilledStaysCount);
    if (!Number.isFinite(num) || num < 0 || !Number.isInteger(num)) {
      return NextResponse.json(
        { error: "Stays count must be a non-negative integer." },
        { status: 400 },
      );
    }
    fulfilledStaysCount = num;
  }

  const primarySig = (body.txSignature ?? "").trim() || null;
  const extraSigs = Array.isArray(body.txSignatures)
    ? body.txSignatures.map((s) => String(s).trim()).filter(Boolean)
    : [];

  if (kind === "MONTHLY" && !primarySig) {
    return NextResponse.json(
      { error: "A Solana transaction signature is required for monthly burns." },
      { status: 400 },
    );
  }

  if (kind === "MONTHLY" && primarySig && !body.skipVerification) {
    const verification = await verifyBurnTx(primarySig);
    if (!verification.ok) {
      return NextResponse.json(
        {
          error: `Could not verify burn on-chain: ${verification.reason}. Set skipVerification to override.`,
          verification: { ok: false, reason: verification.reason },
        },
        { status: 400 },
      );
    }
    if (verification.lamportsBurned !== lamports) {
      return NextResponse.json(
        {
          error: `On-chain burn (${verification.lamportsBurned.toString()} lamports) does not match the entered amount (${lamports.toString()} lamports). Set skipVerification to override.`,
          verification: {
            ok: false,
            reason: "Amount mismatch",
            onChainLamports: verification.lamportsBurned.toString(),
          },
        },
        { status: 400 },
      );
    }
  }

  const note = body.note?.trim() || null;
  const allSigs = [...new Set([...(primarySig ? [primarySig] : []), ...extraSigs])];

  try {
    const created = await prisma.burnEvent.create({
      data: {
        kind,
        periodLabel,
        fulfilledStaysCount,
        usdSpent,
        pbtcLamportsBurned: lamports,
        txSignature: primarySig,
        txSignatures: allSigs.length > 0 ? (allSigs as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
        note,
        committedBy: guard.session?.wallet ?? null,
      },
    });

    return NextResponse.json({ event: serializeEvent(created) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const target = (error.meta?.target as string[] | string | undefined) ?? "";
      if (String(target).includes("periodLabel")) {
        return NextResponse.json(
          { error: `A burn event for period "${periodLabel}" already exists.` },
          { status: 409 },
        );
      }
      if (String(target).includes("txSignature")) {
        return NextResponse.json(
          { error: "This transaction signature has already been recorded." },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: "Duplicate burn event." }, { status: 409 });
    }
    console.error("[burn/events] create failed:", error);
    return NextResponse.json(
      { error: "Could not create burn event." },
      { status: 500 },
    );
  }
}
