import { NextRequest, NextResponse } from "next/server";
import { isFounderWallet, readSession } from "@/lib/wallet-session";
import { verifyBurnTx } from "@/lib/burns";

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

export async function POST(request: NextRequest) {
  const guard = await ensureFounder();
  if (guard.error) return guard.error;

  let body: { signature?: string };
  try {
    body = (await request.json()) as { signature?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const sig = (body.signature ?? "").trim();
  if (!sig) {
    return NextResponse.json({ error: "Signature is required." }, { status: 400 });
  }

  const verification = await verifyBurnTx(sig);
  if (!verification.ok) {
    return NextResponse.json({ ok: false, reason: verification.reason });
  }

  return NextResponse.json({
    ok: true,
    signature: verification.signature,
    mint: verification.mint,
    lamportsBurned: verification.lamportsBurned.toString(),
    slot: verification.slot,
    blockTime: verification.blockTime,
  });
}
