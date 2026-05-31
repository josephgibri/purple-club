import { z } from "zod";

import { db } from "@/lib/db";
import { formatZodError } from "@/lib/dbSchemas";
import { sendPasswordResetEmail } from "@/lib/email";
import { createResetToken, RESET_TOKEN_TTL_MINUTES } from "@/lib/passwordReset";

export const runtime = "nodejs";

const forgotSchema = z.object({
  email: z.string().trim().email(),
});

function getSiteOrigin(): string {
  return process.env.PUBLIC_SITE_URL?.replace(/\/+$/, "") ?? "https://purpleclub.org";
}

/**
 * Kicks off the password reset flow. Always returns `{ ok: true }` —
 * we never disclose whether the supplied email actually corresponds
 * to a real account, so a malicious caller can't enumerate accounts
 * via this endpoint.
 *
 * Internally:
 *  1. Look up the user by email.
 *  2. If found, mint a single-use token (SHA-256 hashed in the DB),
 *     invalidating any older still-valid tokens for the same user
 *     so only the most recent email link works.
 *  3. Email the user the raw token as a /reset?token=... link.
 */
export async function POST(request: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = forgotSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: formatZodError(parsed.error) }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase();
  const user = await db.user.findUnique({ where: { email }, select: { id: true } });

  if (user) {
    const { raw: token, hash, expiresAt } = createResetToken();

    // Burn any prior unused token for this user so only the freshest
    // link works — avoids 5 simultaneously-valid links from impatient
    // double-clicking.
    await db.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });

    await db.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hash, expiresAt },
    });

    const resetUrl = `${getSiteOrigin()}/reset?token=${encodeURIComponent(token)}`;
    await sendPasswordResetEmail({
      to: email,
      resetUrl,
      ttlMinutes: RESET_TOKEN_TTL_MINUTES,
    });
  }

  return Response.json({ ok: true });
}
