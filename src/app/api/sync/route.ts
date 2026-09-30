import { currentEmail, demoMode } from "@/lib/auth";
import { guard, readJson } from "@/lib/guard";
import { serverT } from "@/lib/i18n-server";
import type { SyncData } from "@/lib/sync";
import { SYNC_MAX_BYTES, loadDoc, saveDoc, syncDataSchema } from "@/lib/sync-store";
import { z } from "zod";

// Cloud copy of the signed-in account's chart drawings and demo-trade history, so every device sees the same.
// The demo (anonymous visitors) has no real account, so nothing is stored for it.

const noStore = { "Cache-Control": "no-store" };

type Account = { res: Response; email?: undefined; t?: undefined } | { res?: undefined; email: string; t: Awaited<ReturnType<typeof serverT>>["t"] };

async function account(req: Request, strict: boolean): Promise<Account> {
  const blocked = await guard(req, { bucket: "sync", limit: 120, strict });
  if (blocked) return { res: blocked };
  const { t } = await serverT();
  const email = demoMode() ? null : await currentEmail();
  if (!email) return { res: Response.json({ error: t("srv.signInFirst") }, { status: 401, headers: noStore }) };
  return { email, t };
}

/** ?since=<rev>: answers `{ rev, unchanged: true }` without the data when the caller is already up to date. */
export async function GET(req: Request) {
  const a = await account(req, false);
  if (a.res) return a.res;
  const doc = await loadDoc(a.email);
  const since = new URL(req.url).searchParams.get("since");
  if (since !== null && Number(since) === doc.rev) return Response.json({ rev: doc.rev, unchanged: true }, { headers: noStore });
  return Response.json(doc, { headers: noStore });
}

const putSchema = z.object({ baseRev: z.number().int().min(0), data: syncDataSchema });

/** Saves the device's copy, built on `baseRev`. 409 + the newer server copy when another device saved in between. */
export async function PUT(req: Request) {
  const a = await account(req, true);
  if (a.res) return a.res;
  const body = await readJson(req, SYNC_MAX_BYTES);
  if (!body.ok) return Response.json({ error: a.t("srv.notAccepted") }, { status: body.status, headers: noStore });
  const parsed = putSchema.safeParse(body.data);
  if (!parsed.success) return Response.json({ error: a.t("srv.notAccepted") }, { status: 400, headers: noStore });
  // Drawings are checked for identity only: the chart library owns their shape.
  const r = await saveDoc(a.email, parsed.data.baseRev, parsed.data.data as unknown as SyncData);
  if (!r.ok) return Response.json(r.current, { status: 409, headers: noStore });
  return Response.json({ rev: r.rev }, { headers: noStore });
}
