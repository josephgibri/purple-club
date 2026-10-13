import crypto from "node:crypto";

import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";

import { isEmailEnabled, normalizeEmail, sendEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { getPbtcBalanceWithFallback } from "@/lib/solana";
import { transferPbtcFromTreasury } from "@/lib/treasury";

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;

export function hashAppSecret(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function newCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

function newInviteCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(8);
  let out = "";
  for (const byte of bytes) out += alphabet[byte % alphabet.length];
  return out;
}

export async function getInviteSettings() {
  return prisma.appInviteSettings.upsert({
    where: { id: "club" },
    update: {},
    create: { id: "club" },
  });
}

export async function issueAppEmailCode(emailInput: string, inviteCode: string) {
  const email = normalizeEmail(emailInput);
  if (!email) return { ok: false as const, status: 400, error: "Enter a real email." };

  const settings = await getInviteSettings();
  const trimmedInvite = inviteCode.trim().toUpperCase();
  let pendingInviteCode: string | null = null;
  if (trimmedInvite) {
    const invite = await prisma.appInvite.findUnique({ where: { code: trimmedInvite } });
    if (!settings.open || !invite || invite.status !== "OPEN") {
      return { ok: false as const, status: 403, error: "That invite is not open." };
    }
    pendingInviteCode = invite.code;
  }

  const existing = await prisma.appAccount.findUnique({ where: { email } });
  if (existing?.address) {
    return {
      ok: false as const,
      status: 409,
      error: "This email already has a key. Enter the phrase from that phone.",
    };
  }

  const code = newCode();
  await prisma.appAccount.upsert({
    where: { email },
    update: {
      codeHash: hashAppSecret(code),
      codeExpires: new Date(Date.now() + CODE_TTL_MS),
      codeAttempts: 0,
      emailVerifiedAt: null,
      pendingInviteCode,
    },
    create: {
      email,
      codeHash: hashAppSecret(code),
      codeExpires: new Date(Date.now() + CODE_TTL_MS),
      pendingInviteCode,
    },
  });

  if (!isEmailEnabled()) {
    if (process.env.NODE_ENV === "production") {
      return { ok: false as const, status: 503, error: "Email is not configured." };
    }
    return { ok: true as const, devCode: code };
  }

  await sendEmail({
    to: email,
    subject: "Your Purple Club code",
    text: `Your Purple Club code is ${code}.

It lasts 10 minutes. If you did not ask for it, ignore this email.

— Purple Club`,
  });
  return { ok: true as const, devCode: undefined };
}

export async function confirmAppEmailCode(emailInput: string, code: string) {
  const email = normalizeEmail(emailInput);
  if (!email || !/^\d{6}$/.test(code)) {
    return { ok: false as const, status: 400, error: "Enter the 6-digit code." };
  }
  const account = await prisma.appAccount.findUnique({ where: { email } });
  if (!account?.codeHash || !account.codeExpires || account.codeExpires.getTime() < Date.now()) {
    return { ok: false as const, status: 400, error: "That code has expired. Ask for another." };
  }
  if (account.codeAttempts >= MAX_CODE_ATTEMPTS) {
    return { ok: false as const, status: 429, error: "Too many tries. Ask for another code." };
  }
  if (account.codeHash !== hashAppSecret(code)) {
    await prisma.appAccount.update({
      where: { id: account.id },
      data: { codeAttempts: { increment: 1 } },
    });
    return { ok: false as const, status: 400, error: "That code does not match." };
  }
  await prisma.appAccount.update({
    where: { id: account.id },
    data: {
      emailVerifiedAt: new Date(),
      codeHash: null,
      codeExpires: null,
      codeAttempts: 0,
    },
  });
  return {
    ok: true as const,
    qualified: Boolean(account.pendingInviteCode),
  };
}

function isAddress(value: string): boolean {
  try {
    const key = new PublicKey(value);
    return key.toBase58() === value;
  } catch {
    return false;
  }
}

export async function registerAppAddress(emailInput: string, address: string) {
  const email = normalizeEmail(emailInput);
  if (!email || !isAddress(address)) {
    return { ok: false as const, status: 400, error: "The email or the address is not valid." };
  }
  const account = await prisma.appAccount.findUnique({ where: { email } });
  if (!account?.emailVerifiedAt) {
    return { ok: false as const, status: 403, error: "Verify the email first." };
  }
  if (account.address && account.address !== address) {
    return {
      ok: false as const,
      status: 409,
      error: "This email already has a key. Enter the phrase from that phone.",
    };
  }

  const token = crypto.randomBytes(32).toString("base64url");
  const saved = await prisma.appAccount.update({
    where: { id: account.id },
    data: { address, sessionHash: hashAppSecret(token) },
  });

  await prisma.user.upsert({
    where: { wallet: address },
    update: {
      email: saved.email,
      emailVerifiedAt: saved.emailVerifiedAt,
    },
    create: {
      wallet: address,
      email: saved.email,
      emailVerifiedAt: saved.emailVerifiedAt,
    },
  });

  const paid = await redeemInvite(saved.id);
  return {
    ok: true as const,
    token,
    qualified: Boolean(saved.pendingInviteCode),
    paid: paid.paid,
    payError: paid.error,
  };
}

async function redeemInvite(accountId: string): Promise<{ paid: boolean; error?: string }> {
  const account = await prisma.appAccount.findUnique({ where: { id: accountId } });
  if (!account?.address || !account.pendingInviteCode) return { paid: false };
  const settings = await getInviteSettings();
  if (!settings.open) return { paid: false, error: "Invites are closed." };

  const invite = await prisma.appInvite.findUnique({ where: { code: account.pendingInviteCode } });
  if (!invite || invite.status !== "OPEN") return { paid: false, error: "That invite is already used." };

  try {
    const result = await transferPbtcFromTreasury({ recipientWallet: account.address });
    await prisma.appInvite.update({
      where: { id: invite.id },
      data: {
        status: "PAID",
        recipientAccountId: account.id,
        recipientAddress: account.address,
        txSignature: result.signature,
        paidAt: new Date(),
      },
    });
    return { paid: true };
  } catch (error) {
    await prisma.appInvite.update({
      where: { id: invite.id },
      data: { status: "FAILED", recipientAddress: account.address },
    });
    const message = error instanceof Error ? error.message : "The vault could not send the key.";
    return { paid: false, error: message };
  }
}

export async function readAppAccount(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  return prisma.appAccount.findUnique({ where: { sessionHash: hashAppSecret(token) } });
}

export async function addressHoldsKey(address: string): Promise<boolean> {
  const { uiAmount } = await getPbtcBalanceWithFallback(new PublicKey(address));
  return uiAmount >= 1;
}

export async function createMemberInvite(accountId: string) {
  const account = await prisma.appAccount.findUnique({ where: { id: accountId } });
  if (!account?.address) {
    return { ok: false as const, status: 403, error: "Create the key first." };
  }
  if (!(await addressHoldsKey(account.address))) {
    return { ok: false as const, status: 403, error: "Hold 1 PBTC before you invite." };
  }
  const settings = await getInviteSettings();
  if (!settings.open) {
    return { ok: false as const, status: 403, error: "Invites are closed." };
  }
  const used = await prisma.appInvite.count({ where: { senderAccountId: account.id } });
  if (used >= settings.memberCap) {
    return { ok: false as const, status: 403, error: "You have used your invites." };
  }
  const created = await prisma.appInvite.create({
    data: { code: newInviteCode(), senderAccountId: account.id },
  });
  return { ok: true as const, code: created.code, remaining: settings.memberCap - used - 1 };
}

export async function grantKey(address: string) {
  if (!isAddress(address)) {
    return { ok: false as const, status: 400, error: "That address is not valid." };
  }
  const result = await transferPbtcFromTreasury({ recipientWallet: address });
  await prisma.appInvite.create({
    data: {
      code: `GRANT-${newInviteCode()}`,
      recipientAddress: address,
      status: "PAID",
      txSignature: result.signature,
      paidAt: new Date(),
    },
  });
  return { ok: true as const, signature: result.signature };
}

export function restoreMessage(address: string): string {
  return `Purple Club\nRestore this phone\nAddress: ${address}`;
}

export async function restoreAppSession(address: string, message: string, signature: string) {
  if (!isAddress(address) || message !== restoreMessage(address)) {
    return { ok: false as const, status: 400, error: "This key did not sign the restore." };
  }
  let signatureBytes: Uint8Array;
  try {
    signatureBytes = bs58.decode(signature);
  } catch {
    return { ok: false as const, status: 400, error: "This key did not sign the restore." };
  }
  const valid = nacl.sign.detached.verify(
    new TextEncoder().encode(message),
    signatureBytes,
    new PublicKey(address).toBytes(),
  );
  if (!valid) {
    return { ok: false as const, status: 401, error: "This key did not sign the restore." };
  }
  const account = await prisma.appAccount.findUnique({ where: { address } });
  if (!account) {
    return { ok: false as const, status: 404, error: "This key was never registered." };
  }
  const token = crypto.randomBytes(32).toString("base64url");
  await prisma.appAccount.update({
    where: { id: account.id },
    data: { sessionHash: hashAppSecret(token) },
  });
  return { ok: true as const, token, email: account.email };
}
