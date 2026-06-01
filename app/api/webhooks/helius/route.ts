import crypto from "node:crypto";
import { NextResponse } from "next/server";
import {
  applyTransferToRequest,
  getPurpleStayWallet,
  getUsdcMint,
  parseHeliusEnhancedPayload,
} from "@/lib/usdc";
import { dispatchNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 30;

function checkAuth(req: Request): boolean {
  const expected = process.env.HELIUS_WEBHOOK_AUTH?.trim();
  if (!expected) {
    console.warn("[helius-webhook] HELIUS_WEBHOOK_AUTH is not configured.");
    return false;
  }
  const candidates = [
    req.headers.get("authorization"),
    req.headers.get("Authorization"),
    req.headers.get("x-auth"),
    req.headers.get("X-Auth"),
  ].filter(Boolean) as string[];
  for (const value of candidates) {
    const trimmed = value.trim().replace(/^Bearer\s+/i, "");
    const a = Buffer.from(trimmed);
    const b = Buffer.from(expected);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true;
  }
  return false;
}

export async function POST(req: Request) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let recipient: string;
  let mint: string;
  try {
    recipient = getPurpleStayWallet().toBase58();
    mint = getUsdcMint().toBase58();
  } catch (error) {
    console.error("[helius-webhook] missing config:", error);
    // Always 200-ish here so Helius doesn't infinite-retry while you fix env.
    return NextResponse.json(
      { ok: false, reason: "Receiver not configured." },
      { status: 200 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const events = parseHeliusEnhancedPayload(body, { recipient, mint });
  const results: Array<{ signature: string; outcome: string }> = [];

  for (const event of events) {
    try {
      const result = await applyTransferToRequest({
        amountLamports: event.amountLamports,
        txSignature: event.signature,
        references: event.accountKeys,
      });

      if (result.ok && result.kind === "verified") {
        const record = await prisma.travelRequest.findUnique({
          where: { id: result.requestId },
          select: {
            requestCode: true,
            requestedHotelName: true,
            user: { select: { email: true } },
          },
        });
        if (record) {
          await dispatchNotification({
            event: "payment_verified",
            member: { email: record.user?.email ?? null },
            context: {
              requestCode: record.requestCode,
              hotelName: record.requestedHotelName,
              paymentMethod: "USDC",
              paymentTxSignature: result.txSignature,
              paymentVerifiedAmountLamports: result.amountLamports,
            },
          });
        }
      }

      results.push({
        signature: event.signature,
        outcome: result.ok ? result.kind : `noop:${result.reason}`,
      });
    } catch (error) {
      console.error(`[helius-webhook] apply failed for ${event.signature}:`, error);
      results.push({ signature: event.signature, outcome: "error" });
    }
  }

  // Always 200 so Helius doesn't retry transient errors forever.
  return NextResponse.json({ ok: true, processed: results.length, results });
}

export function GET() {
  return NextResponse.json({ ok: true, route: "helius-webhook" });
}
