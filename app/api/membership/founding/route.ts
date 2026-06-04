/**
 * GET /api/membership/founding
 * Returns the signed-in wallet's founding-member status (locked slot, if any).
 * The seal is rendered client-side only while the wallet also holds >= 1 PBTC.
 */
import { NextResponse } from "next/server";

import { readSession } from "@/lib/wallet-session";
import { getFoundingStatus } from "@/lib/founding";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const session = await readSession();
  if (!session?.wallet) {
    return NextResponse.json({ ok: false, founding: false, seq: null }, { status: 401 });
  }

  const status = await getFoundingStatus(session.wallet);
  return NextResponse.json({ ok: true, ...status });
}
