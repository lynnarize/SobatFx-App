import { initBotId } from "botid/client/core";

// Vercel BotID: attaches an invisible challenge to these calls. The server rejects them without it (src/lib/guard.ts).
// Keep this list in step with the routes that call guard({ strict: true }).
initBotId({
  protect: [
    { path: "/api/ai/chat", method: "POST" },
    { path: "/api/payments/qris", method: "POST" },
    { path: "/api/payments/transfer", method: "POST" },
    { path: "/api/payments/transfer/claim", method: "POST" },
    { path: "/api/sync", method: "PUT" },
  ],
});
