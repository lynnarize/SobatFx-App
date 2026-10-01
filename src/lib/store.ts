import { Redis } from "@upstash/redis";

// Tiny KV facade: Upstash Redis in production, in-memory Map for local dev.

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
  /** SET NX with a TTL: true when this caller took the key. */
  lock(key: string, ttlSec: number): Promise<boolean>;
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
    lock: async (k, ttl) => (await r.set(k, 1, { nx: true, ex: ttl })) === "OK",
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
    lock: async (k, ttl) => {
      if (live(k)) return false;
      m.set(k, { v: 1, exp: Date.now() + ttl * 1000 });
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

if (!url && process.env.VERCEL_ENV === "production") {
  console.warn("[sobatfx] No Redis configured — using in-memory storage. Users, usage and payments will NOT persist.");
}

export const kv: KV = url && token ? redisKV(url, token) : memoryKV();
