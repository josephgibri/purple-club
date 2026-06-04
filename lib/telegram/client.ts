/**
 * Thin Telegram Bot API client.
 * Uses fetch — no third-party telegram library, keeping the bundle small.
 */

function getBotToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured.");
  return token;
}

function apiUrl(method: string): string {
  return `https://api.telegram.org/bot${getBotToken()}/${method}`;
}

async function callApi<T = unknown>(
  method: string,
  body: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(apiUrl(method), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = (await res.json()) as { ok: boolean; result?: T; description?: string };
  if (!data.ok) {
    throw new Error(`Telegram API error [${method}]: ${data.description ?? "unknown"}`);
  }
  return data.result as T;
}

export async function sendMessage(params: {
  chatId: number | bigint | string;
  text: string;
  parseMode?: "Markdown" | "HTML";
  disablePreview?: boolean;
  replyMarkup?: InlineKeyboard;
}): Promise<void> {
  await callApi("sendMessage", {
    chat_id: params.chatId.toString(),
    text: params.text,
    parse_mode: params.parseMode ?? "Markdown",
    disable_web_page_preview: params.disablePreview ?? true,
    ...(params.replyMarkup ? { reply_markup: params.replyMarkup } : {}),
  });
}

export async function getChatMember(
  chatId: string | number,
  userId: number,
): Promise<{ status: string }> {
  const result = await callApi<{ status: string }>("getChatMember", {
    chat_id: chatId.toString(),
    user_id: userId,
  });
  return result;
}

/** Creates a single-use invite link (expires in 1 hour). */
export async function createInviteLink(chatId: string | number): Promise<string> {
  const result = await callApi<{ invite_link: string }>("createChatInviteLink", {
    chat_id: chatId.toString(),
    member_limit: 1,
    expire_date: Math.floor(Date.now() / 1000) + 3600,
  });
  return result.invite_link;
}

/** Kicks (bans then immediately unbans) a user from the group. */
export async function kickMember(chatId: string | number, userId: number): Promise<void> {
  await callApi("banChatMember", {
    chat_id: chatId.toString(),
    user_id: userId,
    revoke_messages: false,
  });
  // Unban so they can rejoin if they re-qualify later.
  await callApi("unbanChatMember", {
    chat_id: chatId.toString(),
    user_id: userId,
    only_if_banned: true,
  });
}

export type InlineKeyboard = {
  inline_keyboard: { text: string; url?: string; callback_data?: string }[][];
};

export function urlButton(text: string, url: string): InlineKeyboard {
  return { inline_keyboard: [[{ text, url }]] };
}

export function getMainGroupId(): string {
  const id = process.env.TELEGRAM_MAIN_GROUP_ID?.trim();
  if (!id) throw new Error("TELEGRAM_MAIN_GROUP_ID is not configured.");
  return id;
}

export function getBotUsername(): string {
  return process.env.TELEGRAM_BOT_USERNAME?.trim() ?? "Purple_connect_bot";
}
