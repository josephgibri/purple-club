import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";

import { getPbtcBalance } from "@/lib/wallet-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One live PBTC read for the membership gate. Browser calls this, not Helius. */
export async function GET(request: Request): Promise<Response> {
  const wallet = new URL(request.url).searchParams.get("wallet")?.trim() ?? "";
  try {
    // Reject malformed addresses before opening an RPC connection.
    void new PublicKey(wallet);
  } catch {
    return NextResponse.json({ error: "Invalid wallet." }, { status: 400 });
  }

  try {
    const balance = await getPbtcBalance(wallet);
    return NextResponse.json({ balance });
  } catch (error) {
    const message = error instanceof Error ? error.message : "PBTC balance read failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
