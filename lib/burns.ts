import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { getPbtcMintAddress, getRpcUrl, PBTC_DECIMALS } from "./pbtc";

export const ONE_PBTC_LAMPORTS = 10n ** BigInt(PBTC_DECIMALS);

export function pbtcToLamports(pbtc: string | number): bigint {
  const text = typeof pbtc === "number" ? pbtc.toString() : pbtc.trim();
  if (!text) return 0n;
  const negative = text.startsWith("-");
  const clean = (negative ? text.slice(1) : text).replace(/[, _]/g, "");
  if (!/^\d*\.?\d*$/.test(clean)) {
    throw new Error("Invalid PBTC amount.");
  }
  const [whole = "0", frac = ""] = clean.split(".");
  const fracPadded = (frac + "0".repeat(PBTC_DECIMALS)).slice(0, PBTC_DECIMALS);
  const wholeBig = BigInt(whole === "" ? "0" : whole);
  const fracBig = BigInt(fracPadded === "" ? "0" : fracPadded);
  const total = wholeBig * ONE_PBTC_LAMPORTS + fracBig;
  return negative ? -total : total;
}

export function lamportsToPbtcString(lamports: bigint | string, fractionDigits = 2): string {
  let n: bigint;
  try {
    n = typeof lamports === "bigint" ? lamports : BigInt(lamports);
  } catch {
    return "0";
  }
  const negative = n < 0n;
  const abs = negative ? -n : n;
  const whole = abs / ONE_PBTC_LAMPORTS;
  const frac = abs % ONE_PBTC_LAMPORTS;
  const wholeStr = whole.toLocaleString("en-US");
  if (fractionDigits <= 0) return `${negative ? "-" : ""}${wholeStr}`;
  const fracStr = frac.toString().padStart(PBTC_DECIMALS, "0").slice(0, fractionDigits);
  if (/^0+$/.test(fracStr)) return `${negative ? "-" : ""}${wholeStr}`;
  return `${negative ? "-" : ""}${wholeStr}.${fracStr.replace(/0+$/, "") || "0"}`;
}

/**
 * Verify a Solana tx signature is a burn (or burnChecked) of PBTC.
 * Looks at the SPL Token program's parsed instructions and confirms the burn
 * targets the PBTC mint. Returns the total lamports burned across matching
 * instructions and the slot/blockTime for display.
 */
export type BurnVerification =
  | {
      ok: true;
      signature: string;
      mint: string;
      lamportsBurned: bigint;
      slot: number;
      blockTime: number | null;
    }
  | {
      ok: false;
      reason: string;
    };

export async function verifyBurnTx(signature: string): Promise<BurnVerification> {
  const sig = signature.trim();
  if (!sig) return { ok: false, reason: "Empty signature." };

  let mint: PublicKey;
  try {
    mint = getPbtcMintAddress();
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "PBTC mint not configured.",
    };
  }

  let connection: Connection;
  try {
    connection = new Connection(getRpcUrl(), "confirmed");
  } catch {
    return { ok: false, reason: "Could not connect to Solana RPC." };
  }

  let tx;
  try {
    tx = await connection.getParsedTransaction(sig, {
      maxSupportedTransactionVersion: 0,
      commitment: "confirmed",
    });
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "RPC error fetching transaction.",
    };
  }

  if (!tx) return { ok: false, reason: "Transaction not found on Solana." };
  if (tx.meta?.err) return { ok: false, reason: "Transaction failed on-chain." };

  const mintBase58 = mint.toBase58();
  const splProgram = TOKEN_PROGRAM_ID.toBase58();

  let totalBurned = 0n;
  const instructions = [
    ...tx.transaction.message.instructions,
    ...(tx.meta?.innerInstructions ?? []).flatMap((inner) => inner.instructions),
  ];

  for (const ix of instructions) {
    if (!("parsed" in ix)) continue;
    if (ix.programId.toBase58() !== splProgram) continue;
    const parsed = ix.parsed;
    if (!parsed || typeof parsed !== "object") continue;
    if (parsed.type !== "burn" && parsed.type !== "burnChecked") continue;
    const info = parsed.info as { mint?: string; amount?: string; tokenAmount?: { amount?: string } };
    const ixMint = info.mint;
    if (ixMint !== mintBase58) continue;
    const amountStr = info.amount ?? info.tokenAmount?.amount ?? "0";
    try {
      totalBurned += BigInt(amountStr);
    } catch {
    }
  }

  if (totalBurned === 0n) {
    return { ok: false, reason: "No PBTC burn instruction found in this transaction." };
  }

  return {
    ok: true,
    signature: sig,
    mint: mintBase58,
    lamportsBurned: totalBurned,
    slot: tx.slot,
    blockTime: tx.blockTime ?? null,
  };
}

/**
 * Last-completed-month period label (e.g. "2026-04" if today is in May 2026).
 */
export function lastCompletedMonthLabel(now: Date = new Date()): string {
  const ref = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const y = ref.getUTCFullYear();
  const m = String(ref.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/**
 * Convert "2026-04" -> { startUtc, endUtcExclusive } for SQL filters.
 */
export function periodBounds(periodLabel: string): { startUtc: Date; endUtcExclusive: Date } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(periodLabel);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  const startUtc = new Date(Date.UTC(year, month - 1, 1));
  const endUtcExclusive = new Date(Date.UTC(year, month, 1));
  return { startUtc, endUtcExclusive };
}

export function isValidPeriodLabel(label: string): boolean {
  if (label === "GENESIS") return true;
  return periodBounds(label) !== null;
}

export function formatPeriodLabel(label: string): string {
  if (label === "GENESIS") return "Genesis";
  const bounds = periodBounds(label);
  if (!bounds) return label;
  return bounds.startUtc.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
