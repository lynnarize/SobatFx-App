import { readJson } from "@/lib/guard";
import { handleUpdate, type Update } from "@/lib/telegram-bot";
import { validWebhookSecret } from "@/lib/telegram";

// Telegram → us. Register it with `npm run telegram:webhook -- https://YOUR-DOMAIN` (sets the secret token too).
// Anything without the secret is dropped. Errors still answer 200, otherwise Telegram redelivers the same update again and again.
export async function POST(req: Request) {
  if (!validWebhookSecret(req.headers.get("x-telegram-bot-api-secret-token"))) return Response.json({ ok: false }, { status: 403 });
  const body = await readJson(req, 64 * 1024);
  if (body.ok) await handleUpdate(body.data as Update).catch((e) => console.error("[telegram] update failed:", (e as Error).message));
  return Response.json({ ok: true });
}
