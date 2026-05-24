import { PublicKey } from "@solana/web3.js";
import { errors as joseErrors } from "jose";

import { verifyPassToken } from "@/lib/passToken";
import { getPbtcBalanceWithFallback } from "@/lib/solana";

/**
 * Public endpoint hit by the `/verify` merchant scanner.
 *
 * Two-layer check:
 *   1. JWT signature + expiry — proves a real holder consented to be shown
 *      within the last 90 seconds (defeats screenshot replays).
 *   2. Live on-chain balance read — defeats the "mint pass, drain wallet,
 *      flash QR" attack the snapshot alone wouldn't catch.
 *
 * The response is deliberately shape-stable across success and failure so
 * the verifier UI can render a single big-PASS / big-FAIL state without
 * branching on HTTP status. The status code still mirrors the outcome
 * (200 valid, 401 invalid/expired, 403 no PBTC) for any automation that
 * cares.
 */

export const dynamic = "force-dynamic";

type Outcome =
  | {
      valid: true;
      wallet: string;
      balance: number;
      balanceSnapshot: number;
      sigPrefix: string;
      issuedAt: string;
      expiresAt: string;
      verifiedAt: string;
    }
  | {
      valid: false;
      reason:
        | "missing_token"
        | "invalid_token"
        | "expired_token"
        | "wallet_invalid"
        | "no_pbtc"
        | "rpc_unavailable";
      message: string;
    };

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const token = url.searchParams.get("t");
  if (!token) {
    return jsonOutcome(
      {
        valid: false,
        reason: "missing_token",
        message: "No verification token provided.",
      },
      400,
    );
  }

  let claims;
  try {
    claims = await verifyPassToken(token);
  } catch (error) {
    if (error instanceof joseErrors.JWTExpired) {
      return jsonOutcome(
        {
          valid: false,
          reason: "expired_token",
          message: "This pass has expired. Ask the member to refresh it.",
        },
        401,
      );
    }
    return jsonOutcome(
      {
        valid: false,
        reason: "invalid_token",
        message: "This pass could not be verified.",
      },
      401,
    );
  }

  let pubkey: PublicKey;
  try {
    pubkey = new PublicKey(claims.wallet);
  } catch {
    return jsonOutcome(
      {
        valid: false,
        reason: "wallet_invalid",
        message: "Pass references an invalid wallet.",
      },
      400,
    );
  }

  let liveBalance: number;
  try {
    const result = await getPbtcBalanceWithFallback(pubkey);
    liveBalance = result.uiAmount;
  } catch {
    return jsonOutcome(
      {
        valid: false,
        reason: "rpc_unavailable",
        message: "Could not reach Solana RPC. Try again.",
      },
      503,
    );
  }

  if (liveBalance < 1) {
    return jsonOutcome(
      {
        valid: false,
        reason: "no_pbtc",
        message: "Wallet no longer holds the 1 PBTC minimum.",
      },
      403,
    );
  }

  return jsonOutcome(
    {
      valid: true,
      wallet: claims.wallet,
      balance: liveBalance,
      balanceSnapshot: claims.balanceSnapshot,
      sigPrefix: claims.sigPrefix,
      issuedAt: new Date(claims.issuedAt).toISOString(),
      expiresAt: new Date(claims.expiresAt).toISOString(),
      verifiedAt: new Date().toISOString(),
    },
    200,
  );
}

function jsonOutcome(outcome: Outcome, status: number): Response {
  return Response.json(outcome, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
