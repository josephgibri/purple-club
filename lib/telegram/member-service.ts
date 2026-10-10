/**
 * High-level member operations used by both the webhook handlers and the cron.
 */

import { PublicKey } from "@solana/web3.js";
import { prisma } from "@/lib/prisma";
import { getPbtcBalanceWithFallback } from "@/lib/solana";
import { computeTierUpdate } from "./tier-machine";
import {
  sendMessage,
  createInviteLink,
  kickMember,
  getMainGroupId,
} from "./client";

// ── Eligibility check (used at join time) ────────────────────────────────────

export async function fetchBalance(wallet: string): Promise<number> {
  try {
    const { uiAmount } = await getPbtcBalanceWithFallback(new PublicKey(wallet));
    return uiAmount;
  } catch {
    return 0;
  }
}

// ── Invite / join ─────────────────────────────────────────────────────────────

export async function issueGroupInvite(telegramId: bigint): Promise<void> {
  const groupId = getMainGroupId();
  const link = await createInviteLink(groupId);

  await sendMessage({
    chatId: telegramId,
    text:
      `✅ *Eligibility confirmed!*\n\n` +
      `Your 1-time invite link to the Purple Club group:\n${link}\n\n` +
      `_This link expires in 1 hour and works once._`,
  });

  await prisma.telegramMember.update({
    where: { telegramId },
    data: { inGroup: true },
  });
}

// ── Status text ───────────────────────────────────────────────────────────────

export async function buildStatusText(telegramId: bigint): Promise<string> {
  const member = await prisma.telegramMember.findUnique({ where: { telegramId } });
  if (!member?.userId) {
    return (
      "🔗 *Wallet not linked yet.*\n\n" +
      "Use /link to connect your Solana wallet and check eligibility."
    );
  }

  const user = await prisma.user.findUnique({ where: { id: member.userId } });
  if (!user) return "⚠️ Member record not found. Please use /link again.";

  const balance = member.lastBalance ? Number(member.lastBalance) : null;
  const balanceStr = balance !== null ? `${balance.toLocaleString()} PBTC` : "Not yet checked";

  const keyHeld = balance !== null && balance >= 1;

  return (
    `💜 *Purple Club*\n\n` +
    `👛 Wallet: \`${user.wallet.slice(0, 6)}…${user.wallet.slice(-4)}\`\n` +
    `💰 Balance: *${balanceStr}*\n` +
    `🔑 Club key: *${keyHeld ? "Held" : "Not held"}* — 1 PBTC\n\n` +
    `_No ranks. The key is the membership._`
  );
}

// ── Full sync for a single member (called by cron) ───────────────────────────

export async function syncMember(telegramId: bigint): Promise<void> {
  const member = await prisma.telegramMember.findUnique({ where: { telegramId } });
  if (!member?.userId) return;

  const user = await prisma.user.findUnique({ where: { id: member.userId } });
  if (!user?.wallet) return;

  const balance = await fetchBalance(user.wallet);
  const now = new Date();

  const update = computeTierUpdate(balance, {
    effectiveTier: member.effectiveTier,
    tierSince: member.tierSince,
    pendingTier: member.pendingTier,
    pendingSince: member.pendingSince,
    belowThresholdSince: member.belowThresholdSince,
    inGroup: member.inGroup,
  }, now);

  await prisma.telegramMember.update({
    where: { telegramId },
    data: {
      lastBalance: balance,
      lastCheckedAt: now,
      effectiveTier: update.effectiveTier,
      tierSince: update.tierSince,
      pendingTier: update.pendingTier,
      pendingSince: update.pendingSince,
      belowThresholdSince: update.shouldKick
        ? member.belowThresholdSince // keep — cron will reset after kick
        : (balance >= 1 ? null : (member.belowThresholdSince ?? now)),
      ...(update.shouldKick ? { inGroup: false } : {}),
    },
  });

  // Kick if the club key is gone past the grace window.
  if (update.shouldKick && member.inGroup) {
    const userId = Number(telegramId);
    const groupId = getMainGroupId();
    await kickMember(groupId, userId).catch(() => undefined);
    await sendMessage({
      chatId: telegramId,
      text:
        `⚠️ *You have been removed from the Purple Club group.*\n\n` +
        `Your wallet no longer holds the minimum 1 PBTC required for membership.\n\n` +
        `Reacquire PBTC and use /join to come back.`,
    }).catch(() => undefined);

    await prisma.telegramMember.update({
      where: { telegramId },
      data: { inGroup: false, effectiveTier: null, tierSince: null, belowThresholdSince: null },
    });
  }
}
