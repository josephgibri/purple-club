/**
 * Telegram Bot webhook — @Purple_connect_bot
 *
 * Validated by the x-telegram-bot-api-secret-token header set when the
 * webhook was registered. Only processes private (DM) messages.
 *
 * Commands:
 *   /start   — welcome + quick menu
 *   /link    — generate a one-time SIWS link to verify wallet ownership
 *   /join    — check eligibility and issue group invite
 *   /status  — show current balance, tier, and hold progress
 *   /help    — list commands
 */

import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendMessage, urlButton, getBotUsername, getMainGroupId, getChatMember } from "@/lib/telegram/client";
import { buildStatusText, fetchBalance, issueGroupInvite } from "@/lib/telegram/member-service";
import { computeTierUpdate } from "@/lib/telegram/tier-machine";

export const runtime = "nodejs";
export const maxDuration = 30;

// ── Auth ──────────────────────────────────────────────────────────────────────

function validateWebhookSecret(req: Request): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!expected) {
    console.warn("[telegram/webhook] TELEGRAM_WEBHOOK_SECRET not set — refusing all requests.");
    return false;
  }
  const incoming = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  const a = Buffer.from(incoming);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

type TgUser = { id: number; username?: string; first_name?: string };
type TgChat = { id: number; type: string };
type TgMessage = { message_id: number; chat: TgChat; from?: TgUser; text?: string };
type TgUpdate = { update_id: number; message?: TgMessage };

// ── Entry point ───────────────────────────────────────────────────────────────

export async function POST(request: Request): Promise<Response> {
  if (!validateWebhookSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let update: TgUpdate;
  try {
    update = (await request.json()) as TgUpdate;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const message = update.message;
  // Only handle private DMs
  if (!message || message.chat.type !== "private" || !message.from || !message.text) {
    return NextResponse.json({ ok: true });
  }

  try {
    await handleMessage(message);
  } catch (err) {
    console.error("[telegram/webhook] handler error:", err);
  }

  return NextResponse.json({ ok: true });
}

// ── Message router ────────────────────────────────────────────────────────────

async function handleMessage(message: TgMessage): Promise<void> {
  const from = message.from!;
  const chatId = message.chat.id;
  const text = message.text!.trim();
  const telegramId = BigInt(from.id);

  // Upsert member record
  await prisma.telegramMember.upsert({
    where: { telegramId },
    create: { telegramId, username: from.username ?? null },
    update: { username: from.username ?? null },
  });

  const command = text.split(/\s+/)[0].toLowerCase().replace(/@.+$/, "");

  switch (command) {
    case "/start":
      await handleStart(chatId, from, telegramId);
      break;
    case "/link":
      await handleLink(chatId, telegramId);
      break;
    case "/join":
      await handleJoin(chatId, telegramId);
      break;
    case "/status":
    case "/rank":
      await handleStatus(chatId, telegramId);
      break;
    case "/help":
      await handleHelp(chatId);
      break;
    default:
      await handleHelp(chatId);
  }
}

// ── Handlers ──────────────────────────────────────────────────────────────────

async function handleStart(
  chatId: number,
  from: TgUser,
  telegramId: bigint,
): Promise<void> {
  const member = await prisma.telegramMember.findUnique({ where: { telegramId } });
  const linked = !!member?.userId;
  const name = from.first_name ?? from.username ?? "there";

  if (!linked) {
    await sendMessage({
      chatId,
      text:
        `👋 Welcome to *Purple Club*, ${name}!\n\n` +
        `I'm *@${getBotUsername()}* — your gateway to the Purple Club community.\n\n` +
        `To join the group you need to:\n` +
        `1️⃣ Link your Solana wallet — /link\n` +
        `2️⃣ Hold ≥ 1 PBTC\n` +
        `3️⃣ Request your invite — /join\n\n` +
        `Use /help to see all commands.`,
    });
    return;
  }

  await sendMessage({
    chatId,
    text:
      `💜 Welcome back to *Purple Club*, ${name}!\n\n` +
      `Use /status to see your tier, or /join if you haven't joined the group yet.\n` +
      `Need help? /help`,
  });
}

async function handleLink(chatId: number, telegramId: bigint): Promise<void> {
  // Invalidate any existing unexpired session first
  await prisma.telegramLinkSession.updateMany({
    where: {
      telegramId,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: { consumedAt: new Date() },
  });

  const session = await prisma.telegramLinkSession.create({
    data: {
      telegramId,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 min
    },
  });

  const base = process.env.PUBLIC_SITE_URL?.replace(/\/+$/, "") ?? "https://purpleclub.org";
  const linkUrl = `${base}/link/telegram?token=${session.token}`;

  await sendMessage({
    chatId,
    text:
      `🔗 *Link your Solana wallet*\n\n` +
      `Tap the button below to sign in with your wallet on Purple Club.\n` +
      `This proves you own the wallet — your tokens never move.\n\n` +
      `_Link expires in 30 minutes._`,
    replyMarkup: urlButton("🔑 Verify my wallet", linkUrl),
  });
}

async function handleJoin(chatId: number, telegramId: bigint): Promise<void> {
  const member = await prisma.telegramMember.findUnique({ where: { telegramId } });

  if (!member?.userId) {
    await sendMessage({
      chatId,
      text: "⚠️ *Wallet not linked yet.* Use /link first to verify your Solana wallet.",
    });
    return;
  }

  // Check if already in the group
  if (member.inGroup) {
    await sendMessage({
      chatId,
      text: "✅ *You're already in the Purple Club group!* Use /status to see your tier.",
    });
    return;
  }

  // Double-check via Telegram API (they might have left)
  try {
    const chatMember = await getChatMember(getMainGroupId(), Number(telegramId));
    if (["member", "administrator", "creator", "restricted"].includes(chatMember.status)) {
      await prisma.telegramMember.update({
        where: { telegramId },
        data: { inGroup: true },
      });
      await sendMessage({
        chatId,
        text: "✅ *You're already in the Purple Club group!* Use /status to see your tier.",
      });
      return;
    }
  } catch {
    // Group check failed — proceed to eligibility
  }

  const user = await prisma.user.findUnique({ where: { id: member.userId } });
  if (!user?.wallet) {
    await sendMessage({ chatId, text: "⚠️ Wallet not found. Please use /link again." });
    return;
  }

  await sendMessage({ chatId, text: "🔍 Checking your PBTC balance…" });
  const balance = await fetchBalance(user.wallet);

  if (balance < 1) {
    await sendMessage({
      chatId,
      text:
        `❌ *Not eligible yet.*\n\n` +
        `Your wallet holds *${balance} PBTC* — you need at least *1 PBTC* to join.\n\n` +
        `Acquire PBTC on [Jupiter](https://jup.ag/?buy=HfMbPyDdZH6QMaDDUokjYCkHxzjoGBMpgaUvpLWGbF5p) and try /join again.`,
    });
    return;
  }

  // Update balance and issue invite
  const update = computeTierUpdate(balance, {
    effectiveTier: member.effectiveTier,
    tierSince: member.tierSince,
    pendingTier: member.pendingTier,
    pendingSince: member.pendingSince,
    belowThresholdSince: member.belowThresholdSince,
    inGroup: member.inGroup,
  });

  await prisma.telegramMember.update({
    where: { telegramId },
    data: {
      lastBalance: balance,
      lastCheckedAt: new Date(),
      effectiveTier: update.effectiveTier,
      tierSince: update.tierSince ?? new Date(),
      pendingTier: update.pendingTier,
      pendingSince: update.pendingSince,
    },
  });

  await issueGroupInvite(telegramId);
}

async function handleStatus(chatId: number, telegramId: bigint): Promise<void> {
  const text = await buildStatusText(telegramId);
  await sendMessage({ chatId, text });
}

async function handleHelp(chatId: number): Promise<void> {
  await sendMessage({
    chatId,
    text:
      `💜 *Purple Connect — Commands*\n\n` +
      `/start — Welcome message\n` +
      `/link — Connect your Solana wallet\n` +
      `/join — Request your group invite\n` +
      `/status — Your balance, tier & hold progress\n` +
      `/help — This message`,
  });
}
