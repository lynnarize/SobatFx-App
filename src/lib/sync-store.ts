import { z } from "zod";
import { kv } from "./store";
import type { SyncData, SyncDoc } from "./sync";

// Server side of the cloud sync: one document per Google account in Redis (in-memory locally).

/** Upstash accepts ~1 MB per request; stay under it. */
export const SYNC_MAX_BYTES = 900_000;

const price = z.number().finite();
const trade = z.object({
  id: z.string().max(64),
  symbol: z.string().max(16),
  side: z.enum(["buy", "sell"]),
  lot: price,
  entry: price,
  pending: z.enum(["limit", "stop"]).optional(),
  sl: price.optional(),
  tp: price.optional(),
  openedAt: price,
  closedAt: price.optional(),
  exit: price.optional(),
  result: z.enum(["tp", "sl", "manual"]).optional(),
  pnl: price.optional(),
});

// Drawings come from the vendored chart library (many optional fields), so only the identity is checked here.
const drawing = z.looseObject({ id: z.string().max(64), type: z.string().max(32) });

export const syncDataSchema = z.object({
  drawings: z.record(z.string().max(16), z.array(drawing).max(500)),
  paper: z.object({ startBalance: price, trades: z.array(trade).max(5000) }),
});

export const emptyData = (): SyncData => ({ drawings: {}, paper: { startBalance: 10_000, trades: [] } });

const docKey = (email: string) => `sync:${email.toLowerCase()}`;

export async function loadDoc(email: string): Promise<SyncDoc> {
  const d = await kv.get<SyncDoc>(docKey(email));
  return d ?? { rev: 0, ...emptyData() };
}

/**
 * Saves `data` when the caller started from the current revision. Returns the stored document, or the newer
 * server copy (`conflict`) for the caller to merge with. Redis has no compare-and-set here, so two saves in the
 * same instant could both pass; the next sync then merges them.
 */
export async function saveDoc(email: string, baseRev: number, data: SyncData): Promise<{ ok: true; rev: number } | { ok: false; current: SyncDoc }> {
  const current = await loadDoc(email);
  if (current.rev !== baseRev) return { ok: false, current };
  const rev = current.rev + 1;
  await kv.set(docKey(email), { rev, ...data });
  return { ok: true, rev };
}
