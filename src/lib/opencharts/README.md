# OpenCharts drawing tools (vendored)

Source: https://github.com/dylanpersonguy/OpenCharts (MIT, `LICENSE` in this folder), `src/lib/chart-plugins/drawing-tools`.
Upstream is an app, not an npm package, so the drawing layer is copied here.

SobatFX changes (each file's header says what changed):
- `constants.ts`: only the drawing types, plus a `by: "user" | "ai"` field.
- Position tool readout can be supplied by the host (forex lot / pip sizing from `src/lib/market/risk.ts`).
- Measure / trend line stats show pips when a pip size is set.
- Horizontal lines, trend lines and rectangles draw their `text` as a caption (used for AI labels).
- Runs on lightweight-charts v5 (upstream targets v4; the plugin API used is the same).
