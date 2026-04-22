import { SignJWT, jwtVerify } from "jose";

export type EditTokenClaims = {
  merchantId: string;
  email: string;
};

const ISSUER = "purple-club";
const AUDIENCE = "purple-club-edit";

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SIGNING_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "JWT_SIGNING_SECRET is missing or too short. Set at least 16 characters.",
    );
  }
  return new TextEncoder().encode(secret);
}

export async function signEditToken(
  claims: EditTokenClaims,
  expiresIn: string = "365d",
): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setExpirationTime(expiresIn)
    .sign(getSecret());
}

export async function verifyEditToken(
  token: string,
): Promise<EditTokenClaims> {
  const { payload } = await jwtVerify(token, getSecret(), {
    issuer: ISSUER,
    audience: AUDIENCE,
  });
  if (
    typeof payload.merchantId !== "string" ||
    typeof payload.email !== "string"
  ) {
    throw new Error("Invalid token payload");
  }
  return {
    merchantId: payload.merchantId,
    email: payload.email,
  };
}

export function buildEditUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}/merchant/edit?t=${encodeURIComponent(token)}`;
}
