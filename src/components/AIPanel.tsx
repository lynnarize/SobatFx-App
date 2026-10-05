"use client";

import { AlertTriangle, ArrowUp, Calculator, Camera, Clock, History, ImagePlus, Lock, Crown, Eraser, ImageOff, LogIn, MessagesSquare, PenLine, SquarePen, Sparkles, Square, Trash2, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type Conversation, HISTORY_CLEARED_EVENT, HISTORY_TTL_DAYS, clearHistory, dayGroup, daysLeft, loadHistory, prune, saveHistory, upsert } from "@/lib/chat-history";
import { extractAnnotations, prepareUpload } from "@/lib/annotate";
import { journalForAI } from "@/lib/paper";
import { MIN_RR, type Drawing, type RejectedPlan, addDrawings, asksForDrawing, describeDrawings, extractDrawings, uid } from "@/lib/drawings";
import { AnnotatedImage } from "./AnnotatedImage";
import { checkPlans, type PlanCheck } from "@/lib/ai/lot-check";
import { guardPlans, type PlanNote } from "@/lib/ai/plan-guard";
import { adx, atr, bollinger, ema, macd, rsi, swings, turbulence } from "@/lib/market/indicators";
import { fmtMoney, pipValueUsd } from "@/lib/market/risk";
import { getInstrument, intervalSec } from "@/lib/market/symbols";
import { TIER_INFO, TIER_ORDER, type Tier } from "@/lib/tiers";
import { translate } from "@/lib/i18n";
import { useT } from "./i18n";
import { Markdown } from "./Markdown";
import { useStartSignIn } from "./SignInConsent";
import { useWs } from "./workspace";

interface Msg {
  role: "user" | "assistant";
  content: string;
  withChart?: boolean;
  /** User-uploaded chart image (data URL) — the AI can mark it up on Pro/Ultra. */
  image?: string;
  /** The AI sent a drawing block the app couldn't use. */
  drawFailed?: boolean;
  /** Old saved chats only: how many drawings were added. */
  drew?: number;
  /** The chart drawings from this reply. Whether they're on the chart is read from the chart itself (by id). */
  draw?: { items: Drawing[]; symbol: string };
  /** Trade plans the AI sent that were not drawn because their R:R was below the minimum. */
  rejected?: RejectedPlan[];
  /** Corrections the app made to the AI's trade plans (TP in front of a level, SL beyond structure) and momentum warnings. */
  planNotes?: PlanNote[];
  /** The app's own lot sizing for each trade plan the AI drew (the AI's arithmetic can be wrong). */
  sizing?: { checks: PlanCheck[]; currency: "USD" | "IDR"; riskPct: number; digits: number };
  error?: "limit" | "auth" | "other";
}

const ERR = "\u0000ERR:";
const END = "\u0000END";

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
  const startSignIn = useStartSignIn();
  // Chat history on this device (src/lib/chat-history.ts); the open conversation is `chatId`.
  const [history, setHistory] = useState<Conversation<Msg>[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const msgs = useMemo(() => history.find((c) => c.id === chatId)?.msgs ?? [], [history, chatId]);
  /** Edits one conversation by id, so a reply still streaming lands in its own chat. */
  const editChat = useCallback((id: string, fn: (m: Msg[]) => Msg[]) => {
    const now = Date.now();
    setHistory((h) => upsert(h, id, fn, now));
  }, []);
  // State, not a ref: saving starts only on the render that already holds the restored history,
  // otherwise React's dev double-effect run saves [] over it first.
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- load browser-only state after mount */
    const saved = loadHistory<Msg>(Date.now());
    setHistory(saved);
    // Reopen the latest conversation, as before history existed.
    setChatId(saved[0]?.id ?? null);
    setRestored(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    const onCleared = () => {
      setHistory([]);
      setChatId(null);
    };
    window.addEventListener(HISTORY_CLEARED_EVENT, onCleared);
    return () => window.removeEventListener(HISTORY_CLEARED_EVENT, onCleared);
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
    if (restored) saveHistory(history, Date.now());
  }, [history, restored]);
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [msgs]);

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
    async (prompt: string, withChart: boolean, upload?: string | null, recap?: string) => {
      const text = prompt.trim() || (upload ? t("ai.uploadPrompt") : "");
      if (!text || busy) return;
      const cid = chatId ?? uid();
      if (!chatId) setChatId(cid);
      const setMsgs = (fn: (m: Msg[]) => Msg[]) => editChat(cid, fn);
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
          body: JSON.stringify({ messages: history.map(({ role, content }) => ({ role, content })), image, imageSource: upload ? "upload" : "chart", context: buildContext(), recap: recap ? { cur: recap } : undefined }),
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
        const sizeInst = getInstrument(symbol);
        const guarded = sizeInst ? guardPlans(parsed.drawings, candles, sizeInst.digits) : { drawings: parsed.drawings, notes: [], rejected: [] };
        let aiDraw = guarded.drawings;
        const rejected = [...parsed.rejected, ...guarded.rejected];
        // Free tier is technical analysis only — never place trade-plan (position) drawings.
        if (me?.tier === "free") aiDraw = aiDraw.filter((d) => d.type !== "position");
        // Mark-up of an uploaded picture is drawn on that picture, never on the live chart.
        if (upload) aiDraw = [];
        // New drawings replace the old AI ones only when the user asked for an analysis/drawing or there are none yet.
        // Otherwise (follow-ups, reviews…) they're offered in the reply and the user decides.
        const replace = asksForDrawing(text) || !drawings.some((d) => d.by === "ai");
        if (aiDraw.length && onChart && replace) setDrawings((all) => [...all.filter((d) => d.by !== "ai"), ...aiDraw]);
        // A stop the app moved changes the lot, so the reply's own lot figure is expected to differ.
        const movedSl = new Set(guarded.notes.filter((n) => n.kind === "sl").map((n) => `${n.side}|${n.entry}`));
        const checks = (sizeInst ? checkPlans(parsed.text, aiDraw, sizeInst, risk, rates) : []).map((c) => (movedSl.has(`${c.side}|${c.entry}`) ? { ...c, mismatch: false } : c));
        const paid = onChart && !upload && me?.tier !== "free";
        const sizing = checks.length ? { checks, currency: risk.currency, riskPct: risk.riskPct, digits: sizeInst!.digits } : undefined;
        update((m) => ({ ...m, content: full, draw: onChart && aiDraw.length ? { items: aiDraw, symbol } : undefined, drawFailed: onChart && !upload && parsed.unreadable, rejected: paid ? rejected : undefined, planNotes: paid && guarded.notes.length ? guarded.notes : undefined, sizing }));
      } catch (e) {
        if ((e as Error).name === "AbortError") update((m) => ({ ...m, content: m.content + `\n\n_${t("ai.stopped")}_` }));
        else update(() => ({ role: "assistant", content: t("ai.connection"), error: "other" }));
      } finally {
        setBusy(false);
        abort.current = null;
        refreshMe();
      }
    },
    [busy, me, msgs, chatId, editChat, onChart, ws.chart, buildContext, candles, interval, drawings, setDrawings, refreshMe, t, symbol, risk, rates],
  );

  // Requests coming from other parts of the app ("Ask AI" buttons).
  useEffect(() => {
    if (pendingAsk && pendingAsk.n !== lastAsk.current) {
      lastAsk.current = pendingAsk.n;
      send(pendingAsk.prompt, pendingAsk.withChart, null, pendingAsk.recap);
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
          <button
            className="icon-btn h-8 w-8"
            title={t("hist.title")}
            aria-label={t("hist.title")}
            aria-pressed={showHistory}
            onClick={() => {
              // Drop chats that expired while the app was open.
              const now = Date.now();
              if (!showHistory) setHistory((h) => prune(h, now));
              setShowHistory((s) => !s);
            }}
          >
            <History size={14} />
          </button>
          {(msgs.length > 0 || showHistory) && (
            <button
              className="icon-btn h-8 w-8"
              title={t("ai.newChat")}
              aria-label={t("ai.newChat")}
              onClick={() => {
                setChatId(null);
                setShowHistory(false);
              }}
              disabled={busy}
            >
              <SquarePen size={14} />
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

      {showHistory && (
        <HistoryList
          history={history}
          activeId={chatId}
          busy={busy}
          onOpen={(id) => {
            setChatId(id);
            setShowHistory(false);
          }}
          onDelete={(id) => {
            setHistory((h) => h.filter((c) => c.id !== id));
            if (id === chatId) setChatId(null);
          }}
          onClearAll={() => {
            if (window.confirm(t("hist.clearConfirm"))) clearHistory();
          }}
        />
      )}
      <div ref={scroller} className={`flex-1 space-y-4 overflow-y-auto px-4 py-4 ${showHistory ? "hidden" : ""}`}>
        {msgs.length === 0 && (
          <div className="space-y-4">
            <div className="rounded-xl border border-line bg-panel-2 p-4 text-sm text-ink-2">
              <p className="mb-2 font-medium text-ink">{t("ai.hello")}</p>
              <p>{t("ai.intro", { pair: inst.label })}</p>
            </div>
            {!me?.signedIn && me && (
              <button className="btn btn-gold w-full justify-center" onClick={startSignIn}>
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
                    <button className="btn btn-gold mt-3 h-8 text-xs" onClick={startSignIn}>
                      <LogIn size={14} /> {t("app.signIn")}
                    </button>
                  )}
                </div>
              ) : m.content ? (
                <>
                  {/* The app's corrections come first: the reply below still quotes the AI's own TP/SL/R:R. */}
                  {(m.rejected?.length || m.planNotes) && (
                    <div className="mb-2 space-y-1.5">
                      {m.rejected?.map((p, j) => (
                        <p key={`r${j}`} className="flex items-start gap-1.5 rounded-lg border border-down/40 bg-panel-2 px-2.5 py-1.5 text-xs font-medium text-down">
                          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                          {t(p.adjusted ? "ai.rrRejectedAdj" : "ai.rrRejected", { side: t(p.side === "short" ? "pos.short" : "pos.long"), entry: p.entry, rr: p.rr.toFixed(2), min: MIN_RR })}
                        </p>
                      ))}
                      {[...(m.planNotes ?? [])].sort((a, b) => +(b.kind === "rr") - +(a.kind === "rr")).map((n, j) => (
                        <p key={j} className={`flex items-start gap-1.5 rounded-lg border border-gold-deep/40 bg-panel-2 px-2.5 py-1.5 text-xs text-gold ${n.kind === "rr" ? "font-medium" : ""}`}>
                          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                          {n.kind === "rr"
                            ? t("ai.fixRr", { from: n.from.toFixed(2), to: n.to.toFixed(2) })
                            : n.kind === "tp"
                              ? t("ai.fixTp", { from: n.from, to: n.to, level: n.level })
                              : n.kind === "sl"
                                ? t("ai.fixSl", { from: n.from, to: n.to, atr: n.atr })
                                : t(n.side === "short" ? "ai.momentumShort" : "ai.momentumLong", { entry: n.entry })}
                        </p>
                      ))}
                    </div>
                  )}
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
                  {m.draw && <DrawCard draw={m.draw} />}
                  {!!m.drew && !m.draw && (
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
        className={`border-t border-line p-3 ${showHistory ? "hidden" : ""}`}
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
              <button type="submit" className="icon-btn ml-auto h-8 w-8 !border-gold !bg-gold !text-on-gold" aria-label={t("ai.send")} disabled={!input.trim() && !upload}>
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

/** A reply's chart drawings: on the chart (remove), offered (replace the AI's / add), or for another pair. */
function DrawCard({ draw }: { draw: { items: Drawing[]; symbol: string } }) {
  const { symbol, drawings, setDrawings } = useWs();
  const { t } = useT();
  const ids = new Set(draw.items.map((d) => d.id));
  const n = draw.items.length;
  if (draw.symbol !== symbol)
    return (
      <p className="mt-2 flex items-center gap-1.5 rounded-lg border border-line-2 bg-panel-2 px-2.5 py-1.5 text-xs text-muted">
        <PenLine size={12} /> {t("ai.drawOther", { n, pair: getInstrument(draw.symbol)?.label ?? draw.symbol })}
      </p>
    );
  // Also "on the chart" when every object in it is already drawn there (the AI re-sent unchanged levels).
  if (drawings.some((d) => ids.has(d.id)) || addDrawings(drawings, draw.items).length === drawings.length)
    return (
      <div className="pop mt-2 flex items-center gap-2 rounded-lg border border-gold-deep/40 bg-gold-soft px-2.5 py-1.5 text-xs text-gold">
        <PenLine size={12} /> {t("ai.drew", { n })}
        {/* Only this reply's drawings, and not the ones the user has since moved or edited (they're theirs now). */}
        <button className="ml-auto flex items-center gap-1 text-muted hover:text-ink" onClick={() => setDrawings((all) => all.filter((d) => !(ids.has(d.id) && d.by === "ai")))}>
          <Eraser size={12} /> {t("ai.remove")}
        </button>
      </div>
    );
  return (
    <div className="mt-2 rounded-lg border border-line-2 bg-panel-2 px-2.5 py-2 text-xs">
      <p className="flex items-center gap-1.5 text-ink-2">
        <PenLine size={12} className="text-gold" /> {t("ai.drawOffer", { n })}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button className="btn btn-gold h-7 text-xs" onClick={() => setDrawings((all) => [...all.filter((d) => d.by !== "ai"), ...draw.items])}>
          {t("ai.drawReplace")}
        </button>
        <button className="btn h-7 text-xs" onClick={() => setDrawings((all) => addDrawings(all, draw.items))}>
          {t("ai.drawAdd")}
        </button>
      </div>
    </div>
  );
}

/** Past conversations on this device, grouped by day. Each one is deleted 7 days after its last message. */
function HistoryList({
  history,
  activeId,
  busy,
  onOpen,
  onDelete,
  onClearAll,
}: {
  history: Conversation<Msg>[];
  activeId: string | null;
  busy: boolean;
  onOpen(id: string): void;
  onDelete(id: string): void;
  onClearAll(): void;
}) {
  const { t, locale } = useT();
  // Captured when the list opens; the list is short-lived so it doesn't need to tick.
  const [now] = useState(() => Date.now());
  const groups = (["today", "yesterday", "earlier"] as const)
    .map((g) => ({ g, items: history.filter((c) => dayGroup(c.updatedAt, now) === g) }))
    .filter((x) => x.items.length);

  return (
    <div className="enter flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 px-4 pb-2 pt-4">
        <h2 className="text-sm font-semibold">{t("hist.title")}</h2>
        <span className="rounded-full bg-panel-3 px-2 py-0.5 text-[10px] text-muted">{history.length}</span>
      </div>
      <div className="mx-4 mb-3 flex items-start gap-2.5 rounded-xl border border-line bg-panel-2 px-3 py-2.5 text-[11px] leading-snug text-ink-2">
        <Clock size={14} className="mt-0.5 shrink-0 text-gold" />
        <span>{t("hist.note", { days: HISTORY_TTL_DAYS })}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {!groups.length && (
          <div className="flex flex-col items-center px-6 py-12 text-center">
            <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl border border-line-2 bg-panel-3">
              <MessagesSquare size={20} className="text-gold" />
            </div>
            <p className="text-sm font-medium">{t("hist.empty")}</p>
            <p className="mt-1 text-xs text-muted">{t("hist.emptyHint")}</p>
          </div>
        )}
        {groups.map(({ g, items }) => (
          <div key={g} className="mb-2">
            <div className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted">{t(`hist.${g}`)}</div>
            <ul className="space-y-0.5">
              {items.map((c) => {
                const active = c.id === activeId;
                const left = daysLeft(c, now);
                return (
                  <li key={c.id} className="group relative">
                    <button
                      className={`flex w-full flex-col rounded-xl px-3 py-2.5 pr-10 text-left transition ${active ? "bg-panel-3" : "hover:bg-panel-2"}`}
                      onClick={() => onOpen(c.id)}
                      disabled={busy && !active}
                      aria-current={active ? "true" : undefined}
                    >
                      <span className={`truncate text-sm ${active ? "text-gold" : "text-ink"}`}>{c.title || t("ai.newChat")}</span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted">
                        {new Date(c.updatedAt).toLocaleString(locale, g === "earlier" ? { weekday: "short", hour: "2-digit", minute: "2-digit" } : { hour: "2-digit", minute: "2-digit" })}
                        <span aria-hidden>·</span>
                        {t("hist.msgs", { n: c.msgs.length })}
                        {left <= 2 && (
                          <>
                            <span aria-hidden>·</span>
                            <span className="text-down">{t("hist.expires", { n: left })}</span>
                          </>
                        )}
                      </span>
                    </button>
                    <button
                      className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-lg text-muted opacity-100 hover:bg-panel-3 hover:text-down sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                      aria-label={t("hist.delete")}
                      title={t("hist.delete")}
                      onClick={() => onDelete(c.id)}
                      disabled={busy && active}
                    >
                      <Trash2 size={13} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      {history.length > 0 && (
        <div className="border-t border-line p-3">
          <button className="btn w-full justify-center text-down" onClick={onClearAll} disabled={busy}>
            <Trash2 size={14} /> {t("hist.clearAll")}
          </button>
        </div>
      )}
    </div>
  );
}
