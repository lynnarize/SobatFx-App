import crypto from "node:crypto";
import { hit } from "./guard";
import {
  approveTransfer,
  claimTransfer,
  displayStatus,
  getOrder,
  grantManually,
  pendingClaims,
  plans,
  rejectTransfer,
  type Order,
} from "./payments";
import { isMonth, monthOf, revenueReport, salesFor } from "./revenue";
import { kv } from "./store";
import { adminIds, esc, isAdmin, send, tg } from "./telegram";
import { isPaidTier, TIER_INFO, type PaidTier } from "./tiers";
import { effectiveTier, getUser } from "./users";

// The owner's bank-transfer console, driven by Telegram webhook updates (POST /api/telegram/webhook).
//   Customer → bot:  /start <orderId>, then a photo of the transfer proof        (optional: the site also has "I've paid")
//   Owner   → bot:   ✅ Approve / ❌ Reject buttons on every claimed transfer,
//                    /pending, /status <email>, /grant <email> <pro|ultra> [days], /revenue [YYYY-MM]
// Every owner action checks the sender's Telegram id against TELEGRAM_ADMIN_IDS. Anything a customer can reach
// only ever forwards a message to the owner: it never activates anything by itself.

interface Chat {
  id: number;
  type: string;
}
interface Message {
  message_id: number;
  from?: { id: number };
  chat: Chat;
  text?: string;
  photo?: unknown[];
  document?: unknown;
}
interface CallbackQuery {
  id: string;
  from: { id: number };
  data?: string;
  message?: Message;
}
export interface Update {
  message?: Message;
  callback_query?: CallbackQuery;
}

const idr = (n: number) => "Rp " + n.toLocaleString("id-ID");
const dateId = (ms: number) => new Date(ms).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

// ─── Parsing ─────────────────────────────────────────────────────────────

const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

/** "/grant a@b.com pro 30" → { email, tier, days }. "ultra" and "ultimate" both mean the top plan. Null if malformed. */
export function parseGrant(text: string): { email: string; tier: PaidTier; days?: number } | null {
  const [cmd, email, tierWord, daysWord, ...rest] = text.trim().split(/\s+/);
  if (!/^\/grant(@\w+)?$/i.test(cmd ?? "") || rest.length || !email || !EMAIL.test(email)) return null;
  const tierName = tierWord?.toLowerCase() === "ultra" ? "ultimate" : tierWord?.toLowerCase();
  if (!tierName || !isPaidTier(tierName)) return null;
  if (daysWord === undefined) return { email: email.toLowerCase(), tier: tierName };
  const days = /^\d{1,3}$/.test(daysWord) ? Number(daysWord) : 0;
  return days >= 1 && days <= 366 ? { email: email.toLowerCase(), tier: tierName, days } : null;
}

/** Text after the command: "/start@bot ABC" → "ABC". */
const argOf = (text: string) => text.trim().split(/\s+/).slice(1).join(" ");

// ─── Owner notifications ─────────────────────────────────────────────────

const decisionButtons = (id: string) => ({
  inline_keyboard: [[{ text: "✅ Approve", callback_data: `ok:${id}` }, { text: "❌ Reject", callback_data: `no:${id}` }]],
});

function orderCard(o: Order, headline: string) {
  return [
    `<b>${headline}</b>`,
    `Order: <code>${esc(o.id)}</code>`,
    `Plan: ${TIER_INFO[o.tier].label} · ${o.days} days`,
    `Email: <code>${esc(o.email)}</code>`,
    `Amount: <b>${idr(o.amount)}</b>`,
    "",
    "Approve only after you see exactly this amount in your bank statement. A screenshot alone proves nothing.",
  ].join("\n");
}

/** Pings every owner with the order and the buttons. True if at least one of them received it. */
export async function notifyClaim(o: Order): Promise<boolean> {
  const sent = await Promise.all(adminIds().map((id) => send(id, orderCard(o, "💸 Transfer claimed"), { reply_markup: decisionButtons(o.id) })));
  return sent.some(Boolean);
}

// ─── Updates ─────────────────────────────────────────────────────────────

export async function handleUpdate(u: Update) {
  if (u.callback_query) return handleCallback(u.callback_query);
  const m = u.message;
  if (!m || m.chat.type !== "private") return;
  const text = m.text?.trim() ?? "";
  const admin = isAdmin(m.from?.id);

  // Anyone may ask: it only reveals their own id, and tells the owner exactly what to put in TELEGRAM_ADMIN_IDS.
  if (/^\/myid(@\w+)?$/i.test(text)) {
    const id = m.from?.id ?? m.chat.id;
    return send(m.chat.id, `Telegram id: <code>${id}</code>\n${admin ? "✅ Admin on this server" : `Not an admin on this server (${adminIds().length} admin id(s) configured)`}`);
  }
  if (admin && text.startsWith("/")) return handleAdminCommand(m, text);
  if (/^\/start(@\w+)?(\s|$)/i.test(text)) return handleStart(m, argOf(text));
  if (m.photo || m.document) return handleProof(m);
  if (admin) return send(m.chat.id, ADMIN_HELP);
  return send(m.chat.id, "Halo! Buka halaman <b>Paket</b> di SobatFX, pilih <i>Transfer bank</i>, lalu tekan tombol <b>Kirim bukti via Telegram</b>.");
}

const ADMIN_HELP = [
  "<b>SobatFX payments</b>",
  "/pending — transfers waiting for you",
  "/myid — your Telegram id (works for anyone)",
  "/status <code>email</code> — a customer's plan",
  "/grant <code>email pro|ultra [days]</code> — activate a plan by hand",
  "/revenue <code>[YYYY-MM]</code> — sales this month (or that month)",
  "",
  "Customers' transfers arrive here with ✅ / ❌ buttons.",
].join("\n");

async function handleAdminCommand(m: Message, text: string) {
  const chat = m.chat.id;
  const cmd = text.split(/\s+/)[0].toLowerCase().replace(/@\w+$/, "");

  if (cmd === "/pending") {
    const orders = await pendingClaims();
    if (!orders.length) return send(chat, "Nothing waiting. 🎉");
    for (const o of orders) await send(chat, orderCard(o, displayStatus(o) === "expired" ? "⏳ Waiting (order expired)" : "⏳ Waiting"), { reply_markup: decisionButtons(o.id) });
    return;
  }

  if (cmd === "/status") {
    const email = argOf(text).toLowerCase();
    if (!EMAIL.test(email)) return send(chat, "Usage: /status <code>email</code>");
    const user = await getUser(email);
    if (!user) return send(chat, `No account for <code>${esc(email)}</code>. They have never signed in with that address.`);
    const { tier, until } = effectiveTier(user);
    return send(chat, `<code>${esc(email)}</code>\n${TIER_INFO[tier].label}${until ? ` until ${dateId(until)}` : ""}`);
  }

  if (cmd === "/revenue") {
    const month = argOf(text) || monthOf(Date.now());
    if (!isMonth(month)) return send(chat, "Usage: /revenue <code>[YYYY-MM]</code>\nExample: /revenue <code>2026-09</code>");
    return send(chat, revenueReport(month, await salesFor(month)));
  }

  if (cmd === "/grant") {
    const g = parseGrant(text);
    if (!g) return send(chat, "Usage: /grant <code>email pro|ultra [days]</code>\nExample: /grant <code>budi@gmail.com pro 30</code>");
    const days = g.days ?? plans()[g.tier].days;
    const user = await getUser(g.email);
    // Nothing happens yet: a typo in the email would activate a stranger, so the owner confirms what was understood first.
    const token = crypto.randomBytes(6).toString("hex");
    await kv.set(`tggrant:${token}`, { ...g, days, by: String(m.from?.id) }, { ex: 600 });
    const account = user ? `existing account (now ${TIER_INFO[effectiveTier(user).tier].label})` : "⚠️ NEW — this address has never signed in. Check the spelling.";
    return send(chat, `Grant <b>${TIER_INFO[g.tier].label}</b> for ${days} days to <code>${esc(g.email)}</code>?\nAccount: ${account}`, {
      reply_markup: { inline_keyboard: [[{ text: "✅ Confirm", callback_data: `gy:${token}` }, { text: "Cancel", callback_data: `gn:${token}` }]] },
    });
  }

  return send(chat, ADMIN_HELP);
}

async function handleCallback(q: CallbackQuery) {
  if (!isAdmin(q.from.id)) return void (await tg("answerCallbackQuery", { callback_query_id: q.id, text: "Not allowed" }));
  const [action, arg = ""] = (q.data ?? "").split(":");
  const chat = q.message?.chat.id;
  const done = async (text: string) => {
    await tg("answerCallbackQuery", { callback_query_id: q.id, text });
    if (!q.message) return;
    await tg("editMessageReplyMarkup", { chat_id: q.message.chat.id, message_id: q.message.message_id, reply_markup: { inline_keyboard: [] } });
    await send(q.message.chat.id, text, { reply_parameters: { message_id: q.message.message_id, allow_sending_without_reply: true } });
  };

  if (action === "ok") {
    const r = await approveTransfer(arg);
    if (!r) return done("Order not found.");
    if (!r.granted) {
      if (r.order.status === "paid") return done("Already approved.");
      if (r.order.status === "failed") return done("This order was already rejected. Use /grant if it should be activated.");
      return done("This order is busy (a payment is being processed). Tap Approve again in a moment.");
    }
    await notifyCustomer(r.order, `✅ Pembayaran dikonfirmasi. Paket ${TIER_INFO[r.order.tier].label} aktif selama ${r.order.days} hari. Selamat menganalisis!`);
    return done(`✅ Approved ${r.order.id}\n${TIER_INFO[r.order.tier].label} · ${r.order.days} days for ${r.order.email}`);
  }

  if (action === "no") {
    const r = await rejectTransfer(arg);
    if (!r) return done("Order not found.");
    if (!r.rejected) return done(r.order.status === "paid" ? "Already approved, nothing changed." : "Already rejected.");
    await notifyCustomer(r.order, `Kami belum menemukan transfer Anda untuk pesanan ${r.order.id}. Jika Anda sudah transfer, balas pesan ini dengan bukti dan nomor pesanan.`);
    return done(`❌ Rejected ${r.order.id}`);
  }

  if (action === "gn") return done("Cancelled.");

  if (action === "gy") {
    // Single use: a second tap (or Telegram retrying the update) must not extend the plan twice.
    if ((await kv.incr(`tggrantlock:${arg}`)) !== 1) return done("Already handled.");
    await kv.expire(`tggrantlock:${arg}`, 900);
    const g = await kv.get<{ email: string; tier: PaidTier; days: number; by: string }>(`tggrant:${arg}`);
    if (!g) return done("That confirmation expired. Send /grant again.");
    const user = await grantManually(g.email, g.tier, g.days, `telegram:${g.by}`);
    const until = g.tier === "ultimate" ? user.ultimateUntil : user.proUntil;
    return done(`✅ ${TIER_INFO[g.tier].label} for ${g.email}, now until ${until ? dateId(until) : "?"}`);
  }

  if (chat) await send(chat, ADMIN_HELP);
}

/** Tells the customer, if they ever opened the bot for this order. */
async function notifyCustomer(o: Order, text: string) {
  const chat = await kv.get<number>(`tgchat:${o.id}`);
  if (chat) await send(chat, esc(text));
}

// ─── Customer side: proof of transfer ────────────────────────────────────

async function handleStart(m: Message, orderId: string) {
  const o = orderId ? await getOrder(orderId) : null;
  if (!o || o.method !== "transfer") return send(m.chat.id, "Halo! Buka halaman <b>Paket</b> di SobatFX, pilih <i>Transfer bank</i>, lalu tekan <b>Kirim bukti via Telegram</b>.");
  if (displayStatus(o) !== "pending") return send(m.chat.id, "Pesanan ini sudah tidak aktif. Buat pesanan baru di halaman Paket.");
  await kv.set(`tgproof:${m.chat.id}`, o.id, { ex: 48 * 3600 });
  await kv.set(`tgchat:${o.id}`, m.chat.id, { ex: 30 * 86400 });
  return send(m.chat.id, `Pesanan <code>${esc(o.id)}</code> · ${TIER_INFO[o.tier].label}\nTransfer tepat <b>${idr(o.amount)}</b>, lalu kirim foto bukti transfer di sini.`);
}

async function handleProof(m: Message) {
  const orderId = await kv.get<string>(`tgproof:${m.chat.id}`);
  const o = orderId ? await getOrder(orderId) : null;
  if (!o || o.status !== "pending") return send(m.chat.id, "Buka halaman <b>Paket</b> di SobatFX, buat pesanan transfer, lalu tekan <b>Kirim bukti via Telegram</b> dulu.");
  if (!(await hit(`tgproof:${m.chat.id}`, 5, 3600)).ok) return send(m.chat.id, "Terlalu banyak kiriman. Mohon tunggu sebentar.");

  await claimTransfer(o.id);
  const caption = orderCard(o, "🧾 Transfer proof");
  const copies = await Promise.all(
    adminIds().map((id) =>
      tg("copyMessage", { chat_id: id, from_chat_id: m.chat.id, message_id: m.message_id, caption, parse_mode: "HTML", reply_markup: decisionButtons(o.id) }),
    ),
  );
  if (!copies.some(Boolean)) return send(m.chat.id, "Maaf, bukti belum terkirim. Coba lagi sebentar lagi.");
  return send(m.chat.id, "Bukti diterima ✅ Paket akan aktif setelah pembayaran kami konfirmasi, biasanya dalam beberapa jam.");
}
