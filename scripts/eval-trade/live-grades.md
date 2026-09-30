# Blind grades — live scenarios, `worked` arm (2026-09-30)

Graded from `live-blind.md` before opening `live-key.json`. Each answer 0–5 on four criteria: **F** data fidelity (levels/indicators match the context) · **R** reasoning (trend, higher timeframes, news, answers the actual question) · **K** risk correctness (SL placement, R:R, pips, lot) · **C** clarity/format (length, drawing block, no self-talk). Max 20 per answer, 100 per model.

| Scenario | Label → model | F | R | K | C | Total | Main reasons |
|---|---|---|---|---|---|---|---|
| L1 gold analysis | A → inkling | 4 | 4 | 3 | 2 | 13 | Right levels and HTF read; "tunggu, hitung ulang" self-talk; draw block missing its opening fence, so nothing would be drawn |
| | B → qwen3.8-flash | 4 | 4 | 4 | 3 | 15 | With-trend short, 70 pips → 0.01 lot correct; long (365 words) |
| | C → nemotron | 3 | 3 | 3 | 3 | 12 | Key resistance 4282 far from price; alternative long "8 pips → 0.12 lot" is really 80 pips (10× too big); no plan drawn |
| L2 EUR/USD plan | A → nemotron | 2 | 2 | 3 | 2 | 9 | Leads with a long against a strong downtrend; SL "beyond swing low" placed above it; copies prompt instructions; no drawing |
| | B → qwen3.8-flash | 4 | 5 | 4 | 4 | 17 | Sell-the-rally with trend, clear news scenarios, 20 pips → 0.05 lot |
| | C → inkling | 4 | 4 | 3 | 3 | 14 | Good trend/news read; R:R 1.22 and 0.55-ATR stop; says it drew a long but drew a short |
| L3 BTC scalp | A → qwen3.8-flash | 3 | 4 | 5 | 4 | 16 | Waits for confirmation, R:R 2.75, lot 0.05 correct; mislabels the EMA cluster |
| | B → inkling | 4 | 4 | 3 | 4 | 15 | Concise (227 words), both sides with lots correct; long R:R only 1.19 |
| | C → nemotron | 3 | 3 | 3 | 3 | 12 | Says price is below EMA20 (it is above); drawn R:R 1.08 |
| L4 review of user's plan | A → nemotron | 2 | 3 | 2 | 2 | 9 | Calls 38 pips "384 pips", R:R 24 "1:2.4", ATR 153 pips "15 pips"; no drawing |
| | B → qwen3.8-flash | 4 | 3 | 3 | 4 | 14 | Flags the unrealistic TP; calls the 0.25-ATR stop "a bit wide"; self-talk "60 pips? Tidak" |
| | C → inkling | 4 | 4 | 4 | 3 | 15 | Flags the TP, fixes to 159.2 (R:R 1.5), lot 0.04 correct; odd opener and irrelevant journal note |
| L5 revenge trade | A → nemotron | 3 | 3 | 2 | 3 | 11 | Never addresses the revenge trade or the 0.5 lot; UTC times given as WIB; drawn R:R 0.56 |
| | B → qwen3.8-flash | 4 | 2 | 4 | 3 | 13 | Solid chart read and sizing, but opens with QRIS/payment boilerplate and ignores the revenge/0.5-lot question |
| | C → inkling | 2 | 5 | 2 | 4 | 13 | "Stop trading today" — the right answer — but says 0.5 lot = $50/pip (it is $5) and sizes a 160-pip stop as "30 pips → 0.03 lot"; invents a journal review |

| Model | L1 | L2 | L3 | L4 | L5 | **Total / 100** |
|---|---|---|---|---|---|---|
| qwen3.8-flash | 15 | 17 | 16 | 14 | 13 | **75** |
| inkling | 13 | 14 | 15 | 15 | 13 | **70** |
| nemotron-3.5-lightning | 12 | 9 | 12 | 9 | 11 | **53** |

Caveats: one grader (not independent of the study), 5 scenarios, one sample per model. None of the three flagged the planted 0.25-ATR stop in L4 as too tight.
