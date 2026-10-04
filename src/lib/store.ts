import { Redis } from "@upstash/redis";

// Tiny KV facade: Upstash Redis in production (required there), in-memory Map for local dev.

interface KV {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, opts?: { ex?: number }): Promise<void>;
  incr(key: string): Promise<number>;
  decr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<void>;
  mget<T>(keys: string[]): Promise<(T | null)[]>;
  /** Prepend to a list and keep only the newest `max` items. */
  lpushCapped(key: string, value: string, max: number): Promise<void>;
  /** Append to a list, uncapped (permanent logs). */
  rpush(key: string, value: string): Promise<void>;
  lrange(key: string, start: number, stop: number): Promise<string[]>;
  /** SET NX with a TTL: true when this caller took the key. `value` records who holds it (default 1). */
  lock(key: string, ttlSec: number, value?: string): Promise<boolean>;
  del(key: string): Promise<void>;
  /** Atomic compare-and-set on a `{ rev, ... }` document: writes `value` only while the stored rev (0 if none) is `baseRev`. */
  setIfRev(key: string, baseRev: number, value: { rev: number }): Promise<boolean>;
}

// Reads the stored rev without decoding the whole document when it is written first (as `{ rev, ...data }` always is).
const SET_IF_REV = `
local cur = redis.call('GET', KEYS[1])
local rev = 0
if cur then
  rev = tonumber(string.match(cur, '^{"rev":(%d+)[,}]') or cjson.decode(cur).rev) or 0
end
if rev ~= tonumber(ARGV[1]) then return 0 end
redis.call('SET', KEYS[1], ARGV[2])
return 1`;

function redisKV(url: string, token: string): KV {
  const r = new Redis({ url, token });
  return {
    get: (k) => r.get(k),
    set: async (k, v, o) => {
      if (o?.ex) await r.set(k, v, { ex: o.ex });
      else await r.set(k, v);
    },
    incr: (k) => r.incr(k),
    decr: (k) => r.decr(k),
    expire: async (k, s) => {
      await r.expire(k, s);
    },
    mget: async <T>(ks: string[]) => (ks.length ? r.mget<T[]>(...ks) : []),
    lpushCapped: async (k, v, max) => {
      await r.pipeline().lpush(k, v).ltrim(k, 0, max - 1).exec();
    },
    rpush: async (k, v) => {
      await r.rpush(k, v);
    },
    lrange: (k, a, b) => r.lrange<string>(k, a, b),
    lock: async (k, ttl, v) => (await r.set(k, v ?? 1, { nx: true, ex: ttl })) === "OK",
    del: async (k) => {
      await r.del(k);
    },
    // Upstash JSON-encodes values on set and decodes on get, so the script stores the same JSON text.
    setIfRev: async (k, base, v) => (await r.eval<string[], number>(SET_IF_REV, [k], [String(base), JSON.stringify(v)])) === 1,
  };
}

function memoryKV(): KV {
  const g = globalThis as unknown as { __sfxMem?: Map<string, { v: unknown; exp?: number }> };
  const m = (g.__sfxMem ??= new Map());
  const live = (k: string) => {
    const e = m.get(k);
    if (e?.exp && e.exp < Date.now()) {
      m.delete(k);
      return undefined;
    }
    return e;
  };
  return {
    get: async <T>(k: string) => (live(k)?.v as T) ?? null,
    set: async (k, v, o) => {
      m.set(k, { v, exp: o?.ex ? Date.now() + o.ex * 1000 : undefined });
    },
    incr: async (k) => {
      const e = live(k);
      const n = Number(e?.v ?? 0) + 1;
      m.set(k, { v: n, exp: e?.exp });
      return n;
    },
    decr: async (k) => {
      const e = live(k);
      const n = Number(e?.v ?? 0) - 1;
      m.set(k, { v: n, exp: e?.exp });
      return n;
    },
    expire: async (k, s) => {
      const e = live(k);
      if (e) e.exp = Date.now() + s * 1000;
    },
    mget: async <T>(ks: string[]) => ks.map((k) => (live(k)?.v as T) ?? null),
    lpushCapped: async (k, v, max) => {
      const e = live(k);
      m.set(k, { v: [v, ...((e?.v as string[]) ?? [])].slice(0, max), exp: e?.exp });
    },
    rpush: async (k, v) => {
      const e = live(k);
      m.set(k, { v: [...((e?.v as string[]) ?? []), v], exp: e?.exp });
    },
    lrange: async (k, a, b) => ((live(k)?.v as string[]) ?? []).slice(a, b < 0 ? undefined : b + 1),
    // No await between the check and the write, so these are atomic within the process.
    lock: async (k, ttl, v) => {
      if (live(k)) return false;
      m.set(k, { v: v ?? 1, exp: Date.now() + ttl * 1000 });
      return true;
    },
    del: async (k) => {
      m.delete(k);
    },
    setIfRev: async (k, base, v) => {
      if (Number((live(k)?.v as { rev?: number } | undefined)?.rev ?? 0) !== base) return false;
      m.set(k, { v });
      return true;
    },
  };
}

const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

// A production server on in-memory storage loses users and payments, and every instance gets its own rate limits,
// quotas and payment locks. So it refuses to start, unless ALLOW_MEMORY_STORE=true (a single-instance trial run).
// `next build` itself is allowed: it imports this file without needing the store.
if (!(url && token) && process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build") {
  if (process.env.ALLOW_MEMORY_STORE !== "true") {
    throw new Error(
      "[sobatfx] Redis is not configured (UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN, or KV_REST_API_URL + KV_REST_API_TOKEN). " +
        "Refusing to run production on in-memory storage. Set ALLOW_MEMORY_STORE=true to override (single instance only).",
    );
  }
  console.warn("[sobatfx] ALLOW_MEMORY_STORE=true — using in-memory storage. Users, usage and payments will NOT persist.");
}

export const kv: KV = url && token ? redisKV(url, token) : memoryKV();

/**
 * Runs `fn` while holding `key`, waiting up to `waitMs` for it. The lock expires after `ttlSec` (a crashed holder can't
 * strand it) and is released only while this caller still holds it. Returns null if it couldn't be taken in time.
 */
export async function withLock<T>(key: string, ttlSec: number, waitMs: number, fn: () => Promise<T>): Promise<{ value: T } | null> {
  const holder = crypto.randomUUID();
  const until = Date.now() + waitMs;
  while (!(await kv.lock(key, ttlSec, holder))) {
    if (Date.now() >= until) return null;
    await new Promise((r) => setTimeout(r, 100));
  }
  try {
    return { value: await fn() };
  } finally {
    if ((await kv.get<string>(key).catch(() => null)) === holder) await kv.del(key).catch(() => {});
  }
}
