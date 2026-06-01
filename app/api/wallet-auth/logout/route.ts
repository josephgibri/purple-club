import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/wallet-session";

export const runtime = "nodejs";

export async function POST() {
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
