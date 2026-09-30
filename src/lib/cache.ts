// Per-instance memo with TTL + in-flight de-duplication, for upstream APIs.
const g = globalThis as unknown as { __sfxCache?: Map<string, { exp: number; p: Promise<unknown> }> };
const cache = (g.__sfxCache ??= new Map());

export function cached<T>(key: string, ttlSec: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.p as Promise<T>;
  const p = fn().catch((e) => {
    cache.delete(key);
    throw e;
  });
  cache.set(key, { exp: Date.now() + ttlSec * 1000, p });
  if (cache.size > 500) {
    for (const [k, v] of cache) if (v.exp < Date.now()) cache.delete(k);
  }
  return p;
}
