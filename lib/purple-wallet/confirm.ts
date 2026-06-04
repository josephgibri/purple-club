/**
 * HTTP-only transaction confirmation for the Purple Wallet.
 *
 * Our same-origin RPC proxy (/api/rpc) forwards JSON-RPC over HTTP and has no
 * websocket endpoint. Connection.confirmTransaction() relies on a websocket
 * `signatureSubscribe` (and falls back to `getBlockHeight`, which the proxy
 * doesn't even allow), so it never resolves even after the transaction lands —
 * leaving the UI stuck on "Sending…" despite funds already moving.
 *
 * Instead we poll `getSignatureStatuses` (allowlisted) until the signature is
 * confirmed/finalized, errors, or we time out.
 */

import type { Connection } from "@solana/web3.js";

export async function confirmSignature(
  connection: Connection,
  signature: string,
  { timeoutMs = 90_000, pollMs = 1_500 }: { timeoutMs?: number; pollMs?: number } = {},
): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const { value } = await connection.getSignatureStatuses([signature], {
      searchTransactionHistory: true,
    });
    const status = value[0];

    if (status) {
      if (status.err) {
        throw new Error(`Transaction failed on-chain: ${JSON.stringify(status.err)}`);
      }
      if (
        status.confirmationStatus === "confirmed" ||
        status.confirmationStatus === "finalized"
      ) {
        return;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }

  throw new Error(
    "Timed out waiting for confirmation. The transaction may still go through — check your balance in a moment.",
  );
}
