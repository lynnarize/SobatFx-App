// Per-instance memo with TTL + in-flight de-duplication, for upstream APIs.
type Entry = { at: number; ttlMs: number; p: Promise<unknown> };
const g = globalThis as unknown as { __sfxCache?: Map<string, Entry> };
const cache = (g.__sfxCache ??= new Map());

/**
 * `ttlSec` may be a function: it's re-evaluated on every read, so an entry can go stale early when
 * conditions change (e.g. a calendar release getting close). With `stale`, a failed refresh keeps
 * serving the previous value instead of throwing (for rate-limited upstreams).
 */
export function cached<T>(key: string, ttlSec: number | (() => number), fn: () => Promise<T>, opts?: { stale?: boolean }): Promise<T> {
  const ttlMs = (typeof ttlSec === "function" ? ttlSec() : ttlSec) * 1000;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.p as Promise<T>;
  const prev = opts?.stale ? hit?.p : undefined;
  const p = fn().catch((e) => {
    if (prev) {
      console.warn(`[cache] ${key}: refresh failed, serving previous value`, (e as Error).message);
      cache.set(key, { at: Date.now(), ttlMs, p: prev });
      return prev as Promise<T>;
    }
    cache.delete(key);
    throw e;
  });
  cache.set(key, { at: Date.now(), ttlMs, p });
  if (cache.size > 500) {
    for (const [k, v] of cache) if (Date.now() - v.at > v.ttlMs) cache.delete(k);
  }
  return p;
}
