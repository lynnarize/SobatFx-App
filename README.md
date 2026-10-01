# SobatFX AI

Advisory-only trading dashboard for **forex, XAU/USD and BTC/ETH** with an AI advisor that reads your chart,
draws levels and trade plans, sizes your risk and watches market-moving news.

No deposits, no broker connection, no order execution. Users only pay (QRIS or bank transfer) for AI access.

## Features

- **Live charts** (TradingView Lightweight Charts, Apache-2.0): 1m → 1D, EMA 20/50, volume.
  Prices stream tick-by-tick over WebSockets straight from the exchanges into the forming candle, the watchlist and the header.
- **Drawing tools** from [OpenCharts](https://github.com/dylanpersonguy/OpenCharts) (MIT, vendored in `src/lib/opencharts`):
  trend line, ray, horizontal and vertical lines, parallel channel, zone, Fibonacci retracement and extension, arrow, text, measure, and
  **long/short position** with live lot size, pips, risk, reward and R:R. You can drag handles to edit, Shift-click to multi-select,
  use magnet snapping, copy and paste, undo and redo, delete with the Del key, and use it on touch screens.
- **Risk calculator**: USD or IDR accounts, lot rounded *down*, crosses converted with live rates, one-click "draw on chart".
- **News**: Forex Factory weekly calendar + RSS headlines (InvestingLive, FXStreet, Investing.com, CoinDesk, Cointelegraph),
  auto-tagged by currency/asset and relevance. Each event carries FF's **usual effect** (`src/lib/usual-effect.ts`: higher-than-forecast
  is good for the currency; lower is good for unemployment and claims; hawkish is good for central-bank talk). The AI gets
  "if it beats / if it misses" scenarios per event for the chart's instrument. Released **actuals** are read free from release headlines
  (`src/lib/releases.ts`: "JOLTS job openings 7.079M vs 7.225M estimate", "RBA raises cash rate to 4.60%"). A headline is matched to a
  calendar event only when currency, wording, timing and the expected value agree, and matches are kept in Redis for the week.
  The News page shows them green/red against the forecast.
- **Prediction** (`src/lib/outlook.ts`, `src/lib/event-history.ts`): before each numeric release, a *lean* (better/worse than forecast,
  low or medium confidence) with its reasons: preview headlines ("CPI seen at 4.0%") that differ from the consensus, related releases
  already out (ADP/claims/JOLTS → NFP, German/French/Spanish/Italian CPI → Eurozone CPI, CPI/PPI → PCE, flash → final PMI), and the
  event's beat/miss streak. After each release, the move of every related pair at +15 min and +1 h is measured from 5-minute candles
  and kept per event type in Redis (24 releases, 400 days), giving the *typical reaction*. The lean each release had is stored too,
  so the app scores its own predictions. History starts empty and fills in automatically. Both go into the event detail and the AI context.
- **SobatFX AI**: sees a screenshot of the chart (with drawings), the last 120 candles, indicators, swing points,
  your drawings, your risk settings and a news digest. It answers in Bahasa Indonesia or English and can draw on the chart.
- **Cloud sync**: chart drawings and demo-trade history follow the Google account (`/api/sync`, `src/lib/sync*.ts`, `src/components/useCloudSync.ts`).
  localStorage stays the working copy; changes are pushed ~1.5 s after an edit and other devices are pulled every 20 s and when the tab
  regains focus. Each save carries the server revision it was built on; if another device saved first, the two copies are merged
  (drawings and trades united by id, a closed trade never re-opens) before pushing. Without unsaved changes a device just adopts the server copy,
  so deletions and resets propagate. Not stored for the anonymous demo. Needs Redis in production (in-memory locally).
- **Tiers**: Free / Pro / Ultra. Users never see which model is behind a tier.
- **Language**: Bahasa Indonesia by default, English optional (ID/EN switch in the sidebar and mobile top bar).
  The choice is stored in the `sfx_lang` cookie, so the server renders the right language from the first paint.
  Server error messages follow it too, and the AI replies in the language the user writes in, falling back to the app language.
  All strings are in `src/lib/i18n.ts`; TypeScript fails the build if a key is missing from either language.

## AI (server-side only)


How the model stays hidden:
1. Model IDs and keys exist only in `src/lib/ai/providers.ts` and server env vars. They never appear in responses, headers or client code.
2. The system prompt (`src/lib/ai/prompt.ts`) gives the AI one identity, "SobatFX AI". It refuses to name its model or vendor and doesn't mention any vendor itself.
3. An output filter (`src/lib/ai/sanitize.ts`) removes model/vendor names from the stream, even when a name is split across chunks.
4. Provider errors are logged on the server and replaced with generic messages.

How the AI learns from the market (adapted for hosted models that can't be fine-tuned):
- **Track record** (`src/lib/ai/track.ts`): every Pro/Ultra trade plan drawn on the chart is stored and later scored against real candles
  (TP first, SL first, or 60 bars then marked at market). The instrument's record, split by side, timeframe, regime and trend alignment,
  goes back into the AI's context, so it tightens up on setups that have been losing. Free doesn't see it, since Free gets no trade plans.
- **Multi-timeframe** (`src/lib/ai/mtf.ts`, Pro/Ultra only): the server fetches the timeframes above the chart's own (Pro: next 2, Ultra: next 3, from 15m/1H/4H/1D)
  and gives the AI a one-line digest of each: trend vs EMA20/50, HH/HL structure, RSI, ADX, MACD, ATR, EMA200 and swing levels, plus whether they agree.
  The prompt asks for a top-down read and to treat a conflict as counter-trend. Free never gets it.
- **Regime**: a turbulence index (Mahalanobis distance of return and range against the last ~250 candles), plus MACD, Bollinger and ADX.
  At or above the 90th percentile, the AI prefers waiting, half risk and wider stops.
- `npm run export:plans` writes the scored plans as a labelled JSONL dataset (`scripts/plans-dataset.jsonl`), for evaluation or future LoRA tuning.

Scope: the AI only answers about forex, gold, crypto, trading, risk, news and the app itself, and politely declines everything else.

Limits: Free is 5 requests (`FREE_LIMIT_PERIOD=daily` or `lifetime`), Pro 10 per day (≈ $10/user/month worst case on Qwen 3.8 Max) and Ultra 40 per day. All limits are set with env vars.
Days reset at 00:00 WIB. If a model call fails before any text is streamed, the request is refunded.

## Local development

```bash
cp .env.example .env.local   # fill in what you have
npm install
npm run dev
```

Without Redis the app uses in-memory storage, which is fine for local dev.
Without a model key, that tier replies "not configured".

## Checks

```bash
npm test                 # offline: lot/pip maths, output filter, drawing parser, prompt hygiene
npm run eval:ai -- free  # live: 21 AI checks (model hiding, scope, trading knowledge, drawing)
npm run eval:ai -- all   # free + pro + ultimate
```

`eval:ai` calls the real models, so it uses your API credit. Full answers are written to `scripts/eval-results-<tier>.md`.

## Protecting the AI

The AI routes call paid models, so they are wrapped in layers that drop abusive traffic before it costs anything (`src/lib/guard.ts`).
Cheapest checks run first:

| # | Layer | Stops |
|---|---|---|
| 1 | Same-origin check (`Origin`/`Referer` must be this site, plus `ALLOWED_ORIGINS`) | other sites, `curl` and scripts calling the API |
| 2 | **Vercel BotID** (`initBotId` in `src/instrumentation-client.ts`, `checkBotId` on the server) | headless browsers and scripted clients, with no CAPTCHA for real users |
| 3 | Per-IP rate limit, in Redis (`AI_IP_PER_MIN`) | bursts from one address, across all serverless instances |
| 4 | Per-user rate limit (`AI_USER_PER_MIN`) and one reply at a time per user | one account firing many requests at once |
| 5 | Body cap (3 MB, checked while reading) and the input caps in the zod schema | huge payloads |
| 6 | Per-tier daily quota (`FREE_REQUEST_LIMIT`, `PRO_DAILY_LIMIT`, `ULTIMATE_DAILY_LIMIT`) | one account running up its own plan |
| 7 | App-wide daily cap (`AI_GLOBAL_DAILY_CAP`) | many farmed or leaked accounts together |

Layers 1–3 also cover `POST /api/payments/qris` (each call creates a Midtrans order). The public data routes
(`/api/candles`, `/api/quotes`, `/api/news`) only get the per-IP limit, to protect the market-data providers.
Blocked requests get a translated message (403 or 429); only a quota reply (`code: "limit"`) shows the upgrade button.

**To turn BotID on:** Vercel project → **Firewall** → **Rules** → enable **BotID** (Deep Analysis is optional and paid). It only runs on Vercel,
so local development and self-hosting skip it. If you add another paid POST route, call `guard(req, { bucket, limit, strict: true })`
and add its path to the list in `src/instrumentation-client.ts`.

Keys never reach the browser. Still set a **monthly spend limit** on the OpenRouter key and the Anthropic workspace, so a mistake anywhere else has a ceiling.

## Deploy to Vercel

1. Push this folder to its own GitHub repo, then import it in Vercel.
2. **Storage**: Vercel → Storage → Marketplace → **Upstash Redis**. This sets `KV_REST_API_URL` / `KV_REST_API_TOKEN` automatically.
3. **Google login**: Google Cloud Console → APIs & Services → Credentials → OAuth client (Web).
   Authorized redirect URI: `https://YOUR-DOMAIN/api/auth/callback/google`.
   Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_URL=https://YOUR-DOMAIN` and `NEXTAUTH_SECRET` (`openssl rand -base64 32`).
4. **AI keys**: `OPENROUTER_API_KEY` (Free and Pro; Pro needs credits, it is a paid model) and `ANTHROPIC_API_KEY` (Ultra).
   `OPENCODE_GO_API_KEY` is only for local testing and the temporary demo, never for production (see below).
5. **QRIS (Midtrans)**: set `MIDTRANS_SERVER_KEY` and `MIDTRANS_IS_PRODUCTION`. In the Midtrans dashboard, set
   Settings → Payment → Notification URL = `https://YOUR-DOMAIN/api/payments/notify`, and make sure QRIS is enabled for your account.
   Prices: `PRO_PRICE_IDR`, `ULTIMATE_PRICE_IDR`, `PLAN_DAYS`.
6. **Bank transfer** (optional, alongside QRIS): set `BANK_NAME`, `BANK_ACCOUNT_NUMBER`, `BANK_ACCOUNT_HOLDER`, then create a bot with
   @BotFather and set `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` (`openssl rand -hex 24`) and `TELEGRAM_ADMIN_IDS` (your numeric id, from @userinfobot).
   After deploying run `npm run telegram:webhook -- https://YOUR-DOMAIN` once. Optional `TELEGRAM_BOT_USERNAME` adds a "send proof" button.
7. **Calendar history** (free, recommended): the prediction history only fills in when something loads the calendar, so a GitHub
   Action (`.github/workflows/news-cron.yml`) calls `/api/cron/news` every hour. In Vercel set `CRON_SECRET` (`openssl rand -hex 24`).
   In the GitHub repo → Settings → Secrets and variables → Actions, add the variable `APP_URL=https://YOUR-DOMAIN` and the secret
   `CRON_SECRET` (same value). Test it with Actions → News history → Run workflow.
8. Optional: `TWELVEDATA_API_KEY`, used only as a backup history source if Kraken is unreachable (not live).
9. Optional: `ADMIN_EMAILS=you@gmail.com` gives you Ultra for testing.

The payment flow: user picks a plan → server creates a Midtrans QRIS charge → QR shown → user pays with any e-wallet or
m-banking app → Midtrans webhook (signature-verified) **and** client polling both re-check the status with Midtrans → tier is extended.
Granting is idempotent.

**Bank transfer flow:** the customer picks *Transfer bank* → the server creates an order whose amount ends in a unique 3-digit
code (Rp 99.247, reserved for 24 h so two open orders never share it) → they transfer and press *I've paid* (optionally sending a
screenshot to the bot) → every admin gets the order with ✅ / ❌ buttons → **check your bank statement for exactly that amount**, then
tap Approve → the same idempotent grant as QRIS runs and the customer's dialog flips to "paid".
Admin commands in the bot (admin ids only): `/pending`, `/status email`, and `/grant email pro|ultra [days]` for cases outside the site
flow (it shows what it understood and asks you to confirm before anything is activated). A screenshot alone is never proof.

## Market data (live)

History comes over REST through `/api/candles`, which the server caches for 3–15 s. After that, the browser opens public
WebSockets (no keys) and every tick updates the forming candle. See `src/lib/market/live.ts`.

| Market | History | Live stream |
|---|---|---|
| BTC, ETH | Binance `data-api.binance.vision` | Binance `data-stream.binance.vision` (kline + 24h ticker) |
| FX majors, EUR/JPY, EUR/GBP | Kraken public OHLC | Kraken WS v2 ticker, best bid/offer mid |
| GBP/JPY | Kraken GBP/USD × USD/JPY | Kraken GBP/USD × USD/JPY ticks |
| XAU/USD | Kraken XAUT/USD | Kraken XAUT/USD ticks |

- Gold uses XAUT, a token backed 1:1 by a troy ounce of gold. It tracks spot closely but trades 24/7, so it moves on weekends while spot gold is closed. The chart says this.
  For true spot XAU/USD streaming you'd need a paid feed (e.g. an OANDA or Twelve Data WebSocket plan).
- For FX pairs with a thin book (Kraken USD/JPY sometimes shows a wide spread), the last trade price is used instead of the bid/ask midpoint.
- If a WebSocket drops, it reconnects with backoff, and the chart falls back to polling every 5 s ("Delayed · polling" badge).
  If no ticks arrive for 30 s, for example at the weekend, the badge says "Market quiet".
- Chart attribution: Lightweight Charts shows the TradingView logo on the chart, as its licence asks.

## Layout

```
src/lib/ai/          prompt, knowledge base, providers (server-only), output filter
src/lib/market/      instruments, candle sources, indicators, risk maths
src/lib/news.ts      calendar + RSS + AI news digest
src/lib/payments.ts  Midtrans QRIS + bank-transfer orders
src/lib/telegram-bot.ts  admin approval bot (webhook: api/telegram/webhook)
src/lib/users.ts     tiers, expiry, usage limits
src/lib/opencharts/  OpenCharts drawing tools (MIT, vendored and adapted to lightweight-charts v5)
src/lib/market/live.ts  WebSocket price feeds
src/components/      chart, AI panel, shell
src/app/api/         candles, quotes, news, me, plans, ai/chat, payments/*
```
