"use client";

import { useCallback, useEffect, useRef } from "react";
import { type SyncData, type SyncDoc, fingerprint, hasContent, mergeData } from "@/lib/sync";

// Keeps drawings and demo trades in step with the Google account's copy on the server (/api/sync).
// localStorage stays the working copy (instant, offline); this hook pushes changes and pulls other devices' changes.

const META_KEY = "sfx.sync.meta";
const POLL_MS = 20_000;
const PUSH_DELAY_MS = 1500;

/** What the last successful sync looked like: whose account, which server revision, and a fingerprint of the content. */
interface Meta {
  email: string;
  rev: number;
  h: string;
}

function readMeta(): Meta | null {
  try {
    const m = JSON.parse(localStorage.getItem(META_KEY) ?? "null") as Meta | null;
    return m && typeof m.email === "string" && typeof m.rev === "number" ? m : null;
  } catch {
    return null;
  }
}
function writeMeta(m: Meta) {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(m));
  } catch {}
}

const dataOf = (d: SyncData): SyncData => ({ drawings: d.drawings, paper: d.paper });

export function useCloudSync(email: string | null, ready: boolean, data: SyncData, apply: (d: SyncData) => void) {
  const latest = useRef(data);
  const applyRef = useRef(apply);
  const busy = useRef(false);
  const again = useRef(false);
  useEffect(() => {
    latest.current = data;
    applyRef.current = apply;
  });

  /** Adopts the server's copy (merged with this device's when `mergeLocal`). Returns true when the result still has to be pushed. */
  const take = useCallback((doc: SyncDoc, who: string, mergeLocal: boolean) => {
    const server = dataOf(doc);
    const next = mergeLocal ? mergeData(latest.current, server) : server;
    latest.current = next; // the next round must see the merged copy before React has re-rendered
    applyRef.current(next);
    writeMeta({ email: who, rev: doc.rev, h: fingerprint(server) });
    return fingerprint(next) !== fingerprint(server);
  }, []);

  /** One round: push if this device has unsaved changes, otherwise pull if another device saved. Returns true to go again. */
  const step = useCallback(async (who: string): Promise<boolean> => {
    const meta = readMeta();
    const mine = meta?.email === who;
    const cur = latest.current;

    if (mine && fingerprint(cur) !== meta.h) {
      const res = await fetch("/api/sync", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ baseRev: meta.rev, data: dataOf(cur) }) });
      if (res.ok) {
        writeMeta({ email: who, rev: ((await res.json()) as { rev: number }).rev, h: fingerprint(cur) });
        return false;
      }
      if (res.status !== 409) throw new Error(`sync ${res.status}`);
      return take((await res.json()) as SyncDoc, who, true);
    }

    const res = await fetch(`/api/sync${mine ? `?since=${meta.rev}` : ""}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`sync ${res.status}`);
    const body = (await res.json()) as SyncDoc & { unchanged?: boolean };
    if (body.unchanged) return false;
    // Nothing unsaved here, so the server's copy simply replaces this one (that is how deletions travel).
    // Only data from before the first sync (no meta) is merged in; another account's leftovers are replaced.
    return take(body, who, !meta && hasContent(cur));
  }, [take]);

  const run = useCallback(async () => {
    if (!email) return;
    if (busy.current) {
      again.current = true;
      return;
    }
    busy.current = true;
    try {
      for (let i = 0; i < 6; i++) {
        again.current = false;
        if (!(await step(email)) && !again.current) break;
      }
    } catch {
      // Offline or server busy: changes stay in localStorage and go out on the next round.
    } finally {
      busy.current = false;
    }
  }, [email, step]);

  // First sync, then keep polling and sync when the tab comes back.
  useEffect(() => {
    if (!email || !ready) return;
    void run();
    const poll = window.setInterval(() => void run(), POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && void run();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [email, ready, run]);

  // Push shortly after every edit.
  useEffect(() => {
    if (!email || !ready) return;
    const t = window.setTimeout(() => void run(), PUSH_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [email, ready, data.drawings, data.paper, run]);
}
