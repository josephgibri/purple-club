import crypto from "node:crypto";

import { db } from "@/lib/db";
import { isEmailEnabled, sendEmail } from "@/lib/email";

const TTL_MS = 24 * 60 * 60 * 1000;

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Stores a fresh link and sends it. A changed address starts unverified. */
export async function issueEmailVerification(
  userId: string,
  email: string,
  origin: string,
): Promise<boolean> {
  const token = crypto.randomBytes(32).toString("base64url");
  await db.user.update({
    where: { id: userId },
    data: {
      email,
      emailVerifiedAt: null,
      emailVerifyTokenHash: hashToken(token),
      emailVerifyExpires: new Date(Date.now() + TTL_MS),
    },
  });

  const confirmUrl = `${origin.replace(/\/+$/, "")}/email/confirm?token=${encodeURIComponent(token)}`;
  if (!isEmailEnabled()) return false;

  await sendEmail({
    to: email,
    subject: "Verify your email for Purple Club",
    text: `Verify this email before you book a stay.

${confirmUrl}

The link lasts 24 hours. If you did not ask for this, ignore it.

— Purple Club`,
  });
  return true;
}

export async function confirmEmailVerification(token: string): Promise<boolean> {
  if (!token || token.length < 20) return false;
  const user = await db.user.findFirst({
    where: { emailVerifyTokenHash: hashToken(token) },
    select: { id: true, email: true, emailVerifyExpires: true },
  });
  if (!user?.email || !user.emailVerifyExpires || user.emailVerifyExpires.getTime() < Date.now()) {
    return false;
  }
  await db.user.update({
    where: { id: user.id },
    data: {
      emailVerifiedAt: new Date(),
      emailVerifyTokenHash: null,
      emailVerifyExpires: null,
    },
  });
  return true;
}
