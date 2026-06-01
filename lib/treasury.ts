import {
  Connection,
  Keypair,
  PublicKey,
  TransactionExpiredBlockheightExceededError,
  sendAndConfirmTransaction,
  Transaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  getMint,
} from "@solana/spl-token";
import bs58 from "bs58";
import { getPbtcMintAddress, getRpcUrl, PBTC_DECIMALS } from "./pbtc";

const ONE_PBTC_LAMPORTS = 10n ** BigInt(PBTC_DECIMALS);

let cachedKeypair: Keypair | null = null;

function decodeSecret(raw: string): Uint8Array {
  const trimmed = raw.trim().replace(/^["']|["']$/g, "");
  if (!trimmed) {
    throw new Error("Treasury secret key is empty.");
  }
  if (trimmed.startsWith("[")) {
    const arr = JSON.parse(trimmed) as number[];
    if (!Array.isArray(arr) || arr.some((n) => typeof n !== "number")) {
      throw new Error("Treasury secret JSON must be a number array.");
    }
    return Uint8Array.from(arr);
  }
  return bs58.decode(trimmed);
}

export function getTreasuryKeypair(): Keypair {
  if (cachedKeypair) return cachedKeypair;
  const raw = process.env.GIFT_TREASURY_SECRET_KEY?.trim();
  if (!raw) {
    throw new Error(
      "GIFT_TREASURY_SECRET_KEY is not configured (base58 or JSON-array secret key required).",
    );
  }
  const bytes = decodeSecret(raw);
  if (bytes.length === 32) {
    cachedKeypair = Keypair.fromSeed(bytes);
    return cachedKeypair;
  }
  if (bytes.length === 64) {
    cachedKeypair = Keypair.fromSecretKey(bytes);
    return cachedKeypair;
  }
  throw new Error(
    `Treasury secret key must be 32 bytes (seed) or 64 bytes (full secret); got ${bytes.length}.`,
  );
}

export function getTreasuryPublicKey(): PublicKey {
  return getTreasuryKeypair().publicKey;
}

export type TransferResult = {
  signature: string;
  recipient: string;
  recipientAta: string;
  amountLamports: string;
};

export async function transferPbtcFromTreasury(params: {
  recipientWallet: string;
  amountLamports?: bigint;
}): Promise<TransferResult> {
  const recipient = new PublicKey(params.recipientWallet);
  const treasury = getTreasuryKeypair();
  const mint = getPbtcMintAddress();
  const amount = params.amountLamports ?? ONE_PBTC_LAMPORTS;
  const connection = new Connection(getRpcUrl(), "confirmed");

  const mintInfo = await getMint(connection, mint);
  if (mintInfo.decimals !== PBTC_DECIMALS) {
    throw new Error(
      `PBTC mint decimals mismatch (expected ${PBTC_DECIMALS}, got ${mintInfo.decimals}).`,
    );
  }

  const fromAta = getAssociatedTokenAddressSync(
    mint,
    treasury.publicKey,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  const toAta = getAssociatedTokenAddressSync(
    mint,
    recipient,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );

  const tx = new Transaction();
  tx.add(
    createAssociatedTokenAccountIdempotentInstruction(
      treasury.publicKey,
      toAta,
      recipient,
      mint,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    ),
    createTransferCheckedInstruction(
      fromAta,
      mint,
      toAta,
      treasury.publicKey,
      amount,
      PBTC_DECIMALS,
      [],
      TOKEN_PROGRAM_ID,
    ),
  );

  try {
    const signature = await sendAndConfirmTransaction(
      connection,
      tx,
      [treasury],
      { commitment: "confirmed", maxRetries: 3 },
    );
    return {
      signature,
      recipient: recipient.toBase58(),
      recipientAta: toAta.toBase58(),
      amountLamports: amount.toString(),
    };
  } catch (error) {
    if (error instanceof TransactionExpiredBlockheightExceededError) {
      throw new Error("Transaction expired before confirmation. Will retry.");
    }
    throw error;
  }
}
