// Trading reference the advisor always has in context. Keep it factual and
// consistent with the app's own maths (src/lib/market/risk.ts).

export const TRADING_KNOWLEDGE = `
## Contract & pip conventions used by SobatFX (always use these)
- Standard lot = 1.00, mini = 0.10, micro = 0.01. Minimum 0.01.
- FX majors quoted in USD (EUR/USD, GBP/USD, AUD/USD, NZD/USD): 1 lot = 100,000 base units; 1 pip = 0.0001; pip value = $10 per lot.
- USD-base pairs (USD/JPY, USD/CAD, USD/CHF): pip value = (100,000 × pip) / price, e.g. USD/JPY at 150.00 → 1000/150 = $6.67 per lot. JPY pairs: 1 pip = 0.01.
- Crosses (EUR/JPY, GBP/JPY, EUR/GBP): convert quote-currency pip value to USD with the matching USD rate.
- XAU/USD (gold): 1 lot = 100 oz; 1 pip = 0.10 (a $1.00 move = 10 pips); pip value = $10 per lot. Some brokers call 0.01 a "point" — if the user uses another convention, clarify it.
- BTC/USD: 1 lot = 1 BTC; a $1 move = $1 per lot. ETH/USD: 1 lot = 1 ETH; SobatFX counts 0.10 as a pip.
- Position size: lot = (balance × risk%) ÷ (SL in pips × pip value per lot). Round DOWN to 0.01.
  Example: $1,000, 1% risk ($10), EUR/USD SL 20 pips → 10 ÷ (20 × 10) = 0.05 lot.
  Example: $1,000, 1% risk, XAU/USD SL $5.00 (50 pips) → 10 ÷ (50 × 10) = 0.02 lot.
- R:R = TP distance ÷ SL distance. Break-even win rate = 1 ÷ (1 + R).
- Spread & swap are costs; widen SL slightly past structure + spread, never exactly on a round number.

## Sessions (WIB = UTC+7; shift 1h when US/UK daylight saving ends)
- Sydney ~04:00–13:00, Tokyo ~06:00–15:00, London ~14:00–23:00 (summer), New York ~19:00–04:00 (summer).
- London–New York overlap (~19:00–23:00 WIB) has the most liquidity; gold and USD pairs move most then.
- Crypto trades 24/7; weekend liquidity is thinner and gaps/wicks are more common.

## Market drivers
- USD: FOMC rate decisions & dot plot, Fed chair speeches, NFP, CPI/Core PCE, ISM PMIs, retail sales, jobless claims, GDP.
- Gold: inversely related to USD (DXY) and real yields; rises on risk-off/geopolitical stress and central-bank buying; volatile on NFP/CPI/FOMC.
- EUR: ECB decisions, eurozone CPI, German data. GBP: BoE, UK CPI/jobs. JPY: BoJ, safe-haven flows, MoF intervention risk above key levels. AUD/NZD: RBA/RBNZ, China data, risk sentiment. CAD: BoC, oil.
- BTC: US liquidity & rate expectations, spot ETF flows, regulation, risk sentiment (Nasdaq correlation), halving cycle, large liquidations.
- Reading a release (the calendar's "usual effect"): for most data, actual above forecast is good for the currency (CPI, GDP, PMIs, NFP, earnings, retail sales, rate decisions). For unemployment rate, jobless/unemployment claims and claimant count, LOWER is good. For central-bank statements, press conferences, minutes and speeches, more hawkish than expected is good. Political speeches have no fixed effect.
- The size of the surprise vs forecast matters more than the level. A downward revision to the previous value can cancel a beat. When several releases land together (NFP + unemployment rate + hourly earnings), weigh them together — mixed results often whipsaw. A move that was already priced in can reverse after the first spike.
- For XAU/USD and BTC/ETH, a USD-positive surprise is usually bearish (stronger dollar, higher yields); a USD-negative one usually bullish.
- High-impact releases: spreads widen and price can spike both ways. Common rule: no new entries 30 min before/after, reduce size, or wait for the first 15m candle to close.

## Technical analysis toolkit
- Market structure: uptrend = higher highs + higher lows; downtrend = lower highs + lower lows. Break of structure (BOS) continues trend; change of character (CHoCH) = first sign of reversal.
- Support/resistance: prior swing highs/lows, round numbers, previous day/week high & low, zones rather than single lines. Broken support often becomes resistance (and vice versa).
- Supply/demand & order blocks: last opposite candle before a strong impulsive move. Fair value gap (FVG): 3-candle imbalance where candle 1's wick and candle 3's wick don't overlap.
- Liquidity: stops rest above equal highs / below equal lows; a sweep then fast rejection often precedes reversal.
- Fibonacci retracement 0.382 / 0.5 / 0.618 / 0.786 for pullback entries; extensions 1.272 / 1.618 for targets.
- Moving averages: EMA 20 (short-term), 50 (medium), 200 (long-term trend filter). Price above rising EMA 50/200 = bullish bias.
- RSI(14): >70 overbought, <30 oversold — in strong trends it can stay there; divergence is a stronger signal than the level alone.
- ATR(14): typical range per candle; sensible SL ≈ 1–2 × ATR beyond structure.
- Candles: engulfing, pin bar/hammer/shooting star, inside bar, doji — only meaningful at key levels, confirmed on candle close.
- Multi-timeframe: bias from higher TF (H4/D1), entry on lower TF (M15/H1).

## Risk management & psychology
- Risk 0.5–2% per trade; beginners 0.5–1%. Max daily loss e.g. 3–5%, then stop trading for the day.
- Drawdown recovery: −10% needs +11%, −20% needs +25%, −50% needs +100%.
- Always use a stop loss. Never move SL further away. Consider partial profit at 1R and moving SL to break-even.
- Avoid revenge trading, overtrading and doubling lots after a loss (martingale). Keep a trading journal.
- No setup is certain. Talk in probabilities and scenarios, never guarantees.
`;
