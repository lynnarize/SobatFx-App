# SobatFX trade-analysis eval — 2026-10-03T00:17Z

41 scenarios (5 live, 36 backtest) × 2 models × 2 arms = 164 answers. Risk: $1000, 1%. Free system prompt. 95% CIs: Wilson (rates), bootstrap (means).

## 1. Delivery: speed, cost, format

| model | arm | errors | avg s | first token s | avg cost $ | words (≤250) | disclaimer shown | self-talk | follow-up call needed |
|---|---|---|---|---|---|---|---|---|---|
| ling-3.0-flash-fin | worked | 0 | 7.2 | 1.2 | 0.0005 | 279 (51% [36–66] (21/41)) | 95% [84–99] (39/41) | 12% [5–26] (5/41) | 39% [26–54] (16/41) |
| ling-3.0-flash-fin | worked#2 | 0 | 7.0 | 1.3 | 0.0004 | 237 (56% [41–70] (23/41)) | 88% [74–95] (36/41) | 2% [0–13] (1/41) | 61% [46–74] (25/41) |
| ling-3.1-flash | worked | 0 | 10.5 | 1.8 | 0.0000 | 228 (85% [72–93] (35/41)) | 100% [91–100] (41/41) | 0% [0–9] (0/41) | 2% [0–13] (1/41) |
| ling-3.1-flash | worked#2 | 0 | 10.7 | 1.3 | 0.0000 | 234 (78% [63–88] (32/41)) | 100% [91–100] (41/41) | 0% [0–9] (0/41) | 2% [0–13] (1/41) |

## 2. Risk maths (every answer that contains a plan)

Lot is judged against the app's calculator for the model's own entry/SL (drawn plan, else the plan in the text). *correct* = any lot named matches (or the reply says the stop is too wide when even 0.01 lot is too big); *oversized* = the first lot named is >1.5× the correct one, or ≥0.02 when even 0.01 is too big — the dangerous error; *0.01 on a too-wide stop* = rounds up to the minimum without warning, so it risks more than planned (a milder version of the same error).

| model | arm | plans (drawn/text) | lot correct | lot oversized | 0.01 on a too-wide stop | lot undersized | lot missing | R:R ≥ 1.5 | SL < 0.5 ATR |
|---|---|---|---|---|---|---|---|---|---|
| ling-3.0-flash-fin | worked | 20 (0/20) | 35% [18–57] (7/20) | 25% [11–47] (5/20) | 10% [3–30] (2/20) | 5% [1–24] (1/20) | 25% [11–47] (5/20) | 75% [53–89] (15/20) | 10% [3–30] (2/20) |
| ling-3.0-flash-fin | worked#2 | 12 (0/12) | 42% [19–68] (5/12) | 42% [19–68] (5/12) | 0% [0–24] (0/12) | 0% [0–24] (0/12) | 17% [5–45] (2/12) | 58% [32–81] (7/12) | 8% [1–35] (1/12) |
| ling-3.1-flash | worked | 0 (0/0) | – | – | – | – | – | – | – |
| ling-3.1-flash | worked#2 | 0 (0/0) | – | – | – | – | – | – | – |

### Effect of the context wording (paired: same scenario, same model)

| model | comparison | lot correct | fixed | broken | oversized | sign test p (fixed vs broken) |
|---|---|---|---|---|---|---|
| ling-3.0-flash-fin | worked → worked#2 (noise) (n=9) | 2 → 4 | 3 | 1 | 1 → 3 | 0.625 |
| ling-3.1-flash | worked → worked#2 (noise) (n=0) | 0 → 0 | 0 | 0 | 0 → 0 | – |

## 3. Backtest outcomes (plans scored on the 60 candles that followed)

Standing aside counts as 0R. A plan with a stop inside the noise can post a freak win (e.g. a 1-pip SL hitting a 46R target), so the capped column is the fairer read. Small samples: read the CIs, not the point estimates.

| model | arm | setups | plans | TP | SL | expired | not filled | win rate (TP÷(TP+SL)) | mean R per setup [95% CI] | same, wins capped at 5R | total R |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ling-3.0-flash-fin | worked | 36 | 19 | 3 | 7 | 0 | 9 | 30% [11–60] (3/10) | -0.02 [-0.25 … 0.23] | -0.02 [-0.25 … 0.23] | -0.8 |
| ling-3.0-flash-fin | worked#2 | 36 | 11 | 5 | 1 | 1 | 4 | 83% [44–97] (5/6) | 0.26 [0.03 … 0.56] | 0.26 [0.03 … 0.56] | 9.5 |
| ling-3.1-flash | worked | 36 | 0 | 0 | 0 | 0 | 0 | – | 0.00 [0.00 … 0.00] | 0.00 [0.00 … 0.00] | 0.0 |
| ling-3.1-flash | worked#2 | 36 | 0 | 0 | 0 | 0 | 0 | – | 0.00 [0.00 … 0.00] | 0.00 [0.00 … 0.00] | 0.0 |

### Paired model differences in mean R per setup, wins capped at 5R (row − column, worked arm)

| | ling-3.0-flash-fin | ling-3.1-flash |
|---|---|---|
| ling-3.0-flash-fin | – | -0.02 [-0.25 … 0.23] |
| ling-3.1-flash | 0.02 [-0.23 … 0.25] | – |

_A CI that includes 0 means the backtest can't tell the models apart._
