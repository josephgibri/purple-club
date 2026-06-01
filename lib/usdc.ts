import crypto from "node:crypto";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { TravelRequestStatus } from "@prisma/client";
import { prisma } from "./prisma";
import { getRpcUrl } from "./pbtc";

export const USDC_DECIMALS = 6;
export const USDC_LAMPORTS_PER_USD = 10n ** BigInt(USDC_DECIMALS);
const OVERPAYMENT_WARN_THRESHOLD_LAMPORTS = 5n * USDC_LAMPORTS_PER_USD;

/**
 * Floor a salted invoice total down to its whole-dollar value. The
 * connected-wallet flow signs this floor (clean "Pay $1.00" UX); the
 * manual rail signs the salted total. Both are valid payments for the
 * same invoice — payments below this floor are real underpayments.
 */
export function flooredDollars(lamports: bigint | string): bigint {
  const n = typeof lamports === "bigint" ? lamports : BigInt(lamports);
  return (n / USDC_LAMPORTS_PER_USD) * USDC_LAMPORTS_PER_USD;
}

const DEFAULT_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

/** USDC SPL mint on Solana mainnet (override via USDC_MINT env). */
export function getUsdcMint(): PublicKey {
  const raw = process.env.USDC_MINT?.trim() || DEFAULT_USDC_MINT;
  return new PublicKey(raw);
}

/** Treasury / receiving wallet (USDC). */
export function getPurpleStayWallet(): PublicKey {
  const raw = process.env.PURPLE_STAY_WALLET?.trim();
  if (!raw) {
    throw new Error("PURPLE_STAY_WALLET is not configured.");
  }
  return new PublicKey(raw);
}

/**
 * Compute the exact USDC amount we expect on-chain for a given offer.
 *
 * The amount is the purple price in USD converted to 6-decimal lamports,
 * plus a deterministic micro-salt derived from the request code so that
 * concurrent invoices for the same dollar amount end up with unique
 * lamport values. Salt is bounded to < 1 cent (10_000 micro-USDC) so it
 * does not visibly affect the displayed price.
 */
export function computeExpectedLamports(
  purplePriceUsd: number | string,
  requestCode: string,
): bigint {
  const usd =
    typeof purplePriceUsd === "string" ? Number(purplePriceUsd) : purplePriceUsd;
  if (!Number.isFinite(usd) || usd <= 0) {
    throw new Error("purplePriceUsd must be a positive number.");
  }
  const baseLamports = BigInt(Math.round(usd * Number(USDC_LAMPORTS_PER_USD)));
  const hash = crypto.createHash("sha256").update(requestCode).digest();
  const salt = BigInt(hash.readUInt32BE(0)) % 9999n; // 0..9998 micro-USDC (< 1¢)
  return baseLamports + salt;
}

/** Format raw lamports (6-decimal) into a human USD string. */
export function formatUsdcAmount(lamports: bigint | string): string {
  let n: bigint;
  try {
    n = typeof lamports === "bigint" ? lamports : BigInt(lamports);
  } catch {
    return "0";
  }
  const whole = n / USDC_LAMPORTS_PER_USD;
  const frac = n % USDC_LAMPORTS_PER_USD;
  const fracStr = frac.toString().padStart(USDC_DECIMALS, "0");
  return `${whole.toString()}.${fracStr}`;
}

/** Generate a fresh Solana Pay reference PublicKey. */
export function generateReferencePubkey(): string {
  return Keypair.generate().publicKey.toBase58();
}

export type SolanaPayParams = {
  recipient: string;
  /** Raw 6-decimal lamports. */
  amountLamports: bigint;
  /** Reference pubkey (base58). */
  reference?: string;
  label?: string;
  message?: string;
  splToken?: string;
};

/**
 * Build a Solana Pay transfer URL (https://docs.solanapay.com/spec).
 *
 * Wallets that support Solana Pay (Phantom, Solflare, Backpack, ...) will
 * decode this and prefill a transfer of the exact amount + reference.
 */
export function buildSolanaPayUrl(params: SolanaPayParams): string {
  const search = new URLSearchParams();
  search.set("amount", formatUsdcAmount(params.amountLamports));
  search.set("spl-token", params.splToken ?? getUsdcMint().toBase58());
  if (params.reference) search.set("reference", params.reference);
  if (params.label) search.set("label", params.label);
  if (params.message) search.set("message", params.message);
  return `solana:${params.recipient}?${search.toString()}`;
}

export type TokenTransferEvent = {
  signature: string;
  slot: number | null;
  blockTime: number | null;
  mint: string;
  source: string | null;
  destination: string | null;
  /** Raw lamports (6 decimals for USDC). */
  amountLamports: bigint;
  /** All accounts referenced by the transaction (used to match reference pubkeys). */
  accountKeys: string[];
};

type HeliusTokenTransfer = {
  fromUserAccount?: string | null;
  toUserAccount?: string | null;
  fromTokenAccount?: string | null;
  toTokenAccount?: string | null;
  tokenAmount?: number | string | null;
  rawTokenAmount?: { tokenAmount?: string | null; decimals?: number | null } | null;
  mint?: string | null;
};

type HeliusEnhancedTransaction = {
  signature?: string;
  slot?: number;
  timestamp?: number;
  tokenTransfers?: HeliusTokenTransfer[];
  accountData?: Array<{ account?: string }>;
  transaction?: { message?: { accountKeys?: Array<string | { pubkey?: string }> } };
};

function toLamports(transfer: HeliusTokenTransfer): bigint | null {
  const raw = transfer.rawTokenAmount?.tokenAmount;
  if (raw && /^\d+$/.test(raw)) {
    try {
      return BigInt(raw);
    } catch {
      return null;
    }
  }
  if (transfer.tokenAmount != null) {
    const num =
      typeof transfer.tokenAmount === "string"
        ? Number(transfer.tokenAmount)
        : transfer.tokenAmount;
    if (Number.isFinite(num) && num > 0) {
      return BigInt(Math.round(num * Number(USDC_LAMPORTS_PER_USD)));
    }
  }
  return null;
}

/**
 * Parse a Helius Enhanced webhook payload into a normalized list of
 * incoming USDC transfers to the given recipient wallet.
 *
 * The payload is the entire array Helius posts to the webhook URL.
 */
export function parseHeliusEnhancedPayload(
  payload: unknown,
  filter: { recipient: string; mint: string },
): TokenTransferEvent[] {
  const list = Array.isArray(payload) ? payload : [];
  const events: TokenTransferEvent[] = [];

  for (const txn of list as HeliusEnhancedTransaction[]) {
    const transfers = txn.tokenTransfers ?? [];
    if (!transfers.length) continue;
    const accountKeys = collectAccountKeys(txn);
    const signature = txn.signature ?? "";
    if (!signature) continue;

    for (const t of transfers) {
      if ((t.mint ?? "") !== filter.mint) continue;
      if ((t.toUserAccount ?? "") !== filter.recipient) continue;
      const amount = toLamports(t);
      if (amount == null || amount <= 0n) continue;
      events.push({
        signature,
        slot: txn.slot ?? null,
        blockTime: txn.timestamp ?? null,
        mint: t.mint ?? "",
        source: t.fromUserAccount ?? null,
        destination: t.toUserAccount ?? null,
        amountLamports: amount,
        accountKeys,
      });
    }
  }

  return events;
}

function collectAccountKeys(txn: HeliusEnhancedTransaction): string[] {
  const keys = new Set<string>();
  for (const a of txn.accountData ?? []) {
    if (a?.account) keys.add(a.account);
  }
  const raw = txn.transaction?.message?.accountKeys ?? [];
  for (const k of raw) {
    if (typeof k === "string") keys.add(k);
    else if (k?.pubkey) keys.add(k.pubkey);
  }
  return Array.from(keys);
}

/**
 * Try to find the open TravelRequest that this on-chain transfer pays.
 *
 * Match strategy (first hit wins):
 *   1. Solana Pay reference pubkey appears in the tx accounts.
 *   2. Exact lamport match against `expectedUsdcLamports` for an open
 *      USDC invoice.
 */
export async function findMatchingRequest(args: {
  amountLamports: bigint;
  references: string[];
}) {
  const { amountLamports, references } = args;
  const openStatuses = [
    TravelRequestStatus.OFFER_READY,
    TravelRequestStatus.PAYMENT_SUBMITTED,
  ];

  if (references.length > 0) {
    const byRef = await prisma.travelRequest.findFirst({
      where: {
        paymentReferencePubkey: { in: references },
        status: { in: openStatuses },
        paymentTxSignature: null,
      },
      select: matchSelect,
    });
    if (byRef) return byRef;
  }

  return prisma.travelRequest.findFirst({
    where: {
      expectedUsdcLamports: amountLamports,
      paymentMethod: "USDC",
      status: { in: openStatuses },
      paymentTxSignature: null,
    },
    select: matchSelect,
  });
}

const matchSelect = {
  id: true,
  requestCode: true,
  status: true,
  userId: true,
  expectedUsdcLamports: true,
  paymentReferencePubkey: true,
  paymentTxSignature: true,
  user: { select: { email: true } },
} as const;

export type MatchedRequest = NonNullable<
  Awaited<ReturnType<typeof findMatchingRequest>>
>;

export type ApplyTransferResult =
  | {
      ok: true;
      kind: "verified" | "already_verified";
      requestCode: string;
      requestId: string;
      txSignature: string;
      amountLamports: string;
      expectedLamports: string | null;
    }
  | { ok: false; reason: string };

/**
 * Idempotently mark a request as PAYMENT_VERIFIED based on an on-chain
 * transfer. Safe to call from the webhook OR the on-demand verify route;
 * the unique `paymentTxSignature` constraint + the WHERE-status guard
 * make exactly one path win even under concurrency.
 */
export async function applyTransferToRequest(args: {
  amountLamports: bigint;
  txSignature: string;
  references?: string[];
}): Promise<ApplyTransferResult> {
  const matched = await findMatchingRequest({
    amountLamports: args.amountLamports,
    references: args.references ?? [],
  });
  if (!matched) {
    return { ok: false, reason: "No open invoice matched this transfer." };
  }

  if (matched.expectedUsdcLamports != null) {
    const expected = BigInt(matched.expectedUsdcLamports.toString());
    const flooredExpected = flooredDollars(expected);
    if (args.amountLamports < flooredExpected) {
      return {
        ok: false,
        reason: `Transfer underpaid invoice (${args.amountLamports.toString()} < ${flooredExpected.toString()} lamports).`,
      };
    }
    const overpaidBy = args.amountLamports - expected;
    if (overpaidBy > OVERPAYMENT_WARN_THRESHOLD_LAMPORTS) {
      console.warn(
        `[usdc] ${matched.requestCode} overpaid by ${overpaidBy.toString()} lamports (tx=${args.txSignature})`,
      );
    }
  }

  if (
    matched.paymentTxSignature &&
    matched.paymentTxSignature === args.txSignature
  ) {
    return {
      ok: true,
      kind: "already_verified",
      requestCode: matched.requestCode,
      requestId: matched.id,
      txSignature: args.txSignature,
      amountLamports: args.amountLamports.toString(),
      expectedLamports: matched.expectedUsdcLamports?.toString() ?? null,
    };
  }

  const result = await prisma.travelRequest.updateMany({
    where: {
      id: matched.id,
      status: {
        in: [TravelRequestStatus.OFFER_READY, TravelRequestStatus.PAYMENT_SUBMITTED],
      },
      paymentTxSignature: null,
    },
    data: {
      status: TravelRequestStatus.PAYMENT_VERIFIED,
      paymentMethod: "USDC",
      paymentTxSignature: args.txSignature,
      paymentVerifiedAt: new Date(),
      paymentVerifiedAmountLamports: args.amountLamports,
      paymentRejectReason: null,
    },
  });

  if (result.count === 0) {
    return {
      ok: false,
      reason: "Request was already updated by another path.",
    };
  }

  return {
    ok: true,
    kind: "verified",
    requestCode: matched.requestCode,
    requestId: matched.id,
    txSignature: args.txSignature,
    amountLamports: args.amountLamports.toString(),
    expectedLamports: matched.expectedUsdcLamports?.toString() ?? null,
  };
}

/**
 * Look up the last few transfers to PURPLE_STAY_WALLET on-chain via RPC
 * and try to apply each one to a matching open invoice.
 *
 * Used by `/verify-payment` (interactive) and as a best-effort one-shot
 * after `submit_payment`. Returns the first successful match.
 */
export async function verifyPaymentFromChain(args: {
  expectedReferencePubkey?: string | null;
  expectedAmountLamports?: bigint | null;
  signaturesLimit?: number;
}): Promise<
  | { ok: true; kind: "verified" | "already_verified"; signature: string; amountLamports: string }
  | { ok: false; reason: string }
> {
  let recipient: PublicKey;
  let mint: string;
  try {
    recipient = getPurpleStayWallet();
    mint = getUsdcMint().toBase58();
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "USDC receiver not configured.",
    };
  }

  const connection = new Connection(getRpcUrl(), "confirmed");
  let signatures: Array<{ signature: string }>;
  try {
    const sigs = await connection.getSignaturesForAddress(recipient, {
      limit: Math.min(Math.max(args.signaturesLimit ?? 30, 5), 100),
    });
    signatures = sigs.map((s) => ({ signature: s.signature }));
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "RPC failed.",
    };
  }

  const tokenProgramId = TOKEN_PROGRAM_ID.toBase58();

  for (const { signature } of signatures) {
    try {
      const tx = await connection.getTransaction(signature, {
        maxSupportedTransactionVersion: 0,
        commitment: "confirmed",
      });
      const meta = tx?.meta;
      if (!tx || !meta || meta.err) continue;

      const accountKeys = tx.transaction.message.getAccountKeys
        ? tx.transaction.message
            .getAccountKeys({ accountKeysFromLookups: meta.loadedAddresses })
            .keySegments()
            .flat()
            .map((k) => k.toBase58())
        : [];

      const matchingPost = (meta.postTokenBalances ?? []).filter(
        (b) =>
          b.mint === mint &&
          b.owner === recipient.toBase58() &&
          b.programId === tokenProgramId,
      );
      if (matchingPost.length === 0) continue;

      let delta = 0n;
      for (const post of matchingPost) {
        const pre = (meta.preTokenBalances ?? []).find(
          (p) =>
            p.accountIndex === post.accountIndex &&
            p.mint === post.mint &&
            p.owner === post.owner,
        );
        const postAmount = BigInt(post.uiTokenAmount.amount ?? "0");
        const preAmount = BigInt(pre?.uiTokenAmount.amount ?? "0");
        const diff = postAmount - preAmount;
        if (diff > 0n) delta += diff;
      }
      if (delta <= 0n) continue;

      const referenceMatched = Boolean(
        args.expectedReferencePubkey &&
          accountKeys.includes(args.expectedReferencePubkey),
      );
      const amountMatched =
        args.expectedAmountLamports != null &&
        delta === args.expectedAmountLamports;
      if (!referenceMatched && !amountMatched) continue;

      const result = await applyTransferToRequest({
        amountLamports: delta,
        txSignature: signature,
        references: accountKeys,
      });
      if (result.ok) {
        return {
          ok: true,
          kind: result.kind,
          signature,
          amountLamports: delta.toString(),
        };
      }
    } catch (error) {
      console.error(`[verifyPaymentFromChain] tx ${signature} failed:`, error);
    }
  }

  return { ok: false, reason: "No matching transfer found yet." };
}
