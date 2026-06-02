import { NextResponse } from "next/server";
import { readSession } from "@/lib/wallet-session";
import { normalizeEmail } from "@/lib/email";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Saves (or clears) the contact email on the wallet-keyed member record.
 * This email is used to autofill the hotel booking form. Sending an empty
 * string clears it. The wallet identity comes from the signed pc_session
 * cookie — the body only carries the email.
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
  const wantsClear =
    typeof rawEmail === "string" && rawEmail.trim().length === 0;

  let email: string | null = null;
  if (!wantsClear) {
    email = normalizeEmail(rawEmail);
    if (!email) {
      return NextResponse.json(
        { error: "Enter a valid email address." },
        { status: 400 },
      );
    }
  }

  const user = await db.user.upsert({
    where: { wallet: session.wallet },
    update: { email },
    create: { wallet: session.wallet, email },
    select: { email: true },
  });

  return NextResponse.json({ ok: true, email: user.email });
}
