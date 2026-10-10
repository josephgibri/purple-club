import { NextResponse } from "next/server";
import { readSession } from "@/lib/wallet-session";
import { normalizeEmail } from "@/lib/email";
import { issueEmailVerification } from "@/lib/email-verify";
import { db } from "@/lib/db";

export const runtime = "nodejs";

function confirmOrigin(request: Request): string {
  const configured =
    process.env.PUBLIC_SITE_URL?.trim() || process.env.APP_URL?.trim() || "";
  const headerOrigin = request.headers.get("origin")?.trim() || "";
  const local =
    headerOrigin.includes("localhost") || headerOrigin.includes("127.0.0.1");
  if (configured && !local) return configured.replace(/\/+$/, "");
  const base = (process.env.NEXT_PUBLIC_BASE_PATH || "").trim().replace(/\/$/, "");
  if (headerOrigin) return `${headerOrigin.replace(/\/+$/, "")}${base}`;
  return (configured || "https://purpleclub.org").replace(/\/+$/, "");
}

/**
 * Saves the contact email on the wallet-keyed member record and sends a
 * verification link. An empty string clears it. The same address, already
 * verified, is left as-is. A new address starts unverified.
 */
export async function POST(request: Request) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawEmail = (body as { email?: unknown })?.email;
  const wantsClear = typeof rawEmail === "string" && rawEmail.trim().length === 0;

  if (wantsClear) {
    const user = await db.user.upsert({
      where: { wallet: session.wallet },
      update: {
        email: null,
        emailVerifiedAt: null,
        emailVerifyTokenHash: null,
        emailVerifyExpires: null,
      },
      create: { wallet: session.wallet, email: null },
      select: { email: true },
    });
    return NextResponse.json({ ok: true, email: user.email, verified: false, sent: false });
  }

  const email = normalizeEmail(rawEmail);
  if (!email) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const existing = await db.user.findUnique({
    where: { wallet: session.wallet },
    select: { id: true, email: true, emailVerifiedAt: true },
  });

  if (existing?.email === email && existing.emailVerifiedAt) {
    return NextResponse.json({ ok: true, email, verified: true, sent: false });
  }

  const user = existing
    ? existing
    : await db.user.create({
        data: { wallet: session.wallet, email },
        select: { id: true, email: true, emailVerifiedAt: true },
      });

  const sent = await issueEmailVerification(user.id, email, confirmOrigin(request));
  return NextResponse.json({ ok: true, email, verified: false, sent });
}
