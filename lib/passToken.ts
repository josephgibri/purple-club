import { SignJWT, jwtVerify } from "jose";

/**
 * Pass tokens are short-lived JWTs encoded into the membership-pass QR code.
 *
 * Lifecycle:
 *   1. The holder's app POSTs their wallet signature proof to `/api/pass/mint`.
 *   2. The server verifies the signature off-chain and the balance on-chain,
 *      then mints a JWT that captures the verified snapshot.
 *   3. The QR encodes a `/verify?t=<jwt>` URL so any phone camera resolves
 *      straight to the verifier — merchants don't need a special app.
 *   4. The verifier hits `/api/public/verify-pass` which re-checks the
 *      JWT *and* re-reads the on-chain balance (the JWT proves the wallet
 *      consented to be shown; the live read protects against a holder who
 *      minted a pass and then immediately drained the wallet).
 *
 * 90-second TTL is intentional: long enough for a slow scan, short enough
 * that a screenshot of the QR is worthless. Holders refresh by tapping
 * "Refresh Pass" — no signature needed unless the wallet session lapsed.
 */

export type PassTokenClaims = {
  wallet: string;
  balanceSnapshot: number;
  sigPrefix: string;
};

const ISSUER = "purple-prime";
const AUDIENCE = "purple-prime-pass";
export const PASS_TTL_SECONDS = 90;

function getSecret(): Uint8Array {
  const secret =
    process.env.AUTH_JWT_SECRET ?? process.env.JWT_SIGNING_SECRET ?? "";
  if (!secret || secret.length < 16) {
    throw new Error(
      "AUTH_JWT_SECRET (or JWT_SIGNING_SECRET) must be at least 16 chars.",
    );
  }
  return new TextEncoder().encode(secret);
}

export async function signPassToken(
  claims: PassTokenClaims,
): Promise<{ token: string; expiresAt: number }> {
  const expiresAt = Date.now() + PASS_TTL_SECONDS * 1000;
  const token = await new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setExpirationTime(`${PASS_TTL_SECONDS}s`)
    .sign(getSecret());
  return { token, expiresAt };
}

export type VerifiedPassToken = PassTokenClaims & {
  issuedAt: number;
  expiresAt: number;
};

export async function verifyPassToken(token: string): Promise<VerifiedPassToken> {
  const { payload } = await jwtVerify(token, getSecret(), {
    issuer: ISSUER,
    audience: AUDIENCE,
  });
  if (
    typeof payload.wallet !== "string" ||
    typeof payload.balanceSnapshot !== "number" ||
    typeof payload.sigPrefix !== "string" ||
    typeof payload.iat !== "number" ||
    typeof payload.exp !== "number"
  ) {
    throw new Error("Invalid pass token payload");
  }
  return {
    wallet: payload.wallet,
    balanceSnapshot: payload.balanceSnapshot,
    sigPrefix: payload.sigPrefix,
    issuedAt: payload.iat * 1000,
    expiresAt: payload.exp * 1000,
  };
}

/**
 * The QR encodes an absolute `/verify` URL so any phone-camera scanner
 * resolves directly to the verifier page. The verifier reads `t` from
 * the query string and calls the public verify endpoint.
 */
export function buildVerifyUrl(origin: string, token: string): string {
  const cleanOrigin = origin.replace(/\/+$/, "");
  return `${cleanOrigin}/verify?t=${encodeURIComponent(token)}`;
}
