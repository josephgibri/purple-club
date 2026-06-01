import { z } from "zod";

import { setSessionCookie, signSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatZodError } from "@/lib/dbSchemas";
import { hashPassword } from "@/lib/password";
import { hashResetToken } from "@/lib/passwordReset";

export const runtime = "nodejs";

const resetSchema = z.object({
  token: z.string().min(20),
  password: z.string().min(8).max(128),
});

/**
 * Consume a password reset token and rotate the user's password.
 *
 * Security notes:
 *  - The token is hashed (SHA-256) before lookup so we never compare
 *    raw tokens against DB rows.
 *  - Tokens are single-use; on success we mark `usedAt` so the same
 *    link can't be replayed.
 *  - On success we also sign the user in immediately, so they don't
 *    bounce through the login screen with the password they just set.
 *  - All other still-valid reset tokens for this user are burned at
 *    the same time, since a successful reset invalidates whatever
 *    flow originally triggered them.
 */
export async function POST(request: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = resetSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: formatZodError(parsed.error) }, { status: 400 });
  }

  const hash = hashResetToken(parsed.data.token);
  const record = await db.passwordResetToken.findUnique({
    where: { tokenHash: hash },
    include: { user: true },
  });

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return Response.json(
      { error: "This reset link is invalid or has expired. Please request a new one." },
      { status: 400 },
    );
  }

  const passwordHash = await hashPassword(parsed.data.password);

  await db.$transaction([
    db.merchant.update({
      where: { id: record.userId },
      data: { passwordHash },
    }),
    db.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
    db.passwordResetToken.updateMany({
      where: { userId: record.userId, usedAt: null },
      data: { usedAt: new Date() },
    }),
  ]);

  const token = await signSession({
    uid: record.user.id,
    email: record.user.email,
    username: record.user.username,
    role: record.user.role,
  });
  await setSessionCookie(token);

  return Response.json({
    ok: true,
    user: {
      id: record.user.id,
      email: record.user.email,
      username: record.user.username,
      role: record.user.role,
    },
  });
}
