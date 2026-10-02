"use client";

import { PenLine, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useT } from "@/components/i18n";
import { LiveRate } from "@/components/LiveRate";
import { fmtPrice, useNow, useWs } from "@/components/workspace";
import { uid } from "@/lib/drawings";
import { fmtMoney, pipValueUsd, positionSize, withCurrency } from "@/lib/market/risk";
import { INSTRUMENTS, getInstrument, intervalSec } from "@/lib/market/symbols";

export default function CalculatorPage() {
  const { symbol, setSymbol, interval, risk, setRisk, rates, candles, setDrawings, askAI } = useWs();
  const router = useRouter();
  const inst = getInstrument(symbol)!;
  const last = candles.at(-1)?.close;
  const now = useNow();
  const { t } = useT();
  const [side, setSide] = useState<"long" | "short">("long");
  const [mode, setMode] = useState<"price" | "pips">("pips");
  const [sl, setSl] = useState<number>(20);
  const [tp, setTp] = useState<number>(40);
  // Entry defaults to the live price until the user types their own.
  const [typed, setTyped] = useState<Record<string, number>>({});
  const [live, setLive] = useState<Record<string, number>>({});
  useEffect(() => {
    fetch(`/api/quotes?symbols=${symbol}`)
      .then((r) => r.json())
      .then((rows: { id: string; price: number | null }[]) => rows[0]?.price && setLive((l) => ({ ...l, [symbol]: rows[0].price! })))
      .catch(() => {});
  }, [symbol]);
  const livePrice = last ?? live[symbol];
  const entry = typed[symbol] ?? (livePrice ? +livePrice.toFixed(inst.digits) : 0);
  const setEntry = (v: number) => setTyped((t) => ({ ...t, [symbol]: v }));

  const dir = side === "long" ? 1 : -1;
  const slPrice = mode === "pips" ? entry - dir * sl * inst.pip : sl;
  const tpPrice = mode === "pips" ? (tp ? entry + dir * tp * inst.pip : null) : tp || null;
  const r = entry ? positionSize(inst, risk, entry, slPrice, tpPrice, rates) : null;
  const pv = entry ? pipValueUsd(inst, entry, rates) : NaN;
  const fx = risk.currency === "IDR" ? risk.usdIdr : 1;

  const sendToChart = () => {
    if (!tpPrice) return;
    const t = candles.at(-1)?.time ?? Math.floor(now / 1000);
    setDrawings((all) => [
      ...all,
      { id: uid(), by: "user", type: "position", side, color: side === "long" ? "#22b36b" : "#e0453c", price: entry, stopPrice: +slPrice.toFixed(inst.digits), targetPrice: +tpPrice.toFixed(inst.digits), time: t, time2: t + intervalSec(interval) * 25 },
    ]);
    router.push("/");
  };

  return (
    <div className="mx-auto max-w-5xl px-4 pb-24 pt-6 @2xl:px-8">
      <h1 className="text-2xl font-medium">{t("calc.title")}</h1>
      <p className="mt-1 text-sm text-muted">{t("calc.sub")}</p>

      <div className="mt-6 grid gap-6 @4xl:grid-cols-[1fr_380px]">
        <div className="card space-y-5 p-5">
          <div className="grid gap-4 @lg:grid-cols-3">
            <Field label={t("calc.currency")}>
              <select className="field" value={risk.currency} onChange={(e) => setRisk(withCurrency(risk, e.target.value as "USD" | "IDR"))}>
                <option value="USD">USD ($)</option>
                <option value="IDR">IDR (Rp)</option>
              </select>
            </Field>
            <Field label={t("calc.balance", { cur: risk.currency })}>
              <input className="field num" type="number" min={0} value={risk.balance} onChange={(e) => setRisk({ balance: +e.target.value })} />
            </Field>
            {risk.currency === "IDR" && (
              <Field label={t("calc.usdIdr")}>
                <LiveRate />
              </Field>
            )}
          </div>

          <Field label={t("calc.riskPer", { pct: risk.riskPct, amt: fmtMoney((risk.balance * risk.riskPct) / 100, risk.currency) })}>
            <input type="range" min={0.25} max={5} step={0.25} value={risk.riskPct} onChange={(e) => setRisk({ riskPct: +e.target.value })} className="w-full accent-[var(--gold)]" />
          </Field>

          <div className="grid gap-4 @lg:grid-cols-3">
            <Field label={t("calc.instrument")}>
              <select className="field" value={symbol} onChange={(e) => setSymbol(e.target.value)}>
                {INSTRUMENTS.map((i) => (
                  <option key={i.id} value={i.id}>{i.label}</option>
                ))}
              </select>
            </Field>
            <Field label={t("calc.direction")}>
              <div className="grid grid-cols-2 gap-1 rounded-[10px] border border-line-2 bg-panel p-1">
                {(["long", "short"] as const).map((s) => (
                  <button key={s} className={`rounded-md py-1.5 text-sm ${side === s ? (s === "long" ? "bg-up/20 text-up" : "bg-down/20 text-down") : "text-muted"}`} onClick={() => setSide(s)}>
                    {t(s === "long" ? "calc.buy" : "calc.sell")}
                  </button>
                ))}
              </div>
            </Field>
            <Field label={`${t("calc.entry")}${last ? ` ${t("calc.live", { p: fmtPrice(last, inst.digits) })}` : ""}`}>
              <input className="field num" type="number" step={inst.pip} value={entry} onChange={(e) => setEntry(+e.target.value)} />
            </Field>
          </div>

          <div className="flex gap-2 text-xs">
            <span className="text-muted">{t("calc.enterAs")}</span>
            {(["pips", "price"] as const).map((m) => (
              <button
                key={m}
                className={m === mode ? "text-gold underline" : "text-ink-2"}
                onClick={() => {
                  if (m === mode) return;
                  if (m === "price") {
                    setSl(+slPrice.toFixed(inst.digits));
                    setTp(tpPrice ? +tpPrice.toFixed(inst.digits) : 0);
                  } else {
                    setSl(+(Math.abs(entry - sl) / inst.pip).toFixed(1));
                    setTp(tp ? +(Math.abs(tp - entry) / inst.pip).toFixed(1) : 0);
                  }
                  setMode(m);
                }}
              >
                {t(m === "pips" ? "calc.pips" : "calc.price")}
              </button>
            ))}
          </div>
          <div className="grid gap-4 @lg:grid-cols-2">
            <Field label={t("calc.sl", { mode: t(mode === "pips" ? "calc.pips" : "calc.price") })}>
              <input className="field num" type="number" step={mode === "pips" ? 1 : inst.pip} value={sl} onChange={(e) => setSl(+e.target.value)} />
            </Field>
            <Field label={t("calc.tp", { mode: t(mode === "pips" ? "calc.pips" : "calc.price") })}>
              <input className="field num" type="number" step={mode === "pips" ? 1 : inst.pip} value={tp} onChange={(e) => setTp(+e.target.value)} />
            </Field>
          </div>
          <p className="text-xs text-muted">
            {t("calc.info", { pair: inst.label, pip: inst.pip, contract: inst.contract.toLocaleString(), base: inst.base, pv: Number.isFinite(pv) ? fmtMoney(pv * fx, risk.currency) : t("calc.loadingRates") })}
          </p>
        </div>

        <div className="card flex flex-col gap-3 p-5">
          <div className="text-sm text-muted">{t("calc.recommended")}</div>
          <div className="num text-5xl font-medium text-gold">{r ? r.lot.toFixed(2) : "—"}</div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <Out k={t("sel.risk")} v={r ? fmtMoney(r.riskMoney, risk.currency) : "—"} tone="text-down" />
            <Out k={t("sel.reward")} v={r?.rewardMoney != null ? fmtMoney(r.rewardMoney, risk.currency) : "—"} tone="text-up" />
            <Out k="R:R" v={r?.rr != null ? `1 : ${r.rr.toFixed(2)}` : "—"} />
            <Out k={t("calc.valuePip")} v={r ? fmtMoney(r.pipValue, risk.currency) : "—"} />
            <Out k={t("calc.slPrice")} v={fmtPrice(slPrice, inst.digits)} />
            <Out k={t("calc.tpPrice")} v={fmtPrice(tpPrice, inst.digits)} />
          </div>
          {r?.warnings.map((w) => (
            <p key={w} className="text-xs text-down">⚠ {t(`warn.${w}`)}</p>
          ))}
          {r?.rr != null && <p className="text-xs text-muted">{t("calc.breakeven", { pct: (100 / (1 + r.rr)).toFixed(0) })}</p>}
          <div className="mt-auto flex flex-col gap-2 pt-2">
            <button className="btn justify-center" onClick={sendToChart} disabled={!tpPrice || !r}>
              <PenLine size={15} /> {t("calc.draw")}
            </button>
            <button
              className="btn justify-center"
              onClick={() =>
                askAI(
                  t("calc.reviewPrompt", {
                    pair: inst.label,
                    side: t(side === "long" ? "calc.sideBuy" : "calc.sideSell"),
                    entry,
                    sl: fmtPrice(slPrice, inst.digits),
                    tp: fmtPrice(tpPrice, inst.digits),
                    lot: r?.lot.toFixed(2) ?? "—",
                    pct: risk.riskPct,
                    bal: risk.balance,
                    cur: risk.currency,
                  }),
                  { withChart: false },
                )
              }
            >
              <Sparkles size={15} /> {t("calc.review")}
            </button>
          </div>
        </div>
      </div>

      <div className="card mt-6 p-5 text-sm text-ink-2">
        <h2 className="mb-2 font-medium text-ink">{t("calc.how")}</h2>
        <p className="num">{t("calc.formula")}</p>
        <p className="mt-2">{t("calc.note")}</p>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-xs text-muted">
      {label}
      {children}
    </label>
  );
}

function Out({ k, v, tone }: { k: string; v: string; tone?: string }) {
  return (
    <div className="rounded-lg bg-panel px-3 py-2">
      <div className="text-[11px] text-muted">{k}</div>
      <div className={`num ${tone ?? ""}`}>{v}</div>
    </div>
  );
}
