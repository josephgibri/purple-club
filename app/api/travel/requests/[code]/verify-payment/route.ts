import { NextResponse } from "next/server";
import { TravelRequestStatus } from "@prisma/client";
import { readSession } from "@/lib/wallet-session";
import { dispatchNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { USDC_DECIMALS, verifyPaymentFromChain } from "@/lib/usdc";

export const runtime = "nodejs";
export const maxDuration = 30;

const lastCallByCode = new Map<string, number>();
const RATE_LIMIT_MS = 3000;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;

  const session = await readSession();
  if (!session?.wallet) {
    return NextResponse.json(
      { error: "Wallet authentication required." },
      { status: 401 },
    );
  }

  const request = await prisma.travelRequest.findUnique({
    where: { requestCode: code },
    select: {
      id: true,
      requestCode: true,
      wallet: true,
      status: true,
      paymentMethod: true,
      paymentTxSignature: true,
      paymentVerifiedAt: true,
      expectedUsdcLamports: true,
      paymentReferencePubkey: true,
      requestedHotelName: true,
      user: { select: { email: true } },
    },
  });

  if (!request) {
    return NextResponse.json({ error: "Request not found." }, { status: 404 });
  }
  if (request.wallet !== session.wallet) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  if (
    request.status === TravelRequestStatus.PAYMENT_VERIFIED ||
    request.status === TravelRequestStatus.CONFIRMED
  ) {
    return NextResponse.json({
      status: request.status,
      paymentVerifiedAt: request.paymentVerifiedAt?.toISOString() ?? null,
      txSignature: request.paymentTxSignature,
      kind: "already_verified",
    });
  }

  const now = Date.now();
  const last = lastCallByCode.get(code) ?? 0;
  if (now - last < RATE_LIMIT_MS) {
    return NextResponse.json(
      { error: "Please wait a moment before retrying." },
      { status: 429 },
    );
  }
  lastCallByCode.set(code, now);

  if (!request.expectedUsdcLamports && !request.paymentReferencePubkey) {
    return NextResponse.json({
      status: "WAITING",
      kind: "no_invoice",
      reason:
        "This request does not have an active USDC invoice yet. Wait for the agent to send the offer.",
    });
  }

  const result = await verifyPaymentFromChain({
    expectedAmountLamports: request.expectedUsdcLamports
      ? BigInt(request.expectedUsdcLamports.toString())
      : null,
    expectedReferencePubkey: request.paymentReferencePubkey ?? null,
    signaturesLimit: 50,
  });

  if (!result.ok) {
    return NextResponse.json({
      status: "WAITING",
      kind: "no_match",
      reason: result.reason,
    });
  }

  if (result.kind === "verified") {
    void dispatchNotification({
      event: "payment_verified",
      member: { email: request.user?.email ?? null },
      context: {
        requestCode: request.requestCode,
        hotelName: request.requestedHotelName,
        paymentMethod: "USDC",
        paymentTxSignature: result.signature,
        paymentVerifiedAmountLamports: result.amountLamports,
      },
    });
  }

  const refreshed = await prisma.travelRequest.findUnique({
    where: { id: request.id },
    select: { status: true, paymentVerifiedAt: true, paymentTxSignature: true },
  });

  return NextResponse.json({
    status: refreshed?.status ?? request.status,
    paymentVerifiedAt: refreshed?.paymentVerifiedAt?.toISOString() ?? null,
    txSignature: refreshed?.paymentTxSignature ?? result.signature,
    kind: result.kind,
    amountLamports: result.amountLamports,
    decimals: USDC_DECIMALS,
  });
}
