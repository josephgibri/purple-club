/**
 * High-level member operations used by both the webhook handlers and the cron.
 */

import { PublicKey } from "@solana/web3.js";
import { prisma } from "@/lib/prisma";
import { getPbtcBalanceWithFallback } from "@/lib/solana";
import { getRank } from "@/lib/ranks";
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

  const rank = balance !== null ? getRank(balance) : null;
  const effective = member.effectiveTier ?? "—";
  const pending = member.pendingTier;
  const tierSince = member.tierSince
    ? member.tierSince.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : null;

  let holdLine = "";
  if (pending && member.pendingSince) {
    const daysLeft = Math.max(
      0,
      7 - Math.floor((Date.now() - member.pendingSince.getTime()) / 86_400_000),
    );
    holdLine = `\n⏳ *${pending}* unlocks in ~${daysLeft} day${daysLeft === 1 ? "" : "s"}`;
  }

  const nextRank = rank?.next;
  const nextLine = nextRank
    ? `\n📈 Next: *${nextRank.title}* at ${nextRank.min.toLocaleString()} PBTC`
    : "";

  return (
    `💜 *Purple Club — Member Status*\n\n` +
    `👛 Wallet: \`${user.wallet.slice(0, 6)}…${user.wallet.slice(-4)}\`\n` +
    `💰 Balance: *${balanceStr}*\n` +
    `🏅 Tier: *${effective}*${tierSince ? ` _(since ${tierSince})_` : ""}` +
    holdLine +
    nextLine +
    `\n\n_Balance updated every hour._`
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

  // Notify member on tier change
  if (update.tierChanged && update.effectiveTier && !update.shouldKick) {
    await sendMessage({
      chatId: telegramId,
      text:
        `🎉 *Tier update!*\n\nYou are now a *${update.effectiveTier}* in The Purple Court.\n\n` +
        `Use /status to see your full standing.`,
    }).catch(() => undefined); // non-critical
  }

  // Kick if past grace window
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
