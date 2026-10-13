import crypto from "node:crypto";

import { TravelRequestStatus } from "@prisma/client";

import { addressHoldsKey, readAppAccount } from "@/lib/app-club";
import { appJson, appOptions } from "@/lib/app-json";
import { prisma } from "@/lib/prisma";
import { STAYS_LINES } from "@/lib/stays-offer";
import { decodeHotelUrl } from "@/lib/url-decoder";

export const runtime = "nodejs";

export function OPTIONS() {
  return appOptions();
}

async function guard(request: Request) {
  const account = await readAppAccount(request);
  if (!account?.address) return { error: appJson({ error: "Sign in again." }, 401) };
  if (!(await addressHoldsKey(account.address))) {
    return { error: appJson({ error: "Hold 1 PBTC to open Stays." }, 403) };
  }
  return { account };
}

export async function GET(request: Request) {
  const gate = await guard(request);
  if (gate.error) return gate.error;
  return appJson({ lines: STAYS_LINES });
}

export async function POST(request: Request) {
  const gate = await guard(request);
  if (gate.error) return gate.error;
  const account = gate.account;
  if (!account.address) return appJson({ error: "Sign in again." }, 401);
  const address = account.address;
  const body = (await request.json().catch(() => null)) as { hotelUrl?: string } | null;
  const hotelUrl = body?.hotelUrl?.trim() ?? "";
  let parsed: URL;
  try {
    parsed = new URL(hotelUrl);
  } catch {
    return appJson({ error: "Paste a hotel link." }, 400);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return appJson({ error: "Paste a hotel link." }, 400);
  }

  const user = await prisma.user.upsert({
    where: { wallet: address },
    update: { email: account.email, emailVerifiedAt: account.emailVerifiedAt },
    create: {
      wallet: address,
      email: account.email,
      emailVerifiedAt: account.emailVerifiedAt,
    },
  });

  const checkIn = new Date();
  checkIn.setDate(checkIn.getDate() + 14);
  const checkOut = new Date(checkIn);
  checkOut.setDate(checkOut.getDate() + 2);
  const decoded = decodeHotelUrl(hotelUrl);

  const created = await prisma.travelRequest.create({
    data: {
      requestCode: `PTR-${Date.now()}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`,
      userId: user.id,
      wallet: address,
      hotelUrl,
      checkInDate: checkIn,
      checkOutDate: checkOut,
      roomType: "Concierge",
      occupancy: 2,
      refundabilityPreference: "FLEXIBLE",
      mealPreference: "BREAKFAST",
      status: TravelRequestStatus.PENDING,
      requestedHotelName: decoded.hotelName ?? null,
    },
    select: { requestCode: true },
  });

  return appJson({ ok: true, requestCode: created.requestCode }, 201);
}
