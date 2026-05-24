import { createHash, randomBytes } from "node:crypto";

/**
 * Lifetime of a password reset link, in minutes. Short enough to limit
 * the damage of a leaked link, long enough for the user to actually
 * click it (email delivery + clients pre-fetching can swallow a few
 * minutes on its own).
 */
export const RESET_TOKEN_TTL_MINUTES = 30;

/**
 * Generate a fresh password reset token. Returns BOTH the raw token
 * (to embed in the email link) and the SHA-256 hash that we persist.
 * The raw token never appears again outside the email.
 */
export function createResetToken(): { raw: string; hash: string; expiresAt: Date } {
  const raw = randomBytes(32).toString("base64url");
  const hash = hashResetToken(raw);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60_000);
  return { raw, hash, expiresAt };
}

export function hashResetToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}
