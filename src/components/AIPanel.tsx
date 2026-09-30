"use client";

import { AlertTriangle, ArrowUp, Calculator, Camera, ImagePlus, Lock, Crown, Eraser, ImageOff, LogIn, PenLine, RotateCcw, Sparkles, Square, X } from "lucide-react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { extractAnnotations, prepareUpload } from "@/lib/annotate";
import { journalForAI } from "@/lib/paper";
import { describeDrawings, extractDrawings } from "@/lib/drawings";
import { AnnotatedImage } from "./AnnotatedImage";
import { checkPlans, type PlanCheck } from "@/lib/ai/lot-check";
import { adx, atr, bollinger, ema, macd, rsi, swings, turbulence } from "@/lib/market/indicators";
import { fmtMoney, pipValueUsd } from "@/lib/market/risk";
import { getInstrument, intervalSec } from "@/lib/market/symbols";
import { TIER_INFO, TIER_ORDER, type Tier } from "@/lib/tiers";
import { translate } from "@/lib/i18n";
import { useT } from "./i18n";
import { Markdown } from "./Markdown";
import { useWs } from "./workspace";

interface Msg {
  role: "user" | "assistant";
  content: string;
  withChart?: boolean;
  /** User-uploaded chart image (data URL) — the AI can mark it up on Pro/Ultra. */
  image?: string;
  /** The AI sent a drawing block the app couldn't use. */
  drawFailed?: boolean;
  drew?: number;
  /** The app's own lot sizing for each trade plan the AI drew (the AI's arithmetic can be wrong). */
  sizing?: { checks: PlanCheck[]; currency: "USD" | "IDR"; riskPct: number; digits: number };
  error?: "limit" | "auth" | "other";
}

const ERR = "\u0000ERR:";
const END = "\u0000END";
/** Conversation is kept on this device until "New chat" or sign-out. */
export const CHAT_KEY = "sfx.chat";

// Label/prompt keys: q.<id> and q.<id>Prompt in src/lib/i18n.ts
const QUICK = [
  { id: "analyze", chart: true },
  { id: "sr", chart: true },
  { id: "news", chart: false },
  { id: "check", chart: true },
  { id: "lot", chart: false },
] as const;

export function AIPanel() {
  const ws = useWs();
  const { me, symbol, interval, candles, drawings, setDrawings, risk, source, pendingAsk, setAiOpen, refreshMe, paper, prices, rates } = ws;
  const pathname = usePathname();
  const { t } = useT();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  // State, not a ref: saving starts only on the render that already holds the restored chat,
  // otherwise React's dev double-effect run saves [] over it first.
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- load browser-only state after mount */
    try {
      const saved = localStorage.getItem(CHAT_KEY);
      if (saved) setMsgs(JSON.parse(saved));
    } catch {}
    setRestored(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);
  const [input, setInput] = useState("");
  const [upload, setUpload] = useState<string | null>(null);
  const [uploadErr, setUploadErr] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const takeFile = async (f: File | undefined | null) => {
    if (!f) return;
    try {
      setUploadErr(false);
      setUpload(await prepareUpload(f));
    } catch {
      setUploadErr(true);
    }
  };
  const [busy, setBusy] = useState(false);
  const [attach, setAttach] = useState(true);
  const abort = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const lastAsk = useRef(0);
  const onChart = pathname === "/";

  useEffect(() => {
    try {
      if (restored) {
        const kept = msgs.filter((m) => m.content).slice(-40);
        let imgs = 0;
        // Images are large: keep them only on the 4 most recent messages that have one.
        const slim = kept
          .slice()
          .reverse()
          .map((m) => (m.image && ++imgs > 4 ? { ...m, image: undefined } : m))
          .reverse();
        localStorage.setItem(CHAT_KEY, JSON.stringify(slim));
      }
    } catch {}
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [msgs, restored]);

  const buildContext = useCallback(() => {
    const inst = getInstrument(symbol)!;
    const recent = candles.slice(-120);
    const closes = candles.map((c) => c.close);
    const r = (v: number | null | undefined) => (v == null ? null : +v.toFixed(inst.digits));
    const e20 = ema(closes, 20), e50 = ema(closes, 50), e200 = ema(closes, 200);
    const m = macd(closes), bb = bollinger(closes), turb = turbulence(candles.slice(0, -1));
    // Pip value per 1.00 lot in the account currency (NaN for a cross whose USD rate hasn't loaded → left out).
    const pv = candles.length ? pipValueUsd(inst, candles.at(-1)!.close, rates) * (risk.currency === "IDR" ? risk.usdIdr : 1) : NaN;
    return {
      page: pathname === "/" ? "chart" : pathname.slice(1),
      symbol: inst.id,
      symbolName: inst.name,
      interval,
      source: source?.name,
      sourceNote: source?.note && translate("en", `note.${source.note}`),
      lastPrice: candles.at(-1)?.close,
      candles: recent.map((c) => [c.time, r(c.open), r(c.high), r(c.low), r(c.close)]),
      indicators: {
        EMA20: r(e20.at(-1)),
        EMA50: r(e50.at(-1)),
        EMA200: r(e200.at(-1)),
        RSI14: rsi(closes) != null ? +rsi(closes)!.toFixed(1) : null,
        ATR14: r(atr(candles)),
        MACD: m ? +m.macd.toPrecision(4) : null,
        MACDsignal: m ? +m.signal.toPrecision(4) : null,
        BBupper: r(bb?.upper),
        BBlower: r(bb?.lower),
        ADX14: adx(candles) != null ? +adx(candles)!.toFixed(1) : null,
        TurbulencePct: turb ? Math.round(turb.pct) : null,
        pipSize: inst.pip,
      },
      swings: swings(recent),
      drawings: describeDrawings(drawings),
      risk: { balance: risk.balance, riskPct: risk.riskPct, currency: risk.currency, pipValue: Number.isFinite(pv) && pv > 0 ? +pv.toPrecision(6) : undefined },
      // Demo-trading journal for the AI review (Pro/Ultra; the server drops it on Free).
      journal: me?.tier && me.tier !== "free" && paper.trades.length ? journalForAI(paper, prices, rates) : undefined,
    };
  }, [symbol, interval, candles, drawings, risk, source, pathname, me, paper, prices, rates]);

  const send = useCallback(
    async (prompt: string, withChart: boolean, upload?: string | null) => {
      const text = prompt.trim() || (upload ? t("ai.uploadPrompt") : "");
      if (!text || busy) return;
      if (!me?.signedIn) {
        setMsgs((m) => [...m, { role: "user", content: text }, { role: "assistant", content: t("ai.needSignIn"), error: "auth" }]);
        return;
      }
      let image: string | undefined = upload ?? undefined;
      try {
        if (!image) image = withChart && onChart ? ws.chart.current?.screenshot() ?? undefined : undefined;
      } catch {
        // A failed capture shouldn't block the question — the AI still gets the candle data.
      }
      const history = [...msgs.filter((m) => !m.error), { role: "user" as const, content: text }];
      setMsgs((m) => [...m, { role: "user", content: text, withChart: Boolean(image) && !upload, image: upload ?? undefined }, { role: "assistant", content: "" }]);
      setInput("");
      setUpload(null);
      setBusy(true);
      const ctl = new AbortController();
      abort.current = ctl;
      const update = (fn: (m: Msg) => Msg) => setMsgs((all) => [...all.slice(0, -1), fn(all[all.length - 1])]);

      try {
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history.map(({ role, content }) => ({ role, content })), image, imageSource: upload ? "upload" : "chart", context: buildContext() }),
          signal: ctl.signal,
        });
        if (!res.ok || !res.body) {
          const j = await res.json().catch(() => ({}));
          update(() => ({ role: "assistant", content: j.error ?? t("ai.error"), error: j.code === "limit" ? "limit" : res.status === 401 ? "auth" : "other" }));
          return;
        }
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let full = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          full += dec.decode(value, { stream: true });
          const errAt = full.indexOf(ERR);
          if (errAt >= 0) {
            const before = full.slice(0, errAt);
            const msg = full.slice(errAt + ERR.length);
            update(() => ({ role: "assistant", content: before ? `${before}\n\n_${msg}_` : msg, error: before ? undefined : "other" }));
            return;
          }
          update((m) => ({ ...m, content: full.replace(END, "") }));
        }
        // No end marker = the server was cut off mid-reply (e.g. a hosting timeout).
        const complete = full.includes(END);
        full = full.replace(END, "");
        if (!complete) full += `\n\n_${t("ai.cutOff")}_`;
        const range = candles.length
          ? { tMin: candles[0].time, tMax: candles.at(-1)!.time, pMin: Math.min(...candles.slice(-300).map((c) => c.low)), pMax: Math.max(...candles.slice(-300).map((c) => c.high)), barSec: intervalSec(interval) }
          : undefined;
        const parsed = extractDrawings(full, range);
        let aiDraw = parsed.drawings;
        // Free tier is technical analysis only — never place trade-plan (position) drawings.
        if (me?.tier === "free") aiDraw = aiDraw.filter((d) => d.type !== "position");
        // Mark-up of an uploaded picture is drawn on that picture, never on the live chart.
        if (upload) aiDraw = [];
        if (aiDraw.length && onChart) setDrawings((all) => [...all.filter((d) => d.by !== "ai"), ...aiDraw]);
        const sizeInst = getInstrument(symbol);
        const checks = sizeInst ? checkPlans(parsed.text, aiDraw, sizeInst, risk, rates) : [];
        const sizing = checks.length ? { checks, currency: risk.currency, riskPct: risk.riskPct, digits: sizeInst!.digits } : undefined;
        update((m) => ({ ...m, content: full, drew: onChart ? aiDraw.length : 0, drawFailed: onChart && !upload && parsed.unreadable, sizing }));
      } catch (e) {
        if ((e as Error).name === "AbortError") update((m) => ({ ...m, content: m.content + `\n\n_${t("ai.stopped")}_` }));
        else update(() => ({ role: "assistant", content: t("ai.connection"), error: "other" }));
      } finally {
        setBusy(false);
        abort.current = null;
        refreshMe();
      }
    },
    [busy, me, msgs, onChart, ws.chart, buildContext, candles, interval, setDrawings, refreshMe, t, symbol, risk, rates],
  );

  // Requests coming from other parts of the app ("Ask AI" buttons).
  useEffect(() => {
    if (pendingAsk && pendingAsk.n !== lastAsk.current) {
      lastAsk.current = pendingAsk.n;
      send(pendingAsk.prompt, pendingAsk.withChart);
    }
  }, [pendingAsk, send]);

  const tier = me?.tier ?? "free";
  const [switching, setSwitching] = useState(false);
  const pickTier = async (next: Tier) => {
    if (next === tier || switching) return;
    setSwitching(true);
    await fetch("/api/tier", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tier: next }) }).catch(() => {});
    refreshMe();
    setSwitching(false);
  };
  const left = me?.usage ? Math.max(0, me.usage.limit - me.usage.used) : null;
  const inst = getInstrument(symbol)!;

  return (
    <aside className="flex h-full w-full flex-col border-l border-line bg-panel" aria-label="SobatFX AI">
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <Sparkles size={18} className="text-gold" />
        <div className="leading-tight">
          <div className="text-sm font-semibold">SobatFX AI</div>
          <div className="text-[11px] text-muted">
            {me?.signedIn ? (
              <>
                <span className={tier === "free" ? "" : "text-gold"}>{TIER_INFO[tier].label}</span>
                {left != null && ` · ${t(me.usage!.period === "daily" ? "ai.leftToday" : "ai.left", { left, limit: me.usage!.limit })}`}
              </>
            ) : (
              t("ai.signInToStart")
            )}
          </div>
        </div>
        <div className="ml-auto flex gap-1">
          {msgs.length > 0 && (
            <button className="icon-btn h-8 w-8" title={t("ai.newChat")} aria-label={t("ai.newChat")} onClick={() => setMsgs([])} disabled={busy}>
              <RotateCcw size={14} />
            </button>
          )}
          <button className="icon-btn h-8 w-8" aria-label={t("ai.closePanel")} onClick={() => setAiOpen(false)}>
            <X size={14} />
          </button>
        </div>
      </header>
      <div role="note" className="flex items-center gap-2 border-b border-gold-deep/30 bg-gold-soft px-4 py-2 text-[11px] font-semibold tracking-wide text-gold">
        <AlertTriangle size={14} className="shrink-0" /> {t("ai.warning")}
      </div>

      <div ref={scroller} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {msgs.length === 0 && (
          <div className="space-y-4">
            <div className="rounded-xl border border-line bg-panel-2 p-4 text-sm text-ink-2">
              <p className="mb-2 font-medium text-ink">{t("ai.hello")}</p>
              <p>{t("ai.intro", { pair: inst.label })}</p>
            </div>
            {!me?.signedIn && me && (
              <button className="btn btn-gold w-full justify-center" onClick={() => signIn("google")}>
                <LogIn size={16} /> {t("ai.signInFree")}
              </button>
            )}
            <div className="flex flex-wrap gap-2">
              {QUICK.filter((q) => !(q.id === "lot" && tier === "free")).map((q) =>
                q.id === "check" && tier === "free" ? (
                  <Link key={q.id} href="/upgrade" title={t("sel.proOnly")} className="flex items-center gap-1 rounded-full border border-gold-deep/50 px-3 py-1.5 text-xs text-gold hover:bg-gold-soft">
                    <Crown size={12} /> {t("q.checkPro")}
                  </Link>
                ) : (
                <button key={q.id} className="rounded-full border border-line-2 px-3 py-1.5 text-xs text-ink-2 hover:border-gold-deep hover:text-gold" onClick={() => send(t(q.id === "analyze" && tier === "free" ? "q.analyzeFreePrompt" : `q.${q.id}Prompt`), q.chart && attach)} disabled={busy}>
                  {t(`q.${q.id}`)}
                </button>
                ),
              )}
            </div>
          </div>
        )}

        {msgs.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="enter ml-8 rounded-xl rounded-br-sm bg-panel-3 px-3.5 py-2.5 text-sm">
              {m.image && (
                // eslint-disable-next-line @next/next/no-img-element -- local data URL
                <img src={m.image} alt="" className="mb-2 max-h-40 rounded-lg border border-line-2" />
              )}
              {m.content}
              {m.withChart && (
                <div className="mt-1 flex items-center gap-1 text-[11px] text-muted">
                  <Camera size={11} /> {t("ai.chartAttached")}
                </div>
              )}
            </div>
          ) : (
            <div key={i} className="enter text-sm leading-relaxed text-ink-2">
              {m.error ? (
                <div className="rounded-xl border border-line-2 bg-panel-2 p-3">
                  <p className="text-ink">{m.content}</p>
                  {m.error === "limit" && (
                    <Link href="/upgrade" className="btn btn-gold mt-3 h-8 text-xs">
                      <Crown size={14} /> {t("ai.upgradeQris")}
                    </Link>
                  )}
                  {m.error === "auth" && (
                    <button className="btn btn-gold mt-3 h-8 text-xs" onClick={() => signIn("google")}>
                      <LogIn size={14} /> {t("app.signIn")}
                    </button>
                  )}
                </div>
              ) : m.content ? (
                <>
                  <Markdown text={extractAnnotations(extractDrawings(m.content).text).text} />
                  {extractDrawings(m.content).pending && <p className="mt-1 flex items-center gap-1.5 text-xs text-gold"><PenLine size={12} /> {t("ai.drawing")}</p>}
                  {msgs[i - 1]?.image && extractAnnotations(m.content).pending && <p className="mt-1 flex items-center gap-1.5 text-xs text-gold"><PenLine size={12} /> {t("ai.annotating")}</p>}
                  {msgs[i - 1]?.image && extractAnnotations(m.content).shapes.length > 0 && <AnnotatedImage src={msgs[i - 1].image!} shapes={extractAnnotations(m.content).shapes} />}
                  {m.sizing && (
                    <div className="mt-2 space-y-1 rounded-lg border border-line-2 bg-panel-2 px-2.5 py-1.5 text-xs">
                      <p className="flex items-center gap-1.5 font-medium text-ink">
                        <Calculator size={12} /> {t("ai.calcTitle")}
                      </p>
                      {m.sizing.checks.map((c, j) => {
                        const risk = fmtMoney(c.riskMoney, m.sizing!.currency);
                        const side = t(c.side === "short" ? "pos.short" : "pos.long");
                        const entry = c.entry.toFixed(m.sizing!.digits);
                        return (
                          <div key={j}>
                            <p className="text-ink-2">
                              {c.tooWide
                                ? `${side} ${entry} · SL ${c.slPips.toFixed(1)} ${t("calc.pips")}`
                                : t("ai.calcRow", { side, entry, pips: c.slPips.toFixed(1), lot: c.lot.toFixed(2), risk, pct: m.sizing!.riskPct, rr: c.rr?.toFixed(2) ?? "—" })}
                            </p>
                            {c.tooWide && <p className="text-gold">{t("ai.calcTooWide", { pct: m.sizing!.riskPct, risk })}</p>}
                            {c.mismatch && !c.tooWide && <p className="flex items-center gap-1 text-gold"><AlertTriangle size={11} /> {t("ai.calcMismatch")}</p>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {m.drawFailed && (
                    <p className="mt-2 rounded-lg border border-line-2 bg-panel-2 px-2.5 py-1.5 text-xs text-muted">
                      <PenLine size={12} className="mr-1 inline" /> {t("ai.drawFailed")}
                    </p>
                  )}
                  {!!m.drew && (
                    <div className="pop mt-2 flex items-center gap-2 rounded-lg border border-gold-deep/40 bg-gold-soft px-2.5 py-1.5 text-xs text-gold">
                      <PenLine size={12} /> {t("ai.drew", { n: m.drew })}
                      <button className="ml-auto flex items-center gap-1 text-muted hover:text-ink" onClick={() => setDrawings((all) => all.filter((d) => d.by !== "ai"))}>
                        <Eraser size={12} /> {t("ai.remove")}
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-center gap-1 py-1 text-gold" aria-label={t("ai.thinking")}>
                  <span className="dot">●</span>
                  <span className="dot [animation-delay:.2s]">●</span>
                  <span className="dot [animation-delay:.4s]">●</span>
                  <span className="ml-2 text-xs text-muted">{t("ai.reading")}</span>
                </div>
              )}
            </div>
          ),
        )}
      </div>

      <form
        className="border-t border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(input, attach, upload);
        }}
      >
        {me?.signedIn && (
          <div className="mb-2 flex items-center gap-2">
            <span className="text-[11px] text-muted">{t("ai.tierPick")}</span>
            <div role="radiogroup" aria-label={t("ai.tierPick")} className="flex rounded-lg border border-line-2 bg-panel p-0.5 text-[11px] font-semibold">
              {TIER_ORDER.map((tr) => {
                const active = tr === tier;
                const cls = `flex items-center gap-1 rounded-md px-2.5 py-1 ${active ? "bg-gold-soft text-gold" : "text-muted hover:text-ink"}`;
                if (me.canSwitchTier)
                  return (
                    <button key={tr} type="button" role="radio" aria-checked={active} className={cls} disabled={busy || switching} onClick={() => pickTier(tr)}>
                      {TIER_INFO[tr].label}
                    </button>
                  );
                // Real users: current plan highlighted; other tiers lead to the plans page.
                return active ? (
                  <span key={tr} role="radio" aria-checked className={cls}>
                    {TIER_INFO[tr].label}
                  </span>
                ) : (
                  <Link key={tr} href="/upgrade" role="radio" aria-checked={false} className={cls} title={t("ai.tierLocked", { tier: TIER_INFO[tr].label })}>
                    {TIER_ORDER.indexOf(tr) > TIER_ORDER.indexOf(tier) && <Lock size={10} />}
                    {TIER_INFO[tr].label}
                  </Link>
                );
              })}
            </div>
          </div>
        )}
        <div className="rounded-xl border border-line-2 bg-panel-2 focus-within:border-gold-deep">
          {upload && (
            <div className="flex items-center gap-2 px-3 pt-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- local data URL */}
              <img src={upload} alt="" className="h-14 rounded-md border border-line-2" />
              <span className="text-[11px] text-muted">{t("ai.imageAttached")}</span>
              <button type="button" className="icon-btn ml-auto h-7 w-7" aria-label={t("ai.removeImage")} title={t("ai.removeImage")} onClick={() => setUpload(null)}>
                <X size={12} />
              </button>
            </div>
          )}
          {uploadErr && <p className="px-3 pt-2 text-[11px] text-down">{t("ai.uploadInvalid")}</p>}
          <textarea
            className="block max-h-40 min-h-[44px] w-full resize-none bg-transparent px-3 pt-3 text-sm outline-none placeholder:text-muted focus-visible:outline-none"
            onPaste={(e) => {
              const f = [...e.clipboardData.files].find((x) => x.type.startsWith("image/"));
              if (f && tier !== "free") {
                e.preventDefault();
                takeFile(f);
              }
            }}
            placeholder={t("ai.placeholder", { pair: inst.label })}
            value={input}
            rows={2}
            maxLength={4000}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input, attach, upload);
              }
            }}
          />
          <div className="flex flex-wrap items-center gap-1 px-2 pb-2">
            {tier === "free" ? (
              <Link href="/upgrade" className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-gold hover:bg-gold-soft" title={t("ai.uploadProTitle")}>
                <Crown size={13} /> {t("ai.uploadPro")}
              </Link>
            ) : (
              <>
                <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { takeFile(e.target.files?.[0]); e.target.value = ""; }} />
                <button type="button" className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-ink-2 hover:text-gold" onClick={() => fileInput.current?.click()} title={t("ai.uploadTitle")}>
                  <ImagePlus size={13} /> {t("ai.upload")}
                </button>
              </>
            )}
            <button
              type="button"
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] ${attach && onChart && !upload ? "text-gold" : "text-muted"}`}
              onClick={() => setAttach((a) => !a)}
              disabled={!onChart}
              title={t(onChart ? "ai.attachTitleOn" : "ai.attachTitleOff")}
            >
              {attach && onChart ? <Camera size={13} /> : <ImageOff size={13} />}
              {t(attach && onChart ? "ai.attachOn" : "ai.attachOff")}
            </button>
            {busy ? (
              <button type="button" className="icon-btn ml-auto h-8 w-8" aria-label={t("ai.stop")} onClick={() => abort.current?.abort()}>
                <Square size={12} />
              </button>
            ) : (
              <button type="submit" className="icon-btn ml-auto h-8 w-8 !border-gold !bg-gold !text-[#171410]" aria-label={t("ai.send")} disabled={!input.trim() && !upload}>
                <ArrowUp size={16} />
              </button>
            )}
          </div>
        </div>
        <p className="mt-2 text-center text-[10px] text-muted">
          <span className="font-semibold text-gold">{t("ai.warning")}</span> {t("ai.disclaimer")}
        </p>
      </form>
    </aside>
  );
}
