import crypto from "node:crypto";
import { announceSale, indexSale } from "./revenue";
import { kv } from "./store";
import { telegramConfigured } from "./telegram";
import { grantTier } from "./users";
import { isPaidTier, type PaidTier } from "./tiers";

// QRIS via Midtrans Core API (payment_type "qris").
// Docs: https://docs.midtrans.com/reference/qris
// Bank transfer (manual): the customer transfers an amount that ends in a unique 3-digit code, then the owner
// approves it from Telegram (see telegram-bot.ts). Same Order record, same idempotent grant.

export interface Order {
  id: string;
  email: string;
  tier: PaidTier;
  amount: number;
  days: number;
  status: "pending" | "paid" | "expired" | "failed";
  createdAt: number;
  /** When it was settled. Absent on orders paid before the sales book existed (see revenue.ts). */
  paidAt?: number;
  /** Absent on orders created before bank transfer existed: those are QRIS. */
  method?: "qris" | "transfer" | "manual";
  qrString?: string;
  expiresAt?: number;
  /** Transfer only: when the customer said "I've paid" (or sent proof). */
  claimedAt?: number;
  /** Manual grants only: which admin did it. */
  note?: string;
  /** Voucher code that set the price (lowercased), if any. */
  voucher?: string;
}

export function plans() {
  const days = Number(process.env.PLAN_DAYS || 30);
  // listPriceUsd: the normal price shown struck through next to the (discounted) IDR price that QRIS charges.
  const usd = (v: string | undefined, d?: number) => (v ? Number(v) || undefined : d);
  return {
    pro: { tier: "pro" as const, priceIdr: Number(process.env.PRO_PRICE_IDR || 149000), listPriceUsd: usd(process.env.PRO_LIST_PRICE_USD, 10), days },
    ultimate: { tier: "ultimate" as const, priceIdr: Number(process.env.ULTIMATE_PRICE_IDR || 299000), listPriceUsd: usd(process.env.ULTIMATE_LIST_PRICE_USD), days },
  };
}

/**
 * Voucher codes per plan: PRO_VOUCHER_CODE (comma-separated, case-insensitive) sells Pro at PRO_VOUCHER_PRICE_IDR
 * (default 129000); ULTIMATE_VOUCHER_CODE / ULTIMATE_VOUCHER_PRICE_IDR likewise. Unset code = no voucher.
 * Returns the discounted price, or null if the code isn't valid for that plan.
 */
export function voucherPrice(tier: PaidTier, code: unknown): number | null {
  if (typeof code !== "string" || !code.trim()) return null;
  const env = tier === "pro" ? "PRO" : "ULTIMATE";
  const codes = (process.env[`${env}_VOUCHER_CODE`] ?? "").split(",").map((c) => c.trim().toLowerCase()).filter(Boolean);
  if (!codes.includes(code.trim().toLowerCase())) return null;
  const price = Number(process.env[`${env}_VOUCHER_PRICE_IDR`] || (tier === "pro" ? 129000 : 0));
  return price > 0 && price < plans()[tier].priceIdr ? price : null;
}

/** The plan's price for this order, with the voucher applied when it is valid. */
function priceFor(tier: PaidTier, voucher?: string) {
  const v = voucherPrice(tier, voucher);
  return v ? { price: v, voucher: voucher!.trim().toLowerCase() } : { price: plans()[tier].priceIdr, voucher: undefined };
}

const base = () => (process.env.MIDTRANS_IS_PRODUCTION === "true" ? "https://api.midtrans.com" : "https://api.sandbox.midtrans.com");
const auth = () => "Basic " + Buffer.from(`${process.env.MIDTRANS_SERVER_KEY ?? ""}:`).toString("base64");
const orderKey = (id: string) => `order:${id}`;

/** QRIS_COMING_SOON=true keeps QRIS visible but switched off (the Midtrans webhook still settles any order already made). */
export const qrisComingSoon = () => process.env.QRIS_COMING_SOON === "true";

/** QRIS can take orders: Midtrans is set up and it hasn't been parked as "coming soon". */
export const paymentsConfigured = () => Boolean(process.env.MIDTRANS_SERVER_KEY) && !qrisComingSoon();

/** Plans that can be bought right now (PAID_TIERS, default "pro,ultimate"; "ultra" means ultimate). The others show "coming soon". */
export const saleTiers = (): PaidTier[] =>
  (process.env.PAID_TIERS ?? "pro,ultimate")
    .split(",")
    .map((s) => s.trim().toLowerCase().replace(/^ultra$/, "ultimate"))
    .filter(isPaidTier);

const newOrderId = (tier: PaidTier, kind = "") => `SFX-${kind}${tier.toUpperCase()}-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`.toUpperCase();

export async function createQrisOrder(email: string, tier: PaidTier, voucherCode?: string): Promise<Order> {
  const plan = plans()[tier];
  const { price, voucher } = priceFor(tier, voucherCode);
  const id = newOrderId(tier);
  const r = await fetch(`${base()}/v2/charge`, {
    method: "POST",
    headers: { Authorization: auth(), "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      payment_type: "qris",
      transaction_details: { order_id: id, gross_amount: price },
      item_details: [{ id: `plan-${tier}`, price, quantity: 1, name: `SobatFX AI ${tier === "pro" ? "Pro" : "Ultra"} ${plan.days} hari` }],
      customer_details: { email },
      qris: { acquirer: "gopay" },
      custom_expiry: { expiry_duration: 15, unit: "minute" },
    }),
  });
  const j = await r.json();
  if (!r.ok || !["200", "201"].includes(String(j.status_code)) || !j.qr_string) {
    console.error("[qris] charge failed", j.status_code, j.status_message);
    throw new Error("Could not create QRIS payment");
  }
  const order: Order = {
    id,
    email,
    tier,
    amount: price,
    days: plan.days,
    status: "pending",
    createdAt: Date.now(),
    method: "qris",
    voucher,
    qrString: j.qr_string,
    expiresAt: j.expiry_time ? Date.parse(j.expiry_time.replace(" ", "T") + "+07:00") : Date.now() + 15 * 60_000,
  };
  await kv.set(orderKey(id), order, { ex: 90 * 86400 });
  return order;
}

/** Shape of every id newOrderId() makes. Anything else is never looked up, so request input can't pick arbitrary keys. */
const ORDER_ID = /^SFX-[A-Z0-9-]{6,64}$/;
export const isOrderId = (id: unknown): id is string => typeof id === "string" && ORDER_ID.test(id);

export async function getOrder(id: string) {
  if (!isOrderId(id)) return null;
  return kv.get<Order>(orderKey(id));
}

/**
 * Grants the plan once per order, however many webhooks, polls or admin taps race each other.
 * Paid orders are kept forever: they are the sales book (revenue.ts). The order is indexed before the grant,
 * so a sale can never be granted without being on record; a failed attempt leaves an index entry that reads skip.
 * The lock expires, so a crash mid-way can't strand the order: the next webhook retry, poll or admin tap finishes it,
 * and grantTier() remembers the order id, so that retry never extends the plan twice.
 */
async function markPaid(order: Order): Promise<Order> {
  const lock = `paylock:${order.id}`;
  if (!(await kv.lock(lock, 120))) return (await getOrder(order.id)) ?? order; // someone else is granting it right now
  try {
    const fresh = (await getOrder(order.id)) ?? order;
    if (fresh.status === "paid") return fresh; // finished by a racing caller that held a stale copy
    const paidAt = Date.now();
    await indexSale(fresh.id, paidAt);
    await grantTier(fresh.email, fresh.tier, fresh.days, fresh.id);
    fresh.status = "paid";
    fresh.paidAt = paidAt;
    await kv.set(orderKey(fresh.id), fresh);
    await announceSale(fresh);
    return fresh;
  } finally {
    await kv.del(lock).catch(() => {});
  }
}

/** Asks Midtrans for the authoritative status and applies it (idempotent). */
export async function syncOrder(id: string): Promise<Order | null> {
  const order = await getOrder(id);
  if (!order || order.status !== "pending") return order;
  if (order.method === "transfer" || order.method === "manual") return order; // not a Midtrans order: only an admin can settle it
  const r = await fetch(`${base()}/v2/${encodeURIComponent(id)}/status`, { headers: { Authorization: auth(), Accept: "application/json" }, cache: "no-store" });
  const j = await r.json();
  const st: string = j.transaction_status;
  const amountOk = Math.round(Number(j.gross_amount)) === order.amount;
  if ((st === "settlement" || st === "capture") && amountOk) return markPaid(order);
  if (st === "expire" || st === "cancel" || st === "deny" || st === "failure") {
    order.status = st === "expire" ? "expired" : "failed";
    await kv.set(orderKey(id), order, { ex: 90 * 86400 });
  }
  return order;
}

export function validNotificationSignature(n: { order_id: string; status_code: string; gross_amount: string; signature_key: string }) {
  const key = process.env.MIDTRANS_SERVER_KEY;
  // The body is untrusted JSON: anything but 128 hex chars (a SHA-512) is rejected before comparing, so the buffers always match in length.
  if (!key || typeof n.signature_key !== "string" || !/^[0-9a-f]{128}$/i.test(n.signature_key)) return false;
  const expected = crypto.createHash("sha512").update(n.order_id + n.status_code + n.gross_amount + key).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(n.signature_key, "hex"));
}

// ─── Bank transfer (manual approval through Telegram) ────────────────────

export const TRANSFER_HOURS = 24;
const TRANSFER_MS = TRANSFER_HOURS * 3600_000;

/** Where customers send the money (BANK_NAME / BANK_ACCOUNT_NUMBER / BANK_ACCOUNT_HOLDER). */
export function bankAccount() {
  const { BANK_NAME: name, BANK_ACCOUNT_NUMBER: number, BANK_ACCOUNT_HOLDER: holder } = process.env;
  return name && number && holder ? { name, number, holder } : null;
}

/** Needs the bank details and a working Telegram bot: without the bot nobody would ever approve the order. */
export const transferConfigured = () => Boolean(bankAccount() && telegramConfigured());

// Each amount is held by one order (the key stores its id) until the owner settles it:
//  - unclaimed: a little longer than the payment deadline, so abandoned orders give their code back within a day;
//  - claimed ("I've paid" / proof sent): long enough for a late approval, since an expired order can still be approved.
const UNCLAIMED_HOLD_SEC = TRANSFER_HOURS * 3600 + 3600;
const CLAIMED_HOLD_SEC = 14 * 86400;
const amountKey = (amount: number) => `transferamt:${amount}`;

/** Price + a 3-digit code no unsettled order is using, so the owner can tell orders apart on the bank statement. */
export async function reserveUniqueAmount(base: number, orderId: string): Promise<number> {
  const start = crypto.randomInt(0, 999);
  for (let i = 0; i < 999; i++) {
    const amount = base + ((start + i) % 999) + 1;
    if (await kv.lock(amountKey(amount), UNCLAIMED_HOLD_SEC, orderId)) return amount;
  }
  throw new Error("No free transfer amount");
}

/** Keeps a claimed order's amount taken until the owner decides (retaking it if the short hold already lapsed). */
async function holdAmount(o: Order) {
  const key = amountKey(o.amount);
  if (await kv.lock(key, CLAIMED_HOLD_SEC, o.id)) return;
  if ((await kv.get<string>(key)) === o.id) await kv.expire(key, CLAIMED_HOLD_SEC);
  else console.warn(`[payments] transfer amount ${o.amount} of ${o.id} is now held by another order`);
}

/** Gives the amount back once the order is settled, but only while this order is still the one holding it. */
async function releaseAmount(o: Order) {
  const key = amountKey(o.amount);
  if ((await kv.get<string>(key)) === o.id) await kv.del(key);
}

/** Creates the customer's transfer order, or returns the one they already have open for this plan (reopening the dialog is free). */
export async function createTransferOrder(email: string, tier: PaidTier, voucherCode?: string): Promise<Order> {
  const { price, voucher } = priceFor(tier, voucherCode);
  const openKey = `transfer:open:${email}:${tier}`;
  const openId = await kv.get<string>(openKey);
  const open = openId ? await getOrder(openId) : null;
  // Reuse only if it was made at the same price (a voucher added or removed since gets a new order).
  if (open?.status === "pending" && (open.expiresAt ?? 0) > Date.now() && open.voucher === voucher) return open;

  const plan = plans()[tier];
  const id = newOrderId(tier, "T");
  const order: Order = {
    id,
    email,
    tier,
    amount: await reserveUniqueAmount(price, id),
    days: plan.days,
    status: "pending",
    createdAt: Date.now(),
    method: "transfer",
    voucher,
    expiresAt: Date.now() + TRANSFER_MS,
  };
  await kv.set(orderKey(order.id), order, { ex: 90 * 86400 });
  await kv.set(openKey, order.id, { ex: TRANSFER_HOURS * 3600 });
  return order;
}

/** "I've paid" / proof sent. Returns false if it was already claimed, so the owner is only pinged once per order. */
export async function claimTransfer(order: Order): Promise<boolean> {
  if (order.claimedAt) return false;
  order.claimedAt = Date.now();
  await kv.set(orderKey(order.id), order, { ex: 90 * 86400 });
  await kv.lpushCapped("transfer:claims", order.id, 50);
  await holdAmount(order);
  return true;
}

/** Claimed transfers that still wait for the owner (newest first). */
export async function pendingClaims(): Promise<Order[]> {
  const ids = await kv.lrange("transfer:claims", 0, 49);
  const orders = await kv.mget<Order>(ids.map(orderKey));
  return orders.filter((o): o is Order => o?.status === "pending" || o?.status === "expired");
}

/** The owner confirms the money arrived. An expired order can still be approved: the money is real. */
export async function approveTransfer(id: string): Promise<{ order: Order; granted: boolean } | null> {
  const order = await getOrder(id);
  if (!order || order.method !== "transfer") return null;
  if (order.status === "paid" || order.status === "failed") return { order, granted: false };
  const paid = await markPaid(order);
  if (paid.status === "paid") await releaseAmount(paid);
  return { order: paid, granted: paid.status === "paid" };
}

export async function rejectTransfer(id: string): Promise<{ order: Order; rejected: boolean } | null> {
  const order = await getOrder(id);
  if (!order || order.method !== "transfer") return null;
  if (order.status === "paid" || order.status === "failed") return { order, rejected: false };
  order.status = "failed";
  await kv.set(orderKey(id), order, { ex: 90 * 86400 });
  await releaseAmount(order);
  return { order, rejected: true };
}

/** Owner-typed grant (/grant email tier). Kept as a paid order (amount 0) so the sales book shows who got what and when. */
export async function grantManually(email: string, tier: PaidTier, days: number, by: string) {
  const now = Date.now();
  const order: Order = { id: newOrderId(tier, "M"), email, tier, amount: 0, days, status: "paid", createdAt: now, paidAt: now, method: "manual", note: by };
  await indexSale(order.id, now);
  const user = await grantTier(email, tier, days, order.id);
  await kv.set(orderKey(order.id), order);
  return user;
}

/** What the customer's dialog sees: a pending transfer past its deadline shows as expired (nothing is written). */
export function displayStatus(o: Order): Order["status"] {
  return o.status === "pending" && o.method === "transfer" && (o.expiresAt ?? 0) < Date.now() ? "expired" : o.status;
}

/** What the customer's dialog needs to show and to poll. */
export function transferView(o: Order) {
  const bot = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "");
  return {
    orderId: o.id,
    amount: o.amount,
    tier: o.tier,
    days: o.days,
    expiresAt: o.expiresAt,
    status: displayStatus(o),
    claimed: Boolean(o.claimedAt),
    bank: bankAccount(),
    proofUrl: bot ? `https://t.me/${bot}?start=${o.id}` : undefined,
  };
}
