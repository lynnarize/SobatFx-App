// AI chat history, kept only in this browser (localStorage). Conversations are deleted automatically
// 7 days after their last message, and all of them on sign-out.

export interface ChatMsgLike {
  role: "user" | "assistant";
  content: string;
  image?: string;
  error?: string;
}

export interface Conversation<M extends ChatMsgLike = ChatMsgLike> {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  msgs: M[];
}

export const HISTORY_KEY = "sfx.chats.v1";
/** The single conversation older versions kept; migrated into the history on first load. */
export const LEGACY_CHAT_KEY = "sfx.chat";
export const HISTORY_TTL_DAYS = 7;
const TTL_MS = HISTORY_TTL_DAYS * 86_400_000;
const MAX_CONVERSATIONS = 30;
const MAX_MSGS = 40;
/** Images are large: keep them only on the most recent messages that have one, across all chats. */
const MAX_IMAGES = 6;
/** Fired on window when the history is wiped elsewhere (settings, sign-out) so the open chat panel resets. */
export const HISTORY_CLEARED_EVENT = "sfx:chats-cleared";

export function titleFrom(text: string) {
  const one = text.replace(/\s+/g, " ").trim();
  return one.length > 60 ? `${one.slice(0, 57).trimEnd()}…` : one;
}

/** Drops expired conversations, newest first, capped in number. */
export function prune<M extends ChatMsgLike>(convs: Conversation<M>[], now: number): Conversation<M>[] {
  return convs
    .filter((c) => c.msgs.length && now - c.updatedAt < TTL_MS)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_CONVERSATIONS);
}

/** Whole days left before a conversation is deleted (at least 1 while it still exists). */
export function daysLeft(c: Conversation, now: number) {
  return Math.max(1, Math.ceil((c.updatedAt + TTL_MS - now) / 86_400_000));
}

/** Applies `fn` to one conversation's messages, creating it on its first message and moving it to the top. */
export function upsert<M extends ChatMsgLike>(convs: Conversation<M>[], id: string, fn: (msgs: M[]) => M[], now: number): Conversation<M>[] {
  const cur = convs.find((c) => c.id === id);
  const msgs = fn(cur?.msgs ?? []);
  if (!cur && !msgs.length) return convs;
  const firstAsk = msgs.find((m) => m.role === "user")?.content ?? "";
  const next: Conversation<M> = cur
    ? { ...cur, msgs, updatedAt: now, title: cur.title || titleFrom(firstAsk) }
    : { id, title: titleFrom(firstAsk), createdAt: now, updatedAt: now, msgs };
  return [next, ...convs.filter((c) => c.id !== id)];
}

/** What is written to storage: pruned, last messages only, images only on the newest few. */
export function slim<M extends ChatMsgLike>(convs: Conversation<M>[], now: number, maxImages = MAX_IMAGES): Conversation<M>[] {
  let imgs = 0;
  return prune(convs, now).map((c) => {
    const kept = c.msgs.filter((m) => m.content).slice(-MAX_MSGS);
    const out = kept
      .slice()
      .reverse()
      .map((m) => (m.image && ++imgs > maxImages ? { ...m, image: undefined } : m))
      .reverse();
    return { ...c, msgs: out };
  });
}

export function loadHistory<M extends ChatMsgLike>(now: number): Conversation<M>[] {
  let convs: Conversation<M>[] = [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (raw) convs = JSON.parse(raw);
    const legacy = localStorage.getItem(LEGACY_CHAT_KEY);
    if (legacy) {
      const msgs: M[] = JSON.parse(legacy);
      // Removed by the first successful save, so a re-run before then still finds it.
      if (msgs.length && !convs.some((c) => c.id === "legacy"))
        convs.push({ id: "legacy", title: titleFrom(msgs.find((m) => m.role === "user")?.content ?? ""), createdAt: now, updatedAt: now, msgs });
    }
  } catch {}
  return prune(Array.isArray(convs) ? convs : [], now);
}

export function saveHistory(convs: Conversation[], now: number) {
  // When the browser's storage is full, retry with fewer and then no images.
  for (const maxImages of [MAX_IMAGES, 1, 0]) {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(slim(convs, now, maxImages)));
      localStorage.removeItem(LEGACY_CHAT_KEY);
      return;
    } catch {}
  }
}

export function clearHistory() {
  try {
    localStorage.removeItem(HISTORY_KEY);
    localStorage.removeItem(LEGACY_CHAT_KEY);
  } catch {}
  window.dispatchEvent(new Event(HISTORY_CLEARED_EVENT));
}

export type DayGroup = "today" | "yesterday" | "earlier";

export function dayGroup(ts: number, now: number): DayGroup {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (ts >= start.getTime()) return "today";
  if (ts >= start.getTime() - 86_400_000) return "yesterday";
  return "earlier";
}
