// Cloud sync of chart drawings and demo-trade history, tied to the Google account (see /api/sync).
// Pure helpers shared by the browser and the tests. The server keeps one document per account with a
// revision number; a device may only overwrite it from the revision it last saw (otherwise it merges first).

import type { Drawing } from "./drawings";
import { DEFAULT_PAPER, type PaperAccount, type PaperTrade } from "./paper";

export interface SyncData {
  drawings: Record<string, Drawing[]>;
  paper: PaperAccount;
}

export interface SyncDoc extends SyncData {
  rev: number;
}

/** Stable-enough fingerprint of the synced content, to tell "changed since the last sync" without storing a copy. */
export function fingerprint(d: SyncData) {
  const s = JSON.stringify(d);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `${s.length}:${h}`;
}

export const hasContent = (d: SyncData) =>
  d.paper.trades.length > 0 || d.paper.startBalance !== DEFAULT_PAPER.startBalance || Object.values(d.drawings).some((l) => l.length > 0);

// A trade only moves forward: pending → open → closed.
const stage = (t: PaperTrade) => (t.closedAt != null ? 2 : t.pending ? 0 : 1);

/**
 * Combines two versions that were edited independently. Nothing is lost: drawings and trades are united by id.
 * On a clash `mine` (the device doing the merge, i.e. the newest edit) wins, except that a trade never
 * goes backwards (a closed trade is not re-opened by an older copy).
 */
export function mergeData(mine: SyncData, theirs: SyncData): SyncData {
  const drawings: Record<string, Drawing[]> = {};
  // Own keys only: a symbol key like "constructor" would otherwise read Object.prototype's function, not a list.
  const listOf = (d: SyncData["drawings"], sym: string) => (Object.hasOwn(d, sym) ? d[sym] : []);
  for (const sym of new Set([...Object.keys(theirs.drawings), ...Object.keys(mine.drawings)])) {
    const mineList = listOf(mine.drawings, sym);
    const mineIds = new Set(mineList.map((d) => d.id));
    drawings[sym] = [...listOf(theirs.drawings, sym).filter((d) => !mineIds.has(d.id)), ...mineList];
  }
  const theirTrades = new Map(theirs.paper.trades.map((t) => [t.id, t]));
  const trades = mine.paper.trades.map((t) => {
    const o = theirTrades.get(t.id);
    theirTrades.delete(t.id);
    return o && stage(o) > stage(t) ? o : t;
  });
  trades.push(...theirTrades.values());
  trades.sort((a, b) => a.openedAt - b.openedAt);
  return { drawings, paper: { startBalance: mine.paper.startBalance, trades } };
}
