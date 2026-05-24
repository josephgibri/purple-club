import bs58 from "bs58";
import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";

import { signPassToken, PASS_TTL_SECONDS } from "@/lib/passToken";
import { getPbtcBalanceWithFallback } from "@/lib/solana";

/**
 * Mints a short-lived pass token for the QR code on the membership pass.
 *
 * The client posts the same wallet-signature proof the rest of the app
 * already produces in `useWalletAuth` (publicKey + message + base58 sig).
 * We re-verify the signature with tweetnacl, re-read the PBTC balance
 * on-chain (cheaper than trusting the client), and only then sign a JWT
 * that captures the snapshot for merchant verification.
 *
 * If the wallet was drained since the user signed in, we refuse to mint —
 * the verifier would catch it anyway with its own live balance check, but
 * failing fast keeps the pass UI from showing a QR that's already invalid.
 */

type MintRequest = {
  publicKey?: unknown;
  message?: unknown;
  signature?: unknown;
};

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  let body: MintRequest;
  try {
    body = (await request.json()) as MintRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { publicKey, message, signature } = body;
  if (
    typeof publicKey !== "string" ||
    typeof message !== "string" ||
    typeof signature !== "string"
  ) {
    return Response.json(
      { error: "Missing publicKey, message, or signature." },
      { status: 400 },
    );
  }

  let pubkey: PublicKey;
  try {
    pubkey = new PublicKey(publicKey);
  } catch {
    return Response.json({ error: "Invalid Solana public key." }, { status: 400 });
  }

  let signatureBytes: Uint8Array;
  try {
    signatureBytes = bs58.decode(signature);
  } catch {
    return Response.json(
      { error: "Signature must be base58-encoded." },
      { status: 400 },
    );
  }

  const encodedMessage = new TextEncoder().encode(message);
  const sigValid = nacl.sign.detached.verify(
    encodedMessage,
    signatureBytes,
    pubkey.toBytes(),
  );
  if (!sigValid) {
    return Response.json(
      { error: "Wallet signature did not verify." },
      { status: 401 },
    );
  }

  // The message text bakes in the wallet address, so a signed message that
  // doesn't reference *this* publicKey was meant for a different wallet.
  if (!message.includes(publicKey)) {
    return Response.json(
      { error: "Signed message does not bind to this wallet." },
      { status: 401 },
    );
  }

  let balance: number;
  try {
    const result = await getPbtcBalanceWithFallback(pubkey);
    balance = result.uiAmount;
  } catch {
    return Response.json(
      { error: "Could not read PBTC balance on-chain." },
      { status: 502 },
    );
  }

  if (balance < 1) {
    return Response.json(
      { error: "Wallet no longer holds the 1 PBTC membership minimum." },
      { status: 403 },
    );
  }

  const sigPrefix = `${signature.slice(0, 8)}…${signature.slice(-4)}`;
  const { token, expiresAt } = await signPassToken({
    wallet: publicKey,
    balanceSnapshot: balance,
    sigPrefix,
  });

  return Response.json({
    token,
    expiresAt,
    ttlSeconds: PASS_TTL_SECONDS,
    wallet: publicKey,
    balance,
  });
}
