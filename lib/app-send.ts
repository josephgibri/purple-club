import { Connection, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { createPublicKey, verify as nodeVerify } from "node:crypto";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  TokenAccountNotFoundError,
} from "@solana/spl-token";

import { getPbtcMintAddress, getRpcUrl, PBTC_DECIMALS } from "@/lib/pbtc";
import { getTreasuryKeypair, getTreasuryPublicKey } from "@/lib/treasury";

const SUPPLY_LAMPORTS = 21_000_000n * 10n ** BigInt(PBTC_DECIMALS);

export function parsePbtcAmount(raw: string): bigint {
  const text = raw.trim();
  if (!/^\d+(\.\d{1,9})?$/.test(text) || text === "0" || /^0+\.?0*$/.test(text)) {
    throw new Error("Enter how much PBTC to send.");
  }
  const [whole, fraction = ""] = text.split(".");
  const lamports = BigInt(whole) * 10n ** BigInt(PBTC_DECIMALS) + BigInt(fraction.padEnd(PBTC_DECIMALS, "0"));
  if (lamports <= 0n || lamports > SUPPLY_LAMPORTS) {
    throw new Error("Enter how much PBTC to send.");
  }
  return lamports;
}

function isAddress(value: string): PublicKey | null {
  try {
    const key = new PublicKey(value);
    return key.toBase58() === value ? key : null;
  } catch {
    return null;
  }
}

export async function prepareMemberSend(memberAddress: string, destinationAddress: string, amountRaw: string) {
  const member = isAddress(memberAddress);
  const destination = isAddress(destinationAddress);
  if (!member || !destination) throw new Error("That address is not valid.");
  if (member.equals(destination)) throw new Error("Send it to someone else.");
  const amount = parsePbtcAmount(amountRaw);
  const treasury = getTreasuryPublicKey();
  const mint = getPbtcMintAddress();
  const fromAta = getAssociatedTokenAddressSync(mint, member, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  const toAta = getAssociatedTokenAddressSync(mint, destination, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  const connection = new Connection(getRpcUrl(), "confirmed");
  let held = 0n;
  try {
    const tokenAccount = await getAccount(connection, fromAta, "confirmed", TOKEN_PROGRAM_ID);
    held = tokenAccount.amount;
  } catch (error) {
    if (!(error instanceof TokenAccountNotFoundError)) throw error;
  }
  if (amount > held) throw new Error("This address does not hold that much PBTC.");
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: treasury, recentBlockhash: blockhash });
  tx.add(
    createAssociatedTokenAccountIdempotentInstruction(
      treasury,
      toAta,
      destination,
      mint,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    ),
    createTransferCheckedInstruction(
      fromAta,
      mint,
      toAta,
      member,
      amount,
      PBTC_DECIMALS,
      [],
      TOKEN_PROGRAM_ID,
    ),
  );
  const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
  return { transaction: Buffer.from(serialized).toString("base64"), amount: amount.toString() };
}

function memberSigned(tx: Transaction, member: PublicKey): boolean {
  const entry = tx.signatures.find((item) => item.publicKey.equals(member));
  if (!entry?.signature) return false;
  const key = createPublicKey({
    key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(member.toBytes())]),
    format: "der",
    type: "spki",
  });
  return nodeVerify(null, Buffer.from(tx.serializeMessage()), key, Buffer.from(entry.signature));
}

export function assertMemberPbtcTransfer(tx: Transaction, memberAddress: string): bigint {
  const member = new PublicKey(memberAddress);
  const treasury = getTreasuryPublicKey();
  const mint = getPbtcMintAddress();
  if (!tx.feePayer?.equals(treasury)) throw new Error("This is not a PBTC transfer.");
  if (tx.instructions.length !== 2) throw new Error("This is not a PBTC transfer.");

  const fromAta = getAssociatedTokenAddressSync(mint, member, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  let destination: PublicKey | null = null;
  let transferDest: PublicKey | null = null;
  let amount: bigint | null = null;

  for (const ix of tx.instructions) {
    if (ix.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID)) {
      if (ix.data.length !== 1 || ix.data[0] !== 1 || ix.keys.length !== 6) {
        throw new Error("This is not a PBTC transfer.");
      }
      const [payer, ata, owner, mintKey, system, token] = ix.keys;
      if (!payer.pubkey.equals(treasury) || !mintKey.pubkey.equals(mint)) {
        throw new Error("This is not a PBTC transfer.");
      }
      if (!system.pubkey.equals(SystemProgram.programId) || !token.pubkey.equals(TOKEN_PROGRAM_ID)) {
        throw new Error("This is not a PBTC transfer.");
      }
      const expected = getAssociatedTokenAddressSync(
        mint,
        owner.pubkey,
        false,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      );
      if (!ata.pubkey.equals(expected)) throw new Error("This is not a PBTC transfer.");
      destination = owner.pubkey;
      continue;
    }
    if (!ix.programId.equals(TOKEN_PROGRAM_ID)) throw new Error("This is not a PBTC transfer.");
    const data = Buffer.from(ix.data);
    if (ix.keys.length !== 4 || data.length !== 10 || data[0] !== 12 || data[9] !== PBTC_DECIMALS) {
      throw new Error("This is not a PBTC transfer.");
    }
    const [source, mintKey, dest, owner] = ix.keys;
    if (!source?.pubkey.equals(fromAta) || !mintKey?.pubkey.equals(mint) || !owner?.pubkey.equals(member) || !dest) {
      throw new Error("This is not a PBTC transfer.");
    }
    transferDest = dest.pubkey;
    amount = data.readBigUInt64LE(1);
    if (amount <= 0n || amount > SUPPLY_LAMPORTS) throw new Error("Enter how much PBTC to send.");
  }

  if (!destination || !transferDest || amount === null) throw new Error("This is not a PBTC transfer.");
  const expectedDest = getAssociatedTokenAddressSync(
    mint,
    destination,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  if (!transferDest.equals(expectedDest)) throw new Error("This is not a PBTC transfer.");
  if (destination.equals(member)) throw new Error("Send it to someone else.");
  if (tx.signatures.length !== 2) throw new Error("This is not a PBTC transfer.");
  for (const sig of tx.signatures) {
    if (!sig.publicKey.equals(treasury) && !sig.publicKey.equals(member)) {
      throw new Error("This is not a PBTC transfer.");
    }
  }
  if (!memberSigned(tx, member)) throw new Error("The key did not sign this transfer.");
  return amount;
}

export async function submitMemberSend(memberAddress: string, transaction: string) {
  const bytes = Buffer.from(transaction, "base64");
  const tx = Transaction.from(bytes);
  const amount = assertMemberPbtcTransfer(tx, memberAddress);
  const treasury = getTreasuryKeypair();
  tx.partialSign(treasury);
  const connection = new Connection(getRpcUrl(), "confirmed");
  const signature = await connection.sendRawTransaction(tx.serialize(), { maxRetries: 3 });
  await connection.confirmTransaction(signature, "confirmed");
  return { signature, amount: amount.toString() };
}
