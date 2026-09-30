# SobatFX trade-analysis eval — 2026-09-30T11:12Z

41 scenarios (5 live, 36 backtest) × 3 models × 5 arms = 615 answers. Risk: $1000, 1%. Pro system prompt. 95% CIs: Wilson (rates), bootstrap (means).

## 1. Delivery: speed, cost, format

| model | arm | errors | avg s | first token s | avg cost $ | words (≤250) | disclaimer shown | self-talk | follow-up call needed |
|---|---|---|---|---|---|---|---|---|---|
| inkling | baseline | 0 | 5.0 | 0.8 | 0.0069 | 214 (71% [56–82] (29/41)) | 98% [87–100] (40/41) | 2% [0–13] (1/41) | 5% [1–16] (2/41) |
| inkling | pipvalue | 0 | 4.9 | 0.9 | 0.0071 | 208 (80% [66–90] (33/41)) | 100% [91–100] (41/41) | 5% [1–16] (2/41) | 2% [0–13] (1/41) |
| inkling | worked | 0 | 5.6 | 0.9 | 0.0074 | 223 (76% [61–86] (31/41)) | 100% [91–100] (41/41) | 10% [4–23] (4/41) | 10% [4–23] (4/41) |
| inkling | baseline#2 | 0 | 5.9 | 0.8 | 0.0070 | 217 (83% [69–91] (34/41)) | 100% [91–100] (41/41) | 5% [1–16] (2/41) | 2% [0–13] (1/41) |
| inkling | worked#2 | 0 | 6.6 | 0.8 | 0.0074 | 226 (68% [53–80] (28/41)) | 100% [91–100] (41/41) | 2% [0–13] (1/41) | 5% [1–16] (2/41) |
| qwen3.8-flash | baseline | 0 | 19.3 | 1.4 | 0.0013 | 393 (10% [4–23] (4/41)) | 90% [77–96] (37/41) | 7% [3–19] (3/41) | 2% [0–13] (1/41) |
| qwen3.8-flash | pipvalue | 0 | 18.3 | 1.3 | 0.0014 | 368 (15% [7–28] (6/41)) | 73% [58–84] (30/41) | 10% [4–23] (4/41) | 0% [0–9] (0/41) |
| qwen3.8-flash | worked | 0 | 17.9 | 1.4 | 0.0014 | 342 (10% [4–23] (4/41)) | 78% [63–88] (32/41) | 2% [0–13] (1/41) | 0% [0–9] (0/41) |
| qwen3.8-flash | baseline#2 | 0 | 18.7 | 1.3 | 0.0007 | 372 (7% [3–19] (3/41)) | 76% [61–86] (31/41) | 5% [1–16] (2/41) | 2% [0–13] (1/41) |
| qwen3.8-flash | worked#2 | 0 | 20.3 | 1.4 | 0.0007 | 397 (0% [0–9] (0/41)) | 78% [63–88] (32/41) | 12% [5–26] (5/41) | 0% [0–9] (0/41) |
| nemotron-3.5-lightning | baseline | 0 | 8.4 | 2.0 | 0.0007 | 346 (17% [9–31] (7/41)) | 39% [26–54] (16/41) | 5% [1–16] (2/41) | 10% [4–23] (4/41) |
| nemotron-3.5-lightning | pipvalue | 0 | 7.6 | 1.9 | 0.0007 | 323 (22% [12–37] (9/41)) | 46% [32–61] (19/41) | 0% [0–9] (0/41) | 15% [7–28] (6/41) |
| nemotron-3.5-lightning | worked | 0 | 9.5 | 2.3 | 0.0007 | 309 (27% [16–42] (11/41)) | 44% [30–59] (18/41) | 5% [1–16] (2/41) | 15% [7–28] (6/41) |
| nemotron-3.5-lightning | baseline#2 | 0 | 11.9 | 2.5 | 0.0006 | 363 (17% [9–31] (7/41)) | 51% [36–66] (21/41) | 0% [0–9] (0/41) | 15% [7–28] (6/41) |
| nemotron-3.5-lightning | worked#2 | 0 | 11.5 | 2.4 | 0.0007 | 294 (27% [16–42] (11/41)) | 63% [48–76] (26/41) | 2% [0–13] (1/41) | 27% [16–42] (11/41) |

## 2. Risk maths (every answer that contains a plan)

Lot is judged against the app's calculator for the model's own entry/SL (drawn plan, else the plan in the text). *correct* = any lot named matches (or the reply says the stop is too wide when even 0.01 lot is too big); *oversized* = the first lot named is >1.5× the correct one, or ≥0.02 when even 0.01 is too big — the dangerous error; *0.01 on a too-wide stop* = rounds up to the minimum without warning, so it risks more than planned (a milder version of the same error).

| model | arm | plans (drawn/text) | lot correct | lot oversized | 0.01 on a too-wide stop | lot undersized | lot missing | R:R ≥ 1.5 | SL < 0.5 ATR |
|---|---|---|---|---|---|---|---|---|---|
| inkling | baseline | 40 (32/8) | 57% [42–71] (23/40) | 15% [7–29] (6/40) | 0% [0–9] (0/40) | 20% [10–35] (8/40) | 8% [3–20] (3/40) | 55% [40–69] (22/40) | 28% [16–43] (11/40) |
| inkling | pipvalue | 38 (29/9) | 61% [45–74] (23/38) | 3% [0–13] (1/38) | 0% [0–9] (0/38) | 26% [15–42] (10/38) | 11% [4–24] (4/38) | 55% [40–70] (21/38) | 18% [9–33] (7/38) |
| inkling | worked | 37 (29/8) | 68% [51–80] (25/37) | 3% [0–14] (1/37) | 3% [0–14] (1/37) | 19% [9–34] (7/37) | 8% [3–21] (3/37) | 46% [31–62] (17/37) | 35% [22–51] (13/37) |
| inkling | baseline#2 | 41 (34/7) | 56% [41–70] (23/41) | 17% [9–31] (7/41) | 2% [0–13] (1/41) | 17% [9–31] (7/41) | 7% [3–19] (3/41) | 51% [36–66] (21/41) | 20% [10–34] (8/41) |
| inkling | worked#2 | 40 (25/15) | 78% [62–88] (31/40) | 0% [0–9] (0/40) | 3% [0–13] (1/40) | 15% [7–29] (6/40) | 5% [1–17] (2/40) | 55% [40–69] (22/40) | 23% [12–38] (9/40) |
| qwen3.8-flash | baseline | 38 (32/6) | 100% [91–100] (38/38) | 0% [0–9] (0/38) | 0% [0–9] (0/38) | 0% [0–9] (0/38) | 0% [0–9] (0/38) | 82% [67–91] (31/38) | 26% [15–42] (10/38) |
| qwen3.8-flash | pipvalue | 39 (34/5) | 74% [59–85] (29/39) | 3% [0–13] (1/39) | 5% [1–17] (2/39) | 18% [9–33] (7/39) | 0% [0–9] (0/39) | 82% [67–91] (32/39) | 21% [11–36] (8/39) |
| qwen3.8-flash | worked | 40 (33/7) | 85% [71–93] (34/40) | 5% [1–17] (2/40) | 0% [0–9] (0/40) | 8% [3–20] (3/40) | 3% [0–13] (1/40) | 75% [60–86] (30/40) | 23% [12–38] (9/40) |
| qwen3.8-flash | baseline#2 | 38 (30/8) | 87% [73–94] (33/38) | 0% [0–9] (0/38) | 8% [3–21] (3/38) | 5% [1–17] (2/38) | 0% [0–9] (0/38) | 89% [76–96] (34/38) | 26% [15–42] (10/38) |
| qwen3.8-flash | worked#2 | 37 (32/5) | 84% [69–92] (31/37) | 5% [1–18] (2/37) | 3% [0–14] (1/37) | 8% [3–21] (3/37) | 0% [0–9] (0/37) | 84% [69–92] (31/37) | 38% [24–54] (14/37) |
| nemotron-3.5-lightning | baseline | 32 (4/28) | 50% [34–66] (16/32) | 25% [13–42] (8/32) | 6% [2–20] (2/32) | 9% [3–24] (3/32) | 9% [3–24] (3/32) | 56% [39–72] (18/32) | 28% [16–45] (9/32) |
| nemotron-3.5-lightning | pipvalue | 30 (7/23) | 50% [33–67] (15/30) | 20% [10–37] (6/30) | 3% [1–17] (1/30) | 13% [5–30] (4/30) | 13% [5–30] (4/30) | 67% [49–81] (20/30) | 13% [5–30] (4/30) |
| nemotron-3.5-lightning | worked | 29 (8/21) | 76% [58–88] (22/29) | 10% [4–26] (3/29) | 7% [2–22] (2/29) | 3% [1–17] (1/29) | 3% [1–17] (1/29) | 62% [44–77] (18/29) | 17% [8–35] (5/29) |
| nemotron-3.5-lightning | baseline#2 | 35 (5/30) | 57% [41–72] (20/35) | 31% [19–48] (11/35) | 3% [1–15] (1/35) | 6% [2–19] (2/35) | 3% [1–15] (1/35) | 66% [49–79] (23/35) | 17% [8–33] (6/35) |
| nemotron-3.5-lightning | worked#2 | 30 (6/24) | 67% [49–81] (20/30) | 23% [12–41] (7/30) | 7% [2–21] (2/30) | 0% [0–11] (0/30) | 3% [1–17] (1/30) | 63% [46–78] (19/30) | 20% [10–37] (6/30) |

### Effect of the context wording (paired: same scenario, same model)

| model | comparison | lot correct | fixed | broken | oversized | sign test p (fixed vs broken) |
|---|---|---|---|---|---|---|
| inkling | baseline → pipvalue (n=37) | 22 → 22 | 8 | 8 | 5 → 1 | 1.000 |
| inkling | baseline → worked (n=36) | 21 → 24 | 9 | 6 | 6 → 1 | 0.607 |
| inkling | pipvalue → worked (n=35) | 21 → 25 | 8 | 4 | 1 → 0 | 0.388 |
| inkling | baseline → baseline#2 (noise) (n=40) | 23 → 23 | 10 | 10 | 6 → 7 | 1.000 |
| inkling | worked → worked#2 (noise) (n=36) | 24 → 28 | 8 | 4 | 1 → 0 | 0.388 |
| inkling | baseline → worked, both runs pooled (n=76) | 43 → 55 | 21 | 9 | 13 → 1 | 0.043 |
| qwen3.8-flash | baseline → pipvalue (n=36) | 36 → 27 | 0 | 9 | 0 → 0 | 0.004 |
| qwen3.8-flash | baseline → worked (n=38) | 38 → 32 | 0 | 6 | 0 → 2 | 0.031 |
| qwen3.8-flash | pipvalue → worked (n=38) | 28 → 33 | 7 | 2 | 1 → 2 | 0.180 |
| qwen3.8-flash | baseline → baseline#2 (noise) (n=36) | 36 → 31 | 0 | 5 | 0 → 0 | 0.063 |
| qwen3.8-flash | worked → worked#2 (noise) (n=36) | 30 → 31 | 5 | 4 | 2 → 2 | 1.000 |
| qwen3.8-flash | baseline → worked, both runs pooled (n=73) | 68 → 63 | 5 | 10 | 0 → 3 | 0.302 |
| nemotron-3.5-lightning | baseline → pipvalue (n=24) | 12 → 12 | 5 | 5 | 6 → 5 | 1.000 |
| nemotron-3.5-lightning | baseline → worked (n=23) | 12 → 17 | 8 | 3 | 5 → 3 | 0.227 |
| nemotron-3.5-lightning | pipvalue → worked (n=20) | 7 → 16 | 10 | 1 | 5 → 2 | 0.012 |
| nemotron-3.5-lightning | baseline → baseline#2 (noise) (n=27) | 15 → 18 | 8 | 5 | 5 → 7 | 0.581 |
| nemotron-3.5-lightning | worked → worked#2 (noise) (n=22) | 17 → 15 | 1 | 3 | 1 → 4 | 0.625 |
| nemotron-3.5-lightning | baseline → worked, both runs pooled (n=49) | 27 → 33 | 13 | 7 | 13 → 10 | 0.263 |

## 3. Backtest outcomes (plans scored on the 60 candles that followed)

Standing aside counts as 0R. A plan with a stop inside the noise can post a freak win (e.g. a 1-pip SL hitting a 46R target), so the capped column is the fairer read. Small samples: read the CIs, not the point estimates.

| model | arm | setups | plans | TP | SL | expired | not filled | win rate (TP÷(TP+SL)) | mean R per setup [95% CI] | same, wins capped at 5R | total R |
|---|---|---|---|---|---|---|---|---|---|---|---|
| inkling | baseline | 36 | 35 | 12 | 15 | 1 | 7 | 44% [28–63] (12/27) | 0.22 [-0.22 … 0.72] | 0.21 [-0.22 … 0.68] | 7.9 |
| inkling | pipvalue | 36 | 34 | 15 | 15 | 0 | 4 | 50% [33–67] (15/30) | 0.22 [-0.20 … 0.68] | 0.22 [-0.20 … 0.68] | 8.1 |
| inkling | worked | 36 | 33 | 13 | 16 | 0 | 4 | 45% [28–62] (13/29) | 0.33 [-0.17 … 0.85] | 0.33 [-0.17 … 0.85] | 11.7 |
| inkling | baseline#2 | 36 | 36 | 11 | 17 | 0 | 8 | 39% [24–58] (11/28) | 0.04 [-0.35 … 0.46] | 0.04 [-0.35 … 0.46] | 1.4 |
| inkling | worked#2 | 36 | 35 | 10 | 18 | 0 | 7 | 36% [21–54] (10/28) | -0.10 [-0.44 … 0.24] | -0.10 [-0.44 … 0.24] | -3.8 |
| qwen3.8-flash | baseline | 36 | 34 | 9 | 17 | 0 | 8 | 35% [19–54] (9/26) | 0.01 [-0.40 … 0.48] | 0.01 [-0.40 … 0.46] | 0.5 |
| qwen3.8-flash | pipvalue | 36 | 34 | 6 | 15 | 1 | 12 | 29% [14–50] (6/21) | 0.17 [-0.37 … 0.87] | 0.03 [-0.37 … 0.48] | 6.1 |
| qwen3.8-flash | worked | 36 | 35 | 11 | 17 | 0 | 7 | 39% [24–58] (11/28) | 0.43 [-0.22 … 1.26] | 0.25 [-0.24 … 0.81] | 15.4 |
| qwen3.8-flash | baseline#2 | 36 | 34 | 9 | 13 | 0 | 12 | 41% [23–61] (9/22) | 0.36 [-0.17 … 0.94] | 0.32 [-0.17 … 0.86] | 12.9 |
| qwen3.8-flash | worked#2 | 36 | 33 | 7 | 15 | 0 | 11 | 32% [16–53] (7/22) | -0.01 [-0.38 … 0.40] | -0.01 [-0.38 … 0.40] | -0.4 |
| nemotron-3.5-lightning | baseline | 36 | 29 | 13 | 11 | 0 | 5 | 54% [35–72] (13/24) | 1.55 [-0.05 … 4.27] | 0.41 [-0.07 … 0.94] | 55.7 |
| nemotron-3.5-lightning | pipvalue | 36 | 27 | 12 | 10 | 0 | 5 | 55% [35–73] (12/22) | 0.33 [-0.06 … 0.75] | 0.33 [-0.06 … 0.75] | 11.7 |
| nemotron-3.5-lightning | worked | 36 | 26 | 9 | 12 | 2 | 3 | 43% [24–63] (9/21) | 0.31 [-0.14 … 0.82] | 0.27 [-0.16 … 0.73] | 11.0 |
| nemotron-3.5-lightning | baseline#2 | 36 | 31 | 13 | 12 | 0 | 6 | 52% [33–70] (13/25) | 0.50 [-0.04 … 1.13] | 0.42 [-0.05 … 0.91] | 18.0 |
| nemotron-3.5-lightning | worked#2 | 36 | 25 | 10 | 9 | 2 | 4 | 53% [32–73] (10/19) | 0.49 [-0.04 … 1.13] | 0.39 [-0.05 … 0.86] | 17.7 |

### Paired model differences in mean R per setup, wins capped at 5R (row − column, worked arm)

| | inkling | qwen3.8-flash | nemotron-3.5-lightning |
|---|---|---|---|
| inkling | – | 0.07 [-0.75 … 0.88] | 0.06 [-0.70 … 0.80] |
| qwen3.8-flash | -0.07 [-0.88 … 0.75] | – | -0.02 [-0.67 … 0.62] |
| nemotron-3.5-lightning | -0.06 [-0.80 … 0.70] | 0.02 [-0.62 … 0.67] | – |

_A CI that includes 0 means the backtest can't tell the models apart._
