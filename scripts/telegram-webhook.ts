/** Registers the Telegram bot webhook:  npm run telegram:webhook -- https://YOUR-DOMAIN  (run once per domain). */
const base = process.argv[2]?.replace(/\/$/, "");
const { TELEGRAM_BOT_TOKEN: token, TELEGRAM_WEBHOOK_SECRET: secret } = process.env;
if (!base || !/^https:\/\//.test(base) || !token || !secret) {
  console.error("Usage: npm run telegram:webhook -- https://YOUR-DOMAIN\nNeeds TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET in .env.local, and an https URL.");
  process.exit(1);
}

const call = async (method: string, body: object) => {
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return (await r.json()) as { ok: boolean; description?: string; result?: unknown };
};

void (async () => {
  const hook = await call("setWebhook", { url: `${base}/api/telegram/webhook`, secret_token: secret, allowed_updates: ["message", "callback_query"], drop_pending_updates: true });
  console.log("setWebhook:", hook.ok ? "ok" : hook.description);
  const me = (await call("getMe", {})) as { ok: boolean; result?: { username?: string } };
  if (me.ok) console.log(`Bot: @${me.result?.username}  →  set TELEGRAM_BOT_USERNAME=${me.result?.username}`);
  if (!hook.ok) process.exit(1);
})();
