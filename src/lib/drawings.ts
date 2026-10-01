// Chart drawings use the OpenCharts model (src/lib/opencharts). The AI speaks a
// smaller vocabulary (hline / trendline / zone / fib / position / text) which is
// mapped onto it here, and user drawings are described back to the AI the same way.

import { parseLooseJson } from "./loose-json";
import type { DrawingLine } from "./opencharts/constants";

export type Drawing = DrawingLine;

export const AI_COLOR = "#d4b67c";
const DEMAND = "#22b36b";
const SUPPLY = "#e0453c";

export const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2, 12));

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(+v) ? +v : null);
const str = (v: unknown, max = 24) => (typeof v === "string" && v.trim() ? v.slice(0, max) : undefined);

// Tolerates spacing/underscore variants of the fence name.
const BLOCK = /```\s*sobatfx[-_ ]draw\s*([\s\S]*?)(```|$)/i;

/** The user asked for no drawing at all. */
export const NO_DRAW = /jangan (di)?gambar|tanpa gambar|don'?t draw|no drawings?/i;

/**
 * Does the user's message ask for a new chart analysis or drawing? Only then do the AI's drawings
 * replace the ones already on the chart; otherwise they are offered as a proposal. "gambar" is also
 * the Indonesian noun for "drawing", so "lihat gambar yang saya buat" (look at my drawing) doesn't count.
 */
export function asksForDrawing(text: string) {
  if (NO_DRAW.test(text)) return false;
  return /\b(?:re)?draw\b|\bmark\b|\bplot\b|\banaly[sz](?:e|is)\b|\banalisa|\banalisis|\btandai|\bgambar(?:kan|in)?\b(?!\s+(?:yang|saya|ku|milik))/i.test(text);
}

/** Smallest reward:risk a trade plan from the AI may have. Below this the plan is not drawn. */
export const MIN_RR = 1;

/** A trade plan the AI sent that was refused (wrong side or too little reward for the risk). */
export interface RejectedPlan {
  side: "long" | "short";
  entry: number;
  sl: number;
  tp: number;
  rr: number;
}

export interface Range {
  tMin: number;
  tMax: number;
  pMin: number;
  pMax: number;
  barSec: number;
}

interface Found {
  start: number;
  end: number;
  body: string;
  closed: boolean;
}

/** End index (exclusive) of the JSON value starting at `from`, or -1 while it is still open. */
function jsonEnd(text: string, from: number) {
  let depth = 0;
  let inStr = false;
  for (let i = from; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (c === "\\") i++;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === "{" || c === "[") depth++;
    else if ((c === "}" || c === "]") && --depth === 0) return i + 1;
  }
  return -1;
}

/**
 * Finds the draw block. Normally a ```sobatfx-draw fence, but some models drop or mangle the fence
 * (inline code, a single backtick, none at all) — then the JSON right after the name is taken.
 */
function findBlock(text: string): Found | null {
  const fenced = BLOCK.exec(text);
  if (fenced) return { start: fenced.index, end: fenced.index + fenced[0].length, body: fenced[1], closed: fenced[2] === "```" };
  const name = /[`~]*[ \t]*sobatfx[-_ ]draw\b/gi;
  for (let m = name.exec(text); m; m = name.exec(text)) {
    const at = m.index + m[0].length;
    const open = /^[\s`:]*(?:json\b)?\s*(?=[{[])/i.exec(text.slice(at));
    if (!open) continue;
    const from = at + open[0].length;
    const stop = jsonEnd(text, from);
    const start = m.index;
    if (stop < 0) return { start, end: text.length, body: "", closed: false };
    const tail = /^[`~]*/.exec(text.slice(stop))![0].length;
    return { start, end: stop + tail, body: text.slice(from, stop), closed: true };
  }
  // A fence was just opened and nothing follows yet (streaming).
  const opening = /```\s*sobatfx[-_ ]?d?r?a?w?\s*$/i.exec(text);
  return opening ? { start: opening.index, end: text.length, body: "", closed: false } : null;
}

/** Splits an AI reply into display text and validated drawings. Works on partial (streaming) text too. */
export function extractDrawings(text: string, range?: Range) {
  const found = findBlock(text);
  const rejected: RejectedPlan[] = [];
  if (!found) return { text, drawings: [] as Drawing[], pending: false, unreadable: false, rejected };
  const before = text.slice(0, found.start).trimEnd();
  if (!found.closed) return { text: before, drawings: [], pending: true, unreadable: false, rejected };
  // Text after the block stays visible: models often put the closing disclaimer line there.
  const after = text.slice(found.end).trim();
  const clean = after ? `${before}\n\n${after}` : before;
  const raw = parseLooseJson(found.body);
  if (raw === undefined) return { text: clean, drawings: [], pending: false, unreadable: true, rejected };
  const list = Array.isArray(raw) ? raw : ((raw as { drawings?: unknown[] })?.drawings ?? []);
  const out: Drawing[] = [];
  const span = range ? range.pMax - range.pMin : 0;
  const okP = (p: number | null): p is number => p != null && (!range || (p > range.pMin - span * 2 && p < range.pMax + span * 2));
  const clampT = (t: number | null) => (t == null ? null : range ? Math.min(Math.max(t, range.tMin), range.tMax + (range.tMax - range.tMin)) : t);
  const barSec = range?.barSec ?? 3600;
  const base = () => ({ id: uid(), by: "ai" as const, color: AI_COLOR, lineStyle: "dashed" as const, width: 1.5 });

  for (const d of list.slice(0, 12) as Record<string, unknown>[]) {
    const t1 = clampT(num(d.t1)), t2 = clampT(num(d.t2)), p1 = num(d.p1), p2 = num(d.p2);
    switch (d.type) {
      case "hline": {
        const price = num(d.price);
        if (okP(price)) out.push({ ...base(), type: "horizontal", price, text: str(d.label) });
        break;
      }
      case "trendline":
        if (t1 != null && t2 != null && okP(p1) && okP(p2)) out.push({ ...base(), type: "trendline", time: t1, price: p1, time2: t2, price2: p2, text: str(d.label) });
        break;
      case "fib":
        if (t1 != null && t2 != null && okP(p1) && okP(p2)) out.push({ ...base(), type: "fibonacci", time: t1, price: p1, time2: t2, price2: p2 });
        break;
      case "zone":
        if (t1 != null && okP(p1) && okP(p2)) {
          const color = d.kind === "demand" ? DEMAND : d.kind === "supply" ? SUPPLY : AI_COLOR;
          out.push({ ...base(), color, type: "rectangle", time: t1, price: p1, time2: t2 ?? range?.tMax ?? t1 + barSec * 20, price2: p2, text: str(d.label) });
        }
        break;
      case "position": {
        const entry = num(d.entry), sl = num(d.sl), tp = num(d.tp);
        const t = t1 ?? range?.tMax;
        if (okP(entry) && okP(sl) && okP(tp) && t != null) {
          const side = d.side === "short" ? "short" : "long";
          // Never draw a plan that risks more than it can make, or has SL/TP on the wrong side.
          const rr = entry === sl ? 0 : (side === "long" ? tp - entry : entry - tp) / Math.abs(entry - sl);
          const sidesOk = side === "long" ? sl < entry : sl > entry;
          if (!sidesOk || rr < MIN_RR) {
            rejected.push({ side, entry, sl, tp, rr: Math.max(rr, 0) });
            break;
          }
          out.push({ ...base(), lineStyle: undefined, color: side === "long" ? DEMAND : SUPPLY, type: "position", side, price: entry, stopPrice: sl, targetPrice: tp, time: t, time2: t + barSec * 25 });
        }
        break;
      }
      case "text":
        if (t1 != null && okP(p1) && typeof d.text === "string") out.push({ ...base(), type: "text", time: t1, price: p1, text: `AI · ${d.text.replace(/^(AI\s*[·:-]\s*)+/i, "").slice(0, 40)}`, fontSize: 12 });
        break;
    }
  }
  // A block that yields nothing valid (bad JSON shape, prices off the chart…) is reported, not silently dropped.
  return { text: clean, drawings: out.slice(0, 8), pending: false, unreadable: out.length === 0 && list.length > 0 && rejected.length === 0, rejected };
}

/** Drawings described to the AI in its own vocabulary. */
export function describeDrawings(ds: Drawing[]) {
  return ds
    .filter((d) => !d.hidden)
    .map((d) => {
      const by = d.by ?? "user";
      switch (d.type) {
        case "horizontal":
          return { by, type: "hline", price: d.price, label: d.text };
        case "trendline":
          return { by, type: "trendline", t1: d.time, p1: d.price, t2: d.time2, p2: d.price2, label: d.text };
        case "rectangle":
          return { by, type: "zone", t1: d.time, p1: d.price, t2: d.time2, p2: d.price2, label: d.text };
        case "fibonacci":
          return { by, type: "fib", t1: d.time, p1: d.price, t2: d.time2, p2: d.price2 };
        case "position":
          return { by, type: "position", side: d.side, entry: d.price, sl: d.stopPrice, tp: d.targetPrice };
        case "text":
          return { by, type: "text", t1: d.time, p1: d.price, text: d.text };
        default:
          return { by, type: d.type, t1: d.time, p1: d.price, t2: d.time2, p2: d.price2 };
      }
    });
}
