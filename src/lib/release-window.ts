// "Hot" window around a calendar release: from 5 min before (last forecast tweaks, countdown) until
// the actual is in, or 15 min after. While any Medium/High event is hot, the server refreshes the
// calendar and headlines faster and clients poll faster. Shared by server and client — keep it pure.

export const HOT_BEFORE_MS = 5 * 60_000;
export const HOT_AFTER_MS = 15 * 60_000;

type Ev = { time: string; impact: string; actual?: string };

const watched = (e: Ev) => e.impact === "High" || e.impact === "Medium";

export function isHot(e: Ev, now = Date.now()) {
  const t = Date.parse(e.time);
  return watched(e) && now >= t - HOT_BEFORE_MS && (now < t || (now <= t + HOT_AFTER_MS && !e.actual));
}

export const anyHot = (events: readonly Ev[], now = Date.now()) => events.some((e) => isHot(e, now));

/** Milliseconds until the next hot window opens (Infinity if none this week). */
export function msUntilHot(events: readonly Ev[], now = Date.now()) {
  let min = Infinity;
  for (const e of events) {
    const start = Date.parse(e.time) - HOT_BEFORE_MS;
    if (watched(e) && start > now) min = Math.min(min, start - now);
  }
  return min;
}

/** Cache TTL in seconds: `hot` while a window is open, else `normal`. */
export const releaseTtl = (events: readonly Ev[] | undefined, normal: number, hot: number, now = Date.now()) =>
  events && anyHot(events, now) ? hot : normal;
