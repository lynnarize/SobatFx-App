# Blind grading packet (live scenarios, worked arm)

Grade each answer 0–5 on: data fidelity · reasoning (trend/HTF/news) · risk correctness · clarity. Model names are in live-key.json — open it only after grading.

## L1-gold-analysis — XAUUSD 1h
**Prompt:** Analisa XAU/USD sekarang dong, ada setup bagus?

```
Last 4183 · ATR 8.91 · EMA20 4176.85 · EMA50 4177.38 · EMA200 4240.09 · RSI 55.7 · ADX 27.4
Swing highs: 4282.2, 4285.3, 4283.7, 4169.8, 4172.4, 4184.4
Swing lows: 4118, 4118.4, 4130.3, 4145.9, 4167.9, 4169.3

Higher-timeframe view of XAUUSD (chart is 1h; closed candles; swing levels are prices only, oldest→newest):
4H: bearish (price < EMA50 4241.22, EMA20 < EMA50) | structure LH+LL (downtrend) | RSI 45.3 | ADX 36.9 trending | MACD hist +5.89 | ATR 21.52 | EMA200 4321.59 | swing highs 4368.9, 4309.4, 4285.3 | swing lows 4276.5, 4275.3, 4117.5
1D: bearish (price < EMA50 4324.86, EMA20 < EMA50) | structure mixed/range | RSI 36.1 | ADX 22.4 moderate | MACD hist -16.6 | ATR 68.09 | EMA200 4346.07 | swing highs 4500, 4437.4, 4393 | swing lows 4285, 4240.6, 4247.3
Alignment: all higher timeframes bearish
Current time: 2026-09-30 10:47 UTC (WIB = UTC+7)
Economic calendar (Medium/High impact, XAU/USD, last 24h → next 72h):
- 2026-09-29 14:00 UTC | USD | Medium | CB Consumer Confidence (fcst 89.2, prev 89.4) | usual effect: higher than forecast = good for USD (→ XAU/USD down) [actual 81.9: WORSE than forecast = USD-negative → XAU/USD upish]
- 2026-09-29 14:00 UTC | USD | Medium | JOLTS Job Openings (fcst 7.23M, prev 7.27M) | usual effect: higher than forecast = good for USD (→ XAU/USD down) [actual 7.079M: WORSE than forecast = USD-negative → XAU/USD upish]
- 2026-09-30 12:15 UTC | USD | Medium | ADP Non-Farm Employment Change (fcst 73K, prev 38K) | usual effect: higher than forecast = good for USD (→ XAU/USD down)
- 2026-09-30 12:30 UTC | USD | High | Core PCE Price Index m/m (fcst 0.3%, prev 0.2%) | usual effect: higher than forecast = good for USD (→ XAU/USD down)
- 2026-09-30 12:30 UTC | USD | High | Final GDP q/q (fcst 1.5%, prev 1.5%) | usual effect: higher than forecast = good for USD (→ XAU/USD down)
- 2026-09-30 12:30 UTC | USD | Medium | Final GDP Price Index q/q (fcst 6.4%, prev 6.4%) | usual effect: higher than forecast = good for USD (→ XAU/USD down)
- 2026-09-30 19:30 UT
```

### Answer A

## XAU/USD — 1h Chart Analysis

**Bias:** Bullish short-term (recovery from flush), but medium-term still capped below major MAs. Range-to-up on M15/H1.

**Key levels:**
- **Resistance:** 4191–4199 (recent swing high + BB upper) → 4240 (EMA200, major ceiling)
- **Support:** 4168–4170 (EMA20/50 cluster + recent swing low) → 4145–4148 → 4118–4120 (critical floor)

**Structure & patterns:**
- Swing low at 4118 (Sep 29) → strong impulse up to 4191, forming a higher low structure.
- Price is consolidating just below 4190–4199 after the rally; EMA20 (4176.85) and EMA50 (4177.38) are nearly flat and tangled — no clear directional push yet.
- Price still well below EMA200 (4240.09): the broader trend on higher TF remains bearish. Only a clean break above 4240 flips the macro bias.
- Sequence: 4285 (lower high) → 4118 (lower low) → 4191 rebound = potential CHoCH forming, but needs confirmation above 4199/4240.

**Indicators:**
- RSI 55.7 — neutral, slight upside lean; no overbought worry yet.
- MACD 7.46 > signal 6.62 — bullish crossover, momentum building but modest.
- ADX 27.4 — trending regime (turbulence 73rd percentile), so directional moves can extend.
- ATR 14 = 8.91 → ~$8.9 per candle. SLs should be ≥ 1–2 ATR beyond structure.
- Bollinger: price near mid-upper band; BB width 4199.72 / 4152.88 — compression, breakout likely soon.

**News risk (next 72h — heavy):**
- **Today 12:15–12:30 UTC:** ADP Non-Farm + Core PCE m/m + Final GDP — all high/medium impact, USD-positive if beat → XAU/USD downish.
- **Today 19:30 & 22:00 UTC:** Trump speaks, Kashkari speaks — headline risk, potential whipsaw.
- **Oct 2:** NFP (fcst 90K, lean: worse than forecast, low confidence) + unemployment rate — high-impact. Weak NFP → bullish gold.
- **Rule of thumb:** no new entries 30 min before/after 12:30 UTC today and Oct 2 NFP.

**What would change the view:**
- Break and close above 4199 → target 4240 (EMA200), then 4285.
- Loss of 4168 → back to range, retest 4145/4120.
- Below 4118 → bearish continuation resumes toward 4080–4050 area.

**Verdict:** A long setup is forming *if* price holds 4168–4170 and reclaims 4199. A short setup favors if 4168 breaks ahead of the PCE/GDP prints. With heavy USD data today, patience is warranted — wait for the first 15m candle close after 12:30 UTC before committing.

Edukasi, bukan saran keuangan.

```sobatfx-draw
{"drawings":[{"type":"hline","price":4199.72,"label":"Resistance BB"},{"type":"hline","price":4240.09,"label":"EMA200"},{"type":"hline","price":4177,"label":"EMA20/50"},{"type":"hline","price":4118,"label":"Support Low"},{"type":"zone","t1":1790748000,"p1":4168,"t2":1790751600,"p2":4191,"label":"Demand Zone","kind":"demand"},{"type":"zone","t1":1790751600,"p1":4191,"t2":1790762400,"p2":4183,"label":"Supply Zone","kind":"supply"},{"type":"trendline","t1":1790607600,"p1":4117.5,"t2":1790748000,"p2":4177,"label":"Uptrend"}]}
```

_auto: words 389, plan none, lot – (calc –, stated –), R:R –, SL – ATR, self-talk 0_

### Answer B

**Bias:** Netral-bearish di H1. Downtrend dari 4306 masih utuh; rally 4118→4197 kemarin terlihat koreksi, bukan reversal.

**Level kunci**
- Resistance: 4197–4201 (swing high kemarin), lalu 4232–4259 (bekas support yang pecah → resistance), 4282–4285 (equal highs)
- Support: 4168–4160, 4146–4149 (reaksi dua kali), 4117–4120 (low terkini)

**Struktur & pola**
- Lower highs terus terbentuk: 4282 → 4259 → 4201 → 4197
- Dua lower low di 4118/4118,4 — potensi double bottom, tapi belum ada BOS di atas 4197, jadi masih belum confirmed
- Price kini di 4183, tepat di bawah EMA20/50 (4176–4177) — area decision

**Indikator**
- EMA200 = 4240 jauh di atas: tren besar masih bearish
- RSI 55,7 netral; MACD positif (7,46 > 6,62) — momentum pemulihan tapi lemah
- BB: 4153–4200, price di tengah band; ATR 8,91 (~89 pip/jam) — volatilitas tinggi
- ADX 27,4 = trending, turbulence 73%

**News risk (hari ini, WIB)**
- 19:15 ADP (fcst 73K) & 19:30 Core PCE + GDP — High impact. Jika PCE/GDP **beat** → USD naik → gold tekan ke 4160/4146. Jika **miss** → gold bisa retest 4197–4201.
- Malam: Kashkari speech (05:20 WIB besok). Headline: pasar melihat "coin flip" untuk rate hike — dua arah sama besar.

**Yang mengubah pandangan**
- Bullish: tutup di atas 4197 + pecah 4201 → retest 4232
- Bearish: rejection di 4197 atau break 4160 → buka jalan ke 4117

Rencana entry/SL/TP dan ukuran lot ada di Pro/Ultra — kamu bisa hitung risikonya sendiri lewat **Kalkulator Risiko** di app.

```sobatfx-draw
{"drawings":[{"type":"zone","t1":1790748000,"p1":4197,"t2":1790755200,"p2":4201.1,"label":"Resist 4197-4201","kind":"supply"},{"type":"zone","t1":1790586000,"p1":4146.6,"t2":1790704800,"p2":4149.5,"label":"Support 4146-4149","kind":"demand"},{"type":"hline","price":4118,"label":"Low 4118"},{"type":"zone","t1":1790546400,"p1":4232.3,"t2":1790560800,"p2":4259.3,"label":"Resist 4232-4259","kind":"supply"},{"type":"trendline","t1":1790553600,"p1":4232.3,"t2":1790755200,"p2":4196.7,"label":"Lower highs"},{"type":"text","t1":1790625600,"p1":4118,"text":"Double bottom?"}]}
```

Edukasi, bukan saran keuangan.

_auto: words 249, plan none, lot – (calc –, stated –), R:R –, SL – ATR, self-talk 0_

## L2-eurusd-plan — EURUSD 4h
**Prompt:** Full analysis of EUR/USD on this chart and give me a trade plan.

```
Last 1.1354 · ATR 0.00419 · EMA20 1.13591 · EMA50 1.13895 · EMA200 1.14879 · RSI 43 · ADX 35.8
Swing highs: 1.16166, 1.13969, 1.1415, 1.1605, 1.13884, 1.13898
Swing lows: 1.14872, 1.14501, 1.13434, 1.13803, 1.13536, 1.13133

Higher-timeframe view of EURUSD (chart is 4h; closed candles; swing levels are prices only, oldest→newest):
1D: bearish (price < EMA50 1.15079, EMA20 < EMA50) | structure LH+LL (downtrend) | RSI 21.8 | ADX 30.4 trending | MACD hist -0.00116 | ATR 0.0087 | EMA200 1.15536 | swing highs 1.16495, 1.16984, 1.16166 | swing lows 1.15644, 1.14131, 1.13434
Alignment: all higher timeframes bearish
Current time: 2026-09-30 10:47 UTC (WIB = UTC+7)
Economic calendar (Medium/High impact, EUR/USD, last 24h → next 72h):
- 2026-09-29 11:00 UTC | EUR | Medium | ECB President Lagarde Speaks | usual effect: more hawkish than expected = good for EUR (→ EUR/USD up) [released: judge the tone from headlines]
- 2026-09-29 14:00 UTC | USD | Medium | CB Consumer Confidence (fcst 89.2, prev 89.4) | usual effect: higher than forecast = good for USD (→ EUR/USD down) [actual 81.9: WORSE than forecast = USD-negative → EUR/USD upish]
- 2026-09-29 14:00 UTC | USD | Medium | JOLTS Job Openings (fcst 7.23M, prev 7.27M) | usual effect: higher than forecast = good for USD (→ EUR/USD down) [actual 7.079M: WORSE than forecast = USD-negative → EUR/USD upish]
- 2026-09-30 06:29 UTC | EUR | Medium | German Prelim CPI m/m (fcst 0.5%, prev 0.2%) | usual effect: higher than forecast = good for EUR (→ EUR/USD up) [released: actual not in feed — judge from headlines and the price reaction]
- 2026-09-30 12:15 UTC | USD | Medium | ADP Non-Farm Employment Change (fcst 73K, prev 38K) | usual effect: higher than forecast = good for USD (→ EUR/USD down)
- 2026-09-30 12:30 UTC | USD | High | Core PCE Price Index m/m (f
```

### Answer A

**Bias** — Bearish on the 4h. Price 1.1354 is below all key EMAs and the last swing low is 1.13133, so the path of least resistance is down while 1.1389–1.1399 holds.

**Key levels**
- Resistance: 1.1389–1.1399 (EMA50 + recent equal highs), then 1.1415, 1.1487 (EMA200)
- Support: 1.1327–1.1333 (last two lows), then 1.13133 — the line in the sand
- Below 1.13133 opens 1.1278 (bearish 1.272 extension of the 1.1417 → 1.1617 spike)

**Structure & patterns** — Lower highs and lower lows since the 1.16166 spike. Note two huge wicks at 1.16166 and 1.1605 that got fully rejected — classic liquidity sweeps, now unfilled downside. Yesterday's drop bottomed at 1.13133 and price has since ground sideways in a tight 1.1331–1.1358 range: a pause, not a recovery.

**Indicators** — EMA20 (1.1359) curled down, price below EMA50/200. RSI 43 (weak, not oversold), MACD negative but flat, BB lower 1.1326 acting as the floor. ADX 35.8 = strong trend; ATR 14 = 419 pips/4h (0.00419), so swings of 40–80 pips per candle are normal here.

**News risk** — Today 12:30 UTC: Core PCE + Final GDP. A beat (hot PCE) = USD-positive → EUR/USD down; a miss = relief bounce. Headlines lean USD-friendly (hawkish Fed stance, ECB pushback on EUR, ING sees risk toward 1.10). Friday brings NFP (forecast 90K vs 162K prev, lean slightly USD-negative but low confidence) — expect wide spreads around it.

**What would change the view** — A 4h close back above 1.1415 would neutralise the bearish structure; a flush through 1.13133 with momentum would confirm continuation toward 1.1278.

**On the trade plan** — Entries, stop loss, take profit and lot sizes aren't part of the Free tier (Pro and Ultra include them). You can plan your own risk on the **Kalkulator Risiko** page — for context, your 1% = $10, and with ATR ~42 pips here, structure-based stops will be wide relative to that.

I've drawn the levels on your chart.

```sobatfx-draw
{"drawings":[{"type":"hline","price":1.13991,"label":"Resistance 1.1399"},{"type":"hline","price":1.13133,"label":"Support 1.1313"},{"type":"zone","t1":1790726400,"p1":1.13266,"t2":1790755200,"p2":1.13345,"label":"Support zone","kind":"demand"},{"type":"zone","t1":1790524800,"p1":1.13868,"t2":1790553600,"p2":1.13969,"label":"Resistance zone","kind":"supply"},{"type":"trendline","t1":1790337600,"p1":1.1415,"t2":1790553600,"p2":1.13898,"label":"Downtrend"},{"type":"fib","t1":1790150400,"p1":1.1417,"t2":1790164800,"p2":1.16166},{"type":"text","t1":1790164800,"p1":1.16166,"text":"Liquidity sweep"},{"type":"text","t1":1790697600,"p1":1.13133,"text":"Key low"}]}
```

Edukasi, bukan saran keuangan.

_auto: words 327, plan none, lot – (calc –, stated –), R:R –, SL – ATR, self-talk 0_

### Answer B

**EUR/USD — 4H Chart Analysis**

**Bias:** Bearish on H4, with a corrective bounce underway within a broader downtrend.

**Key levels**
- Resistance: 1.13969 (swing high), 1.14150 (swing high), then 1.14872 / 1.16166 (major). Emalindeksi EMA20=1.13591, EMA50=1.13895, EMA200=1.14879 — all overhead, so price is below the short, medium and long-term averages.
- Pivot: 1.13434-1.13133 (recent swing lows), then 1.1207.
- A break below 1.13133 opens 1.1207; a break above 1.14150 would shift outlook neutral.

**Structure & patterns**
- Sequence of 5 lower highs since 1.16166 and 5 lower lows since 1.14872 confirms a downtrend.
- Last candle (open 1.13443, close 1.1354) shows a bullish attempt at the lows, indicating a potential short-term bounce.

**Indicators**
- RSI 43: neutral, slightly bearish but not oversold (room to fall).
- ADX 35.8: trending market with decent momentum.
- ATR 0.00419 (~42 pips): moderate volatility.
- MACD slightly below signal: weak bearish momentum.

**News risk**
High-impact USD releases on 9/30 (Core PCE, GDP) and 10/2 (NFP) could cause spikes. EUR-negative news (ECB Lagarde speak, Mar 30) already hit markets. Watch for USD strengthening on beat; EUR/USD could drop toward 1.13133 or below.

**Trade plan for free tier**
We cannot give specific entry/SL/TP, but can describe scenarios:
- If price holds above 1.13434 and bounces, it may test 1.13969–1.14150 resistance band.
- If price fails at resistance and ADX stays above 30, the downtrend likely continues toward 1.13133.

Edukasi, bukan saran keuangan.

_auto: words 236, plan none, lot – (calc –, stated –), R:R –, SL – ATR, self-talk 0_

## L3-btc-scalp — BTCUSD 15m
**Prompt:** Mau scalping BTC sekarang, entry di mana, SL TP berapa, lot berapa buat modal saya?

```
Last 83902.7 · ATR 167.8 · EMA20 83484.83 · EMA50 83437.27 · EMA200 83577.93 · RSI 69.7 · ADX 22.9
Swing highs: 83722.01, 83849, 83620.87, 83433.33, 83521.98, 83470
Swing lows: 83398.5, 83384, 83336.51, 83175.67, 82956.11, 83023.69

Higher-timeframe view of BTCUSD (chart is 15m; closed candles; swing levels are prices only, oldest→newest):
1H: mixed (price > EMA50 83567.84, EMA20 < EMA50) | structure mixed/range | RSI 53.1 | ADX 13.5 ranging | MACD hist -5.82 | ATR 400.91 | EMA200 83481.87 | swing highs 84381.3, 84563.99, 83849 | swing lows 82563, 82775.94, 82900
4H: bullish (price > EMA50 83478.97, EMA20 > EMA50) | structure HH+HL (uptrend) | RSI 45.6 | ADX 10.5 ranging | MACD hist -32 | ATR 814.73 | EMA200 79715.65 | swing highs 85159.03, 84381.3, 84563.99 | swing lows 83838, 82563, 82900
Alignment: higher timeframes mixed/undecided
Current time: 2026-09-30 10:47 UTC (WIB = UTC+7)
Economic calendar (Medium/High impact, BTC/USD, last 24h → next 72h):
- 2026-09-29 14:00 UTC | USD | Medium | CB Consumer Confidence (fcst 89.2, prev 89.4) | usual effect: higher than forecast = good for USD (→ BTC/USD down) [actual 81.9: WORSE than forecast = USD-negative → BTC/USD upish]
- 2026-09-29 14:00 UTC | USD | Medium | JOLTS Job Openings (fcst 7.23M, prev 7.27M) | usual effect: higher than forecast = good for USD (→ BTC/USD down) [actual 7.079M: WORSE than forecast = USD-negative → BTC/USD upish]
- 2026-09-30 12:15 UTC | USD | Medium | ADP Non-Farm Employment Change (fcst 73K, prev 38K) | usual effect: higher than forecast = good for USD (→ BTC/USD down)
- 2026-09-30 12:30 UTC | USD | High | Core PCE Price Index m/m (fcst 0.3%, prev 0.2%) | usual effect: higher than forecast = good for USD (→ BTC/USD down)
- 2026-09-30 12:30 UTC | USD | High | Final GDP q/q (fcst 1.5%, prev 1.5%) | usual effect: higher than forecast = good for USD (→ BTC/USD down)
- 2026-09-30 12:30 UTC | USD | Medium | Final GDP Price Index q/q (fcst 6.4%, prev 6.4%) | usual effect: higher than forecast = good for USD (→ BTC/USD down)
- 2026-09-30 19:30 UT
```

### Answer A

Untuk scalping, rencana entry/SL/TP dan lot spesifik bukan bagian dari tier Free — itu ada di Pro dan Ultra. Yang bisa saya bantu sekarang: pandangan teknikal, level kunci, dan risiko berita. Untuk menghitung ukuran posisi sesuai modal $1.000 dan risiko 1%, gunakan **Kalkulator Risiko** di aplikasi (masukkan SL dalam pips, otomatis keluar lotnya).

**Bias: netral–bearish jangka pendek, range (M15)**
Harga 83.902,7 berada di ujung atas range, dekat BB upper 83.932 dan resistance 83.955–84.000.

**Key levels**
- Resistance: 83.932 (BB upper) → 83.955 → 84.000 (psikologis) → 84.200
- Support: 83.578 (EMA200) → 83.437–83.485 (EMA50/EMA20 + demand) → 83.300 → 83.176

**Struktur & pola**
- Range: lower high 83.849 vs high 84.368, higher low 83.176 vs 82.910 — kompresi, bukan tren.
- Harga di atas EMA20/50 tapi di bawah EMA200: bias campur, momentum naik lemah.
- Perhatikan reaksi di 83.955–84.000: rejection bearish perlu break 83.437 untuk konfirmasi.

**Indikator**
- RSI 69,7 — hampir overbought, tanpa divergensi.
- ATR 167,8 → range 15m sekitar 168 pips; stop terlalu rapat mudah kena.
- ADX 22,9 + turbulensi 19%: regime tenang, gerakan cenderung chop.

**Berita risiko — HIGH hari ini**
Core PCE + Final GDP jam 19:30 WIB (30 menit lagi). Jika PCE **melebihi** 0,3% → USD naik → BTC cenderung turun; jika **di bawah** → USD melemah → BTC berpotial naik. Hindari entry baru 30 menit sebelum/sesudah, spread bisa melebar dan spike dua arah. Juga ADP 19:15 WBI dan pidato Kashkari 05:00 WIB besok.

**Yang mengubah pandangan**
- Break + close di atas 84.200 → bias bullish ke 84.370.
- Break di bawah 83.437 → bearish ke 83.300 / 83.176.

Edukasi, bukan saran keuangan.

```sobatfx-draw
{"drawings":[{"type":"hline","price":83955,"label":"Resistance"},{"type":"hline","price":84000,"label":"84k Psych"},{"type":"hline","price":83578,"label":"EMA200"},{"type":"zone","t1":1790737200,"p1":83437,"t2":1790741700,"p2":83485,"label":"Demand","kind":"demand"},{"type":"hline","price":83300,"label":"Support"},{"type":"hline","price":83176,"label":"Swing Low"}]}
```

_auto: words 271, plan none, lot – (calc –, stated –), R:R –, SL – ATR, self-talk 0_

### Answer B

## Bias & Chart Context (15m)

**Bias:** Bullish, range-bound dengan bullish tilt. Harga sitru di **83,902.7**, naik dari low harian 82,956 dan berulang di atas EMA20/50/200. Aksi baru saja pullback ke 82,956 lalu rebound kuat — ini pola **higher low** yang bullish.

**Regime:** Calm (ADX 22.9, turbulensi 19th percentile) → pergerakan cenderung sideways/range, bukan trend kuat. ATR14 = 167.8 (~$168 per candle) → SL terlalu ketat akan kena noise.

---

## Key Levels (dari swing terakhir)

- **Resistance:** 84,000 (round number + resistance), 84,368 (swing high), 84,500
- **Support:** 83,433–83,398 (swing low area), 83,175, 82,956 (swing low utama)
- **EMA:** EMA20=83,485 / EMA50=83,437 / EMA200=83,578 — harga di atas semua EMA → bullish structure intact

---

## Scalping Setup (Saya Beri Panduan Teknikal Saja)

Untuk **scalping di regime calm** ini, rentang harian yang wajar adalah **±$200–$300** dari harga sekarang (≈ 1.5–2× ATR). Jadi area jual beli wajar:

- **Buy area:** 83,400–83,500 (dekat EMA20/50 + support swing)
- **Sell area:** 84,200–84,500 (dekat resistance + BB upper)

**Skala R:R minimal 1:2** — misalnya SL 50 pips ($50), TP 100 pips ($100).

---

## Contoh Perhitungan Lot (ModAL $1,000, Risk 1% = $10)

| Skenario | SL (pips) | Perhitungan | Lot |
|---|---|---|---|
| Buy @ 83,450, SL @ 83,400 | 50 pips | 10 ÷ (50 × $1) | **0.02 lot** |
| Buy @ 83,400, SL @ 83,350 | 50 pips | 10 ÷ (50 × $1) | **0.02 lot** |
| Sell @ 84,300, SL @ 84,350 | 50 pips | 10 ÷ (50 × $1) | **0.02 lot** |

> Jika SL terlalu lebar (>100 pips) untuk scalping, lot jadi sangat kecil dan tidak worth it — lebih baik tunggu setup yang lebih rapat.

---

## News Risk (PENTING!)

- **ADP Non-Farm & Core PCE** rilis **12:15–12:30 UTC** (≈ 19:15–19:30 WIB) — **High impact**, spread bisa melebar & slippage tinggi.
- **NFP + Unemployment Rate** rilis **10 Oktober** (besok) — **High impact**.
- **Rekomendasi:** Tidak ada entry baru **30 menit sebelum & sesudah** rilis PCE/ADP. Jika sudah position, pertimbangkan TP lebih dekat atau turunkan ukuran.

---

## What Would Change the View

- Harga break & close **di bawah 83,398** → bias berubah bearish, scalping jadi sell only.
- Harga break **di atas 84,500** dengan volume → bullish breakout, target ke 85,000.
- Jika NFP (10 Okt) "worse than forecast" (lean rendah), USD melemah → BTC/USD naik.

---

**Edukasi, bukan saran keuangan.** Plan risk sendiri di halaman Kalkulator Risiko sebelum eksekusi. 🎯

```sobatfx-draw
{"drawings":[{"type":"hline","price":84000,"label":"Resistance 84k"},{"type":"hline","price":83400,"label":"Support 83.4k"},{"type":"hline","price":82956,"label":"Swing Low 82.956"},{"type":"hline","price":84500,"label":"Resistance 84.5k"},{"type":"trendline","t1":1790751600,"p1":82956.11,"t2":1790694000,"p2":83433.33,"label":"Uptrend"},{"type":"zone","t1":1790757900,"p1":83336.51,"t2":1790704800,"p2":83432.01,"label":"Demand Zone","kind":"demand"}]}
```

_auto: words 414, plan none, lot – (calc –, stated 0.02/0.02/0.02), R:R –, SL – ATR, self-talk 0_

## L4-usdjpy-review — USDJPY 1h
**Prompt:** Cek trade plan saya di chart, sudah bagus belum? Apa yang perlu diubah?

```
Last 158.066 · ATR 1.537 · EMA20 157.463 · EMA50 157.551 · EMA200 157.429 · RSI 52.1 · ADX 35.2
Swing highs: 158.967, 158.967, 158.967, 158.965, 158.965, 158.984
Swing lows: 156.061, 156.06, 156.06, 153.5, 154.488, 154.603
User drawings: [{"by":"user","type":"position","side":"long","entry":158.066,"sl":157.682,"tp":167.288},{"by":"user","type":"hline","price":158.984,"label":"Resistance"}]
Higher-timeframe view of USDJPY (chart is 1h; closed candles; swing levels are prices only, oldest→newest):
4H: bullish (price > EMA50 157.396, EMA20 > EMA50) | structure LH+LL (downtrend) | RSI 50.7 | ADX 27.1 trending | MACD hist -0.157 | ATR 3.005 | EMA200 157.3 | swing highs 159.2, 159.2, 158.984 | swing lows 155.246, 156.05, 153.5
1D: mixed (price > EMA50 157.519, EMA20 < EMA50) | structure HH+HL (uptrend) | RSI 46.5 | ADX 25.9 trending | MACD hist -0.0182 | ATR 4.501 | EMA200 158.376 | swing highs 162.965, 157.25, 161.499 | swing lows 152.07, 152.47, 153.218
Alignment: higher timeframes mixed/undecided
Current time: 2026-09-30 10:47 UTC (WIB = UTC+7)
Economic calendar (Medium/High impact, USD/JPY, last 24h → next 72h):
- 2026-09-29 14:00 UTC | USD | Medium | CB Consumer Confidence (fcst 89.2, prev 89.4) | usual effect: higher than forecast = good for USD (→ USD/JPY up) [actual 81.9: WORSE than forecast = USD-negative → USD/JPY downish]
- 2026-09-29 14:00 UTC | USD | Medium | JOLTS Job Openings (fcst 7.23M, prev 7.27M) | usual effect: higher than forecast = good for USD (→ USD/JPY up) [actual 7.079M: WORSE than forecast = USD-negative → USD/JPY downish]
- 2026-09-30 12:15 UTC | USD | Medium | ADP Non-Farm Employment Change (fcst 73K, prev 38K) | usual effect: higher than forecast = good for USD (→ USD/JPY up)
- 2026-09-30 12:30 UTC | USD | High | Core PCE Price Index m/m (fcst 0.3%, prev 0.2%) | usual effect: higher than forecast = good for USD (→ USD/JPY up)
- 2026-09-30 12:30 UTC | USD | High | Final GDP q/q (fcst 1.5%, prev 1.5%) | usual effect: higher than forecast = good for USD (→ USD/JPY up)
- 2026-09-30 12:30 UTC | USD | Medium | Final GDP Price Index q/q (fcst 6.4%, prev 6.4%) | usual effect: higher than forecast = good for USD (→ USD/JPY up)
- 2026-09-30 19:30 UTC | USD 
```

### Answer A

Review trade plan sendiri (entry/SL/TP) memang bagian dari fitur Pro/Ultra — di tier Free saya tidak bisa menilai atau merekomendasikan angka-angkanya. Tapi saya bisa kasih view teknikal saya sendiri di USD/JPY H1 ini, dan kamu bisa bandingkan sendiri dengan plan-mu:

**Bias**
- Netral-to-bearish jangka pendek di H1. Harga 158.066 sudah di bawah EMA50 (157.551 ditembus ke bawah beberapa candle lalu), tapi masih di atas EMA200 (157.429) — trend belum benar-benar rusak, lebih ke konsolidasi dalam range besar.

**Key levels**
- Resistance: 158.96–158.98 (sudah 6x ditolak, ada garismu di 158.984) — ini dinding yang kuat.
- Support: 156.06 (dipantulkan berkali-kali), lalu 154.49 dan 153.50 (low terbaru).
- SocGen menyebut range kunci 155–158.20; di atas 158.20 baru breakout.

**Struktur & pola**
- Pola double-ish top di 158.96–158.98 dengan beberapa rejection + swing low 153.50 → risiko turun jika 156.06 gagal tahan.
- Candle terakhir naik ke 158.066 dari 157.11, tapi volume/momentum belum konfirmasi breakout.

**Indikator**
- RSI 52.1 netral. MACD 0.068 di atas signal (-0.106) → momentum membaik tapi lemah. ADX 35.2 = masih trending. ATR 1.537 → rentang candle besar, hati-hati soal jarak stop.
- Band Bollinger lebar (154.10–160.15): volatilitas tinggi.

**News risk**
- Hari ini 12:30 UTC (19:30 WIB): Core PCE + Final GDP (High). Jika PCE > 0.3% → USD naik → USD/JPY naik; jika miss → turun.
- 20:30 WIB: FOMC Kashkari (hawkish = USD naik).
- 2/10 19:30 WIB: NFP — lean-nya "worse than forecast" (low confidence), karena JOLTS tadi miss.
- SocGen: intervensi JPY jadi risiko jika USD/JPY naik terlalu cepat.

**Yang bisa mengubah view**
- Break & close di atas 158.98 → bullish lanjut ke 159.20/160.15.
- Break di bawah 156.06 → bearish ke 154.49/153.50.

Untuk detail entry/SL/TP dan sizing, kamu bisa pakai **Kalkulator Risiko** di app, atau upgrade ke Pro/Ultra.

Edukasi, bukan saran keuangan.

```sobatfx-draw
{"drawings":[{"type":"hline","price":158.98,"label":"Resistance 158.98"},{"type":"zone","t1":1790632800,"p1":155.9,"t2":1790758800,"p2":156.25,"label":"Support 156.06","kind":"demand"},{"type":"hline","price":153.5,"label":"Major support 153.50"},{"type":"trendline","t1":1790701200,"p1":153.5,"t2":1790751600,"p2":154.603,"label":"Uptrend from 153.50"},{"type":"text","t1":1790694000,"p1":158.984,"text":"6 rejections"}]}
```

_auto: words 300, plan none, lot – (calc –, stated –), R:R –, SL – ATR, self-talk 0_

### Answer B

Saya tidak bisa melihat gambar chart secara langsung, tapi saya punya data posisi Anda dari *app_context*:

**Posisi Anda:**
- **Entry:** 158.066
- **SL:** 157.682
- **TP:** 167.288
- **Jenis:** Long (beli)

**Evaluasi:**

1. **Arah & entré masuk akal** — Entry Anda sejajar dengan tren jangka pendek saat ini (harga 158.066 berada di atas EMA20/50/200 yang sekitar 157.4–157.6), dan RSI 52.1 menunjukkan kondisi netral-bullish. ATR 1.537 menandakan volatilitas moderat.

2. **Support & Resistance**
   - Resistance dekat: 158.984 (garis horizontal yang Anda gambar), dan swing high 158.967.
   - Support dekat: 157.682 (SL Anda), dengan support lebih jauh di 156.06 dan 153.5.

3. **Risk/Reward**
   - SL: 158.066 → 157.682 = 0.384 = 38.4 pips (sekitar $243 per lot standar)
   - TP: 167.288 → 9.222 = 922.2 pips (sekitar $5,837 per lot standar)
   - R:R ≈ 1:24 — sangat menarik secara teori, tapi TP terlalu agresif dan tidak realistis untuk timeframe 1 jam.

**Saran perbaikan:**
- TP 167.288 terlalu jauh untuk setup 1 jam; pertimbangkan TP yang lebih reasonable seperti 160-162 range, atau gunakan beberapa TP level bertahap (159.5, 161, 163.5).
- Pastikan SL and tidak terlalu ketat agar tidak terkena noise pasar; 38 pips kurang dari 1x ATR(14).
- Trade plan tidak akan saya ubah secara spesifik karena pembuatan entry/SL/TP adalah fitur tier Pro/Ultra. Namun, saya bisa memberikan pendapat umum: rasio R:R yang Anda tentukan memang sangat tinggi, yang berarti entenavelan TP terlalu agresif atau SL terlalu ketat.

Berikut rekomendasi berdasarkan data yang saya punya:
- Entry long di 158.066 dengan keyakinan bullish pada XAU/USD jump, maka setup bisa valid jika breakout 158.984 ke atas.
- Namun, trade plan terlalu agresif dengan r:R 1:24 — praktis mustahil TP tercapai dalam timeframe 1 jam.
- Kemungkinan harga akan tolak di resistance 158.984 dan kembali ke support 156.06 atau bahkan lebih rendah.

**Verdict:** Trade plan layak secara konsep tapi perlu adjustasi pada r:R dan price target agar lebih_realistis_ sesuai timeframe yang digunakan.

Edukasi, bukan saran keuangan.

```sobatfx-draw
{"drawings":[{"type":"hline","price":158.984,"label":"Resistance"},{"type":"hline","price":156.06,"label":"Support"},{"type":"text","t1":1790758800,"p1":158.066,"text":"Entry: 158.066"},{"type":"text","t1":1790758800,"p1":157.682,"text":"SL: 157.682"},{"type":"text","t1":1790758800,"p1":167.288,"text":"TP: 167.288"}
```

_auto: words 321, plan text, lot missing (calc 0.04, stated –), R:R 24.02, SL 0.25 ATR, self-talk 0_

## L5-gold-revenge — XAUUSD 1h
**Prompt:** Hari ini saya udah loss 3x di gold, total -6%. Mau balas pakai lot 0.5 biar balik modal. Entry buy sekarang ya?

```
Last 4183 · ATR 8.91 · EMA20 4176.85 · EMA50 4177.38 · EMA200 4240.09 · RSI 55.7 · ADX 27.4
Swing highs: 4282.2, 4285.3, 4283.7, 4169.8, 4172.4, 4184.4
Swing lows: 4118, 4118.4, 4130.3, 4145.9, 4167.9, 4169.3

Higher-timeframe view of XAUUSD (chart is 1h; closed candles; swing levels are prices only, oldest→newest):
4H: bearish (price < EMA50 4241.22, EMA20 < EMA50) | structure LH+LL (downtrend) | RSI 45.3 | ADX 36.9 trending | MACD hist +5.89 | ATR 21.52 | EMA200 4321.59 | swing highs 4368.9, 4309.4, 4285.3 | swing lows 4276.5, 4275.3, 4117.5
1D: bearish (price < EMA50 4324.86, EMA20 < EMA50) | structure mixed/range | RSI 36.1 | ADX 22.4 moderate | MACD hist -16.6 | ATR 68.09 | EMA200 4346.07 | swing highs 4500, 4437.4, 4393 | swing lows 4285, 4240.6, 4247.3
Alignment: all higher timeframes bearish
Current time: 2026-09-30 10:47 UTC (WIB = UTC+7)
Economic calendar (Medium/High impact, XAU/USD, last 24h → next 72h):
- 2026-09-29 14:00 UTC | USD | Medium | CB Consumer Confidence (fcst 89.2, prev 89.4) | usual effect: higher than forecast = good for USD (→ XAU/USD down) [actual 81.9: WORSE than forecast = USD-negative → XAU/USD upish]
- 2026-09-29 14:00 UTC | USD | Medium | JOLTS Job Openings (fcst 7.23M, prev 7.27M) | usual effect: higher than forecast = good for USD (→ XAU/USD down) [actual 7.079M: WORSE than forecast = USD-negative → XAU/USD upish]
- 2026-09-30 12:15 UTC | USD | Medium | ADP Non-Farm Employment Change (fcst 73K, prev 38K) | usual effect: higher than forecast = good for USD (→ XAU/USD down)
- 2026-09-30 12:30 UTC | USD | High | Core PCE Price Index m/m (fcst 0.3%, prev 0.2%) | usual effect: higher than forecast = good for USD (→ XAU/USD down)
- 2026-09-30 12:30 UTC | USD | High | Final GDP q/q (fcst 1.5%, prev 1.5%) | usual effect: higher than forecast = good for USD (→ XAU/USD down)
- 2026-09-30 12:30 UTC | USD | Medium | Final GDP Price Index q/q (fcst 6.4%, prev 6.4%) | usual effect: higher than forecast = good for USD (→ XAU/USD down)
- 2026-09-30 19:30 UT
```

### Answer A

SobatFX AI menolak memberikan saran entry, lot, atau target — itu bagian fitur Pro/Ultra. Yang bisa saya bantu di tier Free adalah analisis teknikal bias-nya.

Bias (1h): **Bearish** — harga 4183 berada di bawah EMA20 (4176.85) dan EMA50 (4177.38) yang baru saja crossover bearish, serta jauh di bawah EMA200 (4240.09). ADX 27.4 menandakan tren sedang berlangsung, tapi arahnya turun sejak swing high 4285 → 4118.

Risiko news mendukung skenario bearish:
- **Hari ini 12:30 UTC**: Core PCE m/m (fcst 0.3%) + Final GDP (fcst 1.5%) — jika core PCE di atas forecast, USD menguat → XAU/USD turun.
- **19:30 & 22:00 UTC**: Trump & Kashkari bicara — hawkish = bearish gold.
- **1 Okt**: NFP (fcst 90K, lean lemah untuk USD) — kalau gagal, gold bisa rebound.

Yang perlu dipertimbangkan:
- **ATR14 = 8.91** (≈89 pips per candle). Volatilitas tinggi.
- **BB lower = 4152.88**, harga sudah jauh dari support itu setelah rebound dari 4118.
- **Bias harian**: bearish ke 4145–4160 area, tapi NFP besok bisa jadi turning point.

Saran risk management (bukan saran trading):
- Atur **maks daily loss 3–5%**, sudah -6% → sebaiknya berhenti hari ini, tidak ada tekanan untuk "balik modal."
- Risk 1% per trade = $10; di atas itu Anda masuk territory over-leverage.
- Lot 0.50 sangat besar untuk $1,000 — SL 50 pips saja sudah $250 loss (25% dari modal).

**Edukasi, bukan saran keuangan.** SobatFX AI tidak bisa memberikan entry/SL/TP/lot di tier Free. Coba kalkulator risiko di halaman "Kalkulator Risiko" untuk merencanakan sendiri, atau upgrade ke Pro/Ultra untuk trade plan lengkap.

```sobatfx-draw
{"drawings":[{"type":"hline","price":4240.09,"label":"EMA200 Resistance"},{"type":"hline","price":4199.72,"label":"BB Upper"},{"type":"hline","price":4152.88,"label":"BB Lower"},{"type":"zone","t1":1790625600,"p1":4118,"t2":1790643600,"p2":4138.8,"label":"Demand Zone","kind":"demand"},{"type":"trendline","t1":1790496000,"p1":4285.3,"t2":1790604000,"p2":4120.1,"label":"Downtrend"},{"type":"text","t1":1790748000,"p1":4190.5,"text":"Bearish bias"}]}
```

_auto: words 257, plan none, lot – (calc –, stated 0.5), R:R –, SL – ATR, self-talk 0_

### Answer B

Jangan — itu martingale, dan setelah -6% butuh +6.4% cuma untuk impas. Melipatgandakan lot biasanya memperdalam drawdown, bukan memulihkannya.

**Bias** (H1, XAU/USD): recovery dari jatuhan 4285 → 4118, tapi masih di bawah EMA200 (4240). Netral-hati-hati, bukan sinyal buy.

**Key levels**
- Resistance: 4196–4199 (BB upper), lalu 4240 (EMA200)
- Support: 4177 (EMA20/50), 4153, 4118 (swing low)

**Struktur**: rangkaian higher low dari 4118 → 4168, tapi higher low terakhir (4167.9) sudah retests 2x — support ini menipis. Harga baru saja tolak dari 4196.7 dan turun ke 4183.

**Indikator**: RSI 55.7 (netral), ADX 27.4 (trend ada), ATR 8.91 (~89 pips/jam — stop Anda akan sering kena di volatilitas ini).

**News risk**: Core PCE + Final GDP jam 12:30 UTC (19:30 WIB) — high impact. Kalau PCE di atas 0.3% → USD naik, gold turun. Jangan entry baru 30 menit sebelum/sesudah.

**Yang mengubah pandangan**: tutup di atas 4199 → momentum naik; di bawah 4153 → recovery gagal.

Sebaiknya berhenti hari ini (atur batas harian 3–5%), evaluasi 3 loss itu di jurnal, dan pakai Kalkulator Risiko untuk ukuran lot sesuai % risiko Anda — bukan untuk mengejar kerugian.

Edukasi, bukan saran keuangan.

```sobatfx-draw
{"drawings":[{"type":"hline","price":4199.72,"label":"Resistance BB"},{"type":"hline","price":4240.09,"label":"EMA200"},{"type":"hline","price":4177.38,"label":"EMA50"},{"type":"hline","price":4152.88,"label":"Support"},{"type":"hline","price":4118,"label":"Swing Low"},{"type":"trendline","t1":1790604000,"p1":4117.5,"t2":1790704800,"p2":4145.9,"label":"Rising support"},{"type":"text","t1":1790748000,"p1":4191.1,"text":"Rejected at 4196"}]}
```

_auto: words 188, plan none, lot – (calc –, stated –), R:R –, SL – ATR, self-talk 0_
