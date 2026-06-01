import { NextResponse } from "next/server";
import { buildSigninMessage, generateNonce, setNonceCookie } from "@/lib/wallet-session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { wallet?: string };
    const wallet = body.wallet?.trim() || null;

    const nonce = generateNonce();
    await setNonceCookie(wallet, nonce);

    if (wallet) {
      const message = buildSigninMessage(wallet, nonce);
      return NextResponse.json({ nonce, message });
    }
    return NextResponse.json({ nonce });
  } catch (error) {
    console.error("Failed to create nonce:", error);
    return NextResponse.json({ error: "Unable to initialize sign-in." }, { status: 500 });
  }
}
