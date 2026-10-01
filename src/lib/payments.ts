import crypto from "node:crypto";
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
  /** Absent on orders created before bank transfer existed: those are QRIS. */
  method?: "qris" | "transfer" | "manual";
  qrString?: string;
  expiresAt?: number;
  /** Transfer only: when the customer said "I've paid" (or sent proof). */
  claimedAt?: number;
  /** Manual grants only: which admin did it. */
  note?: string;
}

export function plans() {
  const days = Number(process.env.PLAN_DAYS || 30);
  // listPriceUsd: the normal price shown struck through next to the (discounted) IDR price that QRIS charges.
  const usd = (v: string | undefined, d?: number) => (v ? Number(v) || undefined : d);
  return {
    pro: { tier: "pro" as const, priceIdr: Number(process.env.PRO_PRICE_IDR || 99000), listPriceUsd: usd(process.env.PRO_LIST_PRICE_USD, 10), days },
    ultimate: { tier: "ultimate" as const, priceIdr: Number(process.env.ULTIMATE_PRICE_IDR || 299000), listPriceUsd: usd(process.env.ULTIMATE_LIST_PRICE_USD), days },
  };
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

export async function createQrisOrder(email: string, tier: PaidTier): Promise<Order> {
  const plan = plans()[tier];
  const id = newOrderId(tier);
  const r = await fetch(`${base()}/v2/charge`, {
    method: "POST",
    headers: { Authorization: auth(), "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      payment_type: "qris",
      transaction_details: { order_id: id, gross_amount: plan.priceIdr },
      item_details: [{ id: `plan-${tier}`, price: plan.priceIdr, quantity: 1, name: `SobatFX AI ${tier === "pro" ? "Pro" : "Ultra"} ${plan.days} hari` }],
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
    amount: plan.priceIdr,
    days: plan.days,
    status: "pending",
    createdAt: Date.now(),
    method: "qris",
    qrString: j.qr_string,
    expiresAt: j.expiry_time ? Date.parse(j.expiry_time.replace(" ", "T") + "+07:00") : Date.now() + 15 * 60_000,
  };
  await kv.set(orderKey(id), order, { ex: 90 * 86400 });
  return order;
}

export async function getOrder(id: string) {
  return kv.get<Order>(orderKey(id));
}

/** Grants the plan once per order, however many webhooks, polls or admin taps race each other. */
async function markPaid(order: Order): Promise<Order> {
  const lock = await kv.incr(`orderlock:${order.id}`);
  if (lock === 1) {
    try {
      await grantTier(order.email, order.tier, order.days);
    } catch (e) {
      // Release the lock so the next webhook retry, status poll or admin tap can grant it — the user has already paid.
      await kv.decr(`orderlock:${order.id}`).catch(() => {});
      throw e;
    }
    order.status = "paid";
    await kv.set(orderKey(order.id), order, { ex: 365 * 86400 });
  }
  return (await getOrder(order.id)) ?? order;
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
  const expected = crypto
    .createHash("sha512")
    .update(n.order_id + n.status_code + n.gross_amount + (process.env.MIDTRANS_SERVER_KEY ?? ""))
    .digest("hex");
  return n.signature_key?.length === expected.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(n.signature_key));
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

/**
 * Price + a 3-digit code nobody else is using right now, so the owner can tell orders apart on the bank statement.
 * Reserved for a little longer than the order lives, so two open orders never share an amount.
 */
export async function reserveUniqueAmount(base: number): Promise<number> {
  const start = crypto.randomInt(0, 999);
  for (let i = 0; i < 999; i++) {
    const amount = base + ((start + i) % 999) + 1;
    const key = `transferamt:${amount}`;
    if ((await kv.incr(key)) === 1) {
      await kv.expire(key, TRANSFER_HOURS * 3600 + 3600);
      return amount;
    }
    await kv.decr(key);
  }
  throw new Error("No free transfer amount");
}

/** Creates the customer's transfer order, or returns the one they already have open for this plan (reopening the dialog is free). */
export async function createTransferOrder(email: string, tier: PaidTier): Promise<Order> {
  const openKey = `transfer:open:${email}:${tier}`;
  const openId = await kv.get<string>(openKey);
  const open = openId ? await getOrder(openId) : null;
  if (open?.status === "pending" && (open.expiresAt ?? 0) > Date.now()) return open;

  const plan = plans()[tier];
  const order: Order = {
    id: newOrderId(tier, "T"),
    email,
    tier,
    amount: await reserveUniqueAmount(plan.priceIdr),
    days: plan.days,
    status: "pending",
    createdAt: Date.now(),
    method: "transfer",
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
  return { order: paid, granted: paid.status === "paid" };
}

export async function rejectTransfer(id: string): Promise<{ order: Order; rejected: boolean } | null> {
  const order = await getOrder(id);
  if (!order || order.method !== "transfer") return null;
  if (order.status === "paid" || order.status === "failed") return { order, rejected: false };
  order.status = "failed";
  await kv.set(orderKey(id), order, { ex: 90 * 86400 });
  return { order, rejected: true };
}

/** Owner-typed grant (/grant email tier). Kept as a paid order so there is a record of who got what and when. */
export async function grantManually(email: string, tier: PaidTier, days: number, by: string) {
  const user = await grantTier(email, tier, days);
  const order: Order = { id: newOrderId(tier, "M"), email, tier, amount: 0, days, status: "paid", createdAt: Date.now(), method: "manual", note: by };
  await kv.set(orderKey(order.id), order, { ex: 365 * 86400 });
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
