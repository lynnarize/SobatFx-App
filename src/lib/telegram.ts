import crypto from "node:crypto";

// Thin Telegram Bot API client. Used by the bank-transfer flow: the bot tells the owner about a claimed transfer
// and the owner approves it with a button (or /grant). Nothing here touches payments — see telegram-bot.ts.

const token = () => process.env.TELEGRAM_BOT_TOKEN ?? "";

/** Numeric Telegram user ids allowed to approve payments (TELEGRAM_ADMIN_IDS; commas, spaces, semicolons or new lines between them). */
export const adminIds = () =>
  (process.env.TELEGRAM_ADMIN_IDS || "")
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter((s) => /^\d+$/.test(s))
    .map(Number);

export const isAdmin = (id: number | undefined) => id !== undefined && adminIds().includes(id);

export const telegramConfigured = () => Boolean(token() && process.env.TELEGRAM_WEBHOOK_SECRET && adminIds().length);

/** Telegram sends the secret we registered with setWebhook in this header. Fails closed when no secret is set. */
export function validWebhookSecret(header: string | null) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";
  if (!secret || !header || header.length !== secret.length) return false;
  return crypto.timingSafeEqual(Buffer.from(header), Buffer.from(secret));
}

/** Escapes user-controlled text (emails, names) for parse_mode HTML. */
export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Calls a Bot API method. Returns the result, or null on any failure (logged without the token). */
export async function tg<T = unknown>(method: string, body: Record<string, unknown>): Promise<T | null> {
  try {
    const r = await fetch(`https://api.telegram.org/bot${token()}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const j = (await r.json()) as { ok: boolean; result?: T; description?: string };
    if (!j.ok) {
      console.error("[telegram]", method, r.status, j.description);
      return null;
    }
    return (j.result ?? true) as T;
  } catch (e) {
    console.error("[telegram]", method, "request failed:", (e as Error).message);
    return null;
  }
}

export const send = (chat_id: number, text: string, extra: Record<string, unknown> = {}) =>
  tg("sendMessage", { chat_id, text, parse_mode: "HTML", link_preview_options: { is_disabled: true }, ...extra });
