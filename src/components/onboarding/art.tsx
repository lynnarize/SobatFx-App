"use client";

import { useT } from "../i18n";

// Illustrations for the first-time setup tour. Plain SVG drawn with the theme's colour utilities
// (fill-gold, stroke-up…), so they follow dark/light mode. Motion comes from the .ob-* classes in globals.css;
// an element with an animation never also carries a transform attribute (the CSS transform would replace it).

const W = 360;
const H = 240;

type OHLC = [o: number, h: number, l: number, c: number];
/** A made-up uptrend with a pullback: reads as a "normal" chart at a glance. */
const DATA: OHLC[] = [
  [30, 36, 26, 34],
  [34, 38, 31, 32],
  [32, 35, 27, 29],
  [29, 33, 24, 31],
  [31, 40, 30, 38],
  [38, 44, 36, 42],
  [42, 45, 37, 39],
  [39, 41, 34, 36],
  [36, 43, 35, 42],
  [42, 52, 41, 50],
  [50, 55, 46, 48],
  [48, 58, 47, 56],
  [56, 62, 53, 60],
  [60, 66, 57, 64],
];

const scaleY = (top: number, bottom: number, lo = 20, hi = 70) => (v: number) => bottom - ((v - lo) / (hi - lo)) * (bottom - top);
const delay = (ms: number) => ({ animationDelay: `${ms}ms` });

function Svg({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="h-full w-full" style={{ fontFamily: "var(--font-geist-sans)" }}>
      {children}
    </svg>
  );
}

function Frame({ x = 14, y = 14, w = 332, h = 212 }: { x?: number; y?: number; w?: number; h?: number }) {
  return <rect x={x} y={y} width={w} height={h} rx={14} className="fill-panel stroke-line-2" strokeWidth={1} />;
}

function Candles({ x0, step, w = 9, y, start = 0, dim = 1 }: { x0: number; step: number; w?: number; y: (v: number) => number; start?: number; dim?: number }) {
  return (
    <g opacity={dim}>
      {DATA.map(([o, h, l, c], i) => {
        const up = c >= o;
        const x = x0 + i * step;
        return (
          <g key={i} className="ob-rise" style={delay(start + i * 45)}>
            <line x1={x} x2={x} y1={y(h)} y2={y(l)} className={up ? "stroke-up" : "stroke-down"} strokeWidth={1.2} />
            <rect x={x - w / 2} y={y(Math.max(o, c))} width={w} height={Math.max(2, Math.abs(y(o) - y(c)))} rx={1.5} className={up ? "fill-up" : "fill-down"} />
          </g>
        );
      })}
    </g>
  );
}

function emaPath(period: number, x0: number, step: number, y: (v: number) => number) {
  const k = 2 / (period + 1);
  let e = DATA[0][3];
  return DATA.map(([, , , c], i) => {
    e = i ? c * k + e * (1 - k) : c;
    return `${i ? "L" : "M"}${(x0 + i * step).toFixed(1)},${y(e).toFixed(1)}`;
  }).join(" ");
}

function Sparkle({ x, y, r = 7, className = "fill-gold" }: { x: number; y: number; r?: number; className?: string }) {
  const q = r * 0.28;
  return <path d={`M${x},${y - r} L${x + q},${y - q} L${x + r},${y} L${x + q},${y + q} L${x},${y + r} L${x - q},${y + q} L${x - r},${y} L${x - q},${y - q} Z`} className={className} />;
}

function Pill({ x, y, w, children, float = 0 }: { x: number; y: number; w: number; children: React.ReactNode; float?: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className="ob-float" style={delay(float)}>
        <g className="ob-pop" style={delay(250 + float / 3)}>
          <rect width={w} height={30} rx={15} className="fill-panel-2 stroke-line-2" style={{ filter: "drop-shadow(0 6px 14px var(--shadow))" }} />
          {children}
        </g>
      </g>
    </g>
  );
}

/* ───────────── 0 · Welcome ───────────── */
export function ArtWelcome() {
  return (
    <Svg label="SobatFX">
      <defs>
        <radialGradient id="ob-glow">
          <stop offset="0" style={{ stopColor: "var(--gold)", stopOpacity: 0.35 }} />
          <stop offset="1" style={{ stopColor: "var(--gold)", stopOpacity: 0 }} />
        </radialGradient>
        <clipPath id="ob-logo">
          <rect x={142} y={78} width={76} height={76} rx={20} />
        </clipPath>
      </defs>
      <circle cx={180} cy={116} r={110} fill="url(#ob-glow)" />
      <circle cx={180} cy={116} r={72} fill="none" className="ob-spin stroke-line-2" strokeDasharray="2 7" />
      <circle cx={180} cy={116} r={104} fill="none" className="ob-spin stroke-line-2" strokeDasharray="1 9" style={{ animationDirection: "reverse" }} />
      {/* Sparkline along the bottom. */}
      <path d="M20 214 L60 204 L92 210 L130 192 L168 198 L206 178 L244 184 L284 160 L340 150" fill="none" strokeWidth={2} strokeLinecap="round" pathLength={1} className="ob-draw stroke-gold/40" style={delay(400)} />
      <g className="ob-pop" style={delay(100)}>
        <rect x={138} y={74} width={84} height={84} rx={24} className="fill-panel stroke-gold/50" strokeWidth={1.5} />
        <image href="/mark.jpg" x={142} y={78} width={76} height={76} clipPath="url(#ob-logo)" preserveAspectRatio="xMidYMid slice" />
      </g>
      <Pill x={22} y={30} w={112} float={0}>
        <rect x={6} y={6} width={18} height={18} rx={5} className="fill-gold-soft" />
        <text x={15} y={18.5} textAnchor="middle" fontSize={8} fontWeight={700} className="fill-gold">Au</text>
        <text x={30} y={14} fontSize={8.5} fontWeight={600} className="fill-ink">XAU/USD</text>
        <text x={30} y={24} fontSize={7.5} className="num fill-up">▲ 0.82%</text>
      </Pill>
      <Pill x={236} y={44} w={102} float={900}>
        <rect x={6} y={6} width={18} height={18} rx={5} className="fill-blue/15" />
        <text x={15} y={18.5} textAnchor="middle" fontSize={7} fontWeight={700} className="fill-blue">EUR</text>
        <text x={30} y={14} fontSize={8.5} fontWeight={600} className="fill-ink">EUR/USD</text>
        <text x={30} y={24} fontSize={7.5} className="num fill-down">▼ 0.14%</text>
      </Pill>
      <Pill x={18} y={152} w={104} float={1600}>
        <rect x={6} y={6} width={18} height={18} rx={5} style={{ fill: "#f7931a", opacity: 0.18 }} />
        <text x={15} y={18.5} textAnchor="middle" fontSize={9} fontWeight={700} style={{ fill: "#f7931a" }}>₿</text>
        <text x={30} y={14} fontSize={8.5} fontWeight={600} className="fill-ink">BTC/USD</text>
        <text x={30} y={24} fontSize={7.5} className="num fill-up">▲ 2.10%</text>
      </Pill>
      <Pill x={238} y={146} w={100} float={600}>
        <Sparkle x={17} y={15} r={7} />
        <text x={30} y={18.5} fontSize={9} fontWeight={600} className="fill-gold">SobatFX AI</text>
      </Pill>
    </Svg>
  );
}

/* ───────────── 1 · Live chart ───────────── */
export function ArtChart() {
  const y = scaleY(78, 206);
  const x0 = 40, step = 18;
  const last = DATA.at(-1)!;
  const lastX = x0 + 13 * step;
  return (
    <Svg label="Live chart">
      <Frame />
      <rect x={28} y={28} width={24} height={24} rx={7} className="fill-gold-soft" />
      <text x={40} y={43.5} textAnchor="middle" fontSize={9} fontWeight={700} className="fill-gold">Au</text>
      <text x={60} y={38} fontSize={11} fontWeight={600} className="fill-ink">XAU/USD</text>
      <text x={60} y={50} fontSize={8} className="num fill-up">4,218.40 ▲ 0.82%</text>
      {["15m", "1H", "4H", "1D"].map((tf, i) => (
        <g key={tf}>
          <rect x={222 + i * 29} y={30} width={26} height={18} rx={6} className={tf === "1H" ? "fill-gold-soft stroke-gold/50" : "fill-panel-2 stroke-line"} />
          <text x={235 + i * 29} y={42} textAnchor="middle" fontSize={8} fontWeight={600} className={tf === "1H" ? "fill-gold" : "fill-muted"}>{tf}</text>
        </g>
      ))}
      {[90, 120, 150, 180].map((gy) => (
        <line key={gy} x1={26} x2={306} y1={gy} y2={gy} className="stroke-line" />
      ))}
      <Candles x0={x0} step={step} y={y} start={150} />
      <path d={emaPath(20, x0, step, y)} fill="none" strokeWidth={1.6} strokeLinecap="round" pathLength={1} className="ob-draw stroke-blue" style={delay(800)} />
      <path d={emaPath(50, x0, step, y)} fill="none" strokeWidth={1.6} strokeLinecap="round" pathLength={1} className="ob-draw stroke-gold" style={delay(1000)} />
      <line x1={26} x2={306} y1={y(last[3])} y2={y(last[3])} strokeDasharray="3 3" className="ob-fade stroke-up/70" style={delay(1200)} />
      <g className="ob-fade" style={delay(1200)}>
        <rect x={306} y={y(last[3]) - 8} width={36} height={16} rx={4} className="fill-up" />
        <text x={324} y={y(last[3]) + 3} textAnchor="middle" fontSize={7.5} fontWeight={700} className="num fill-white">4218.4</text>
      </g>
      <circle cx={lastX} cy={y(last[3])} r={3.5} className="ob-pulse fill-up" style={delay(1300)} />
      <circle cx={lastX} cy={y(last[3])} r={3} className="fill-up" />
    </Svg>
  );
}

/* ───────────── 2 · Drawing tools ───────────── */
export function ArtDraw() {
  const { t } = useT();
  const y = scaleY(60, 205, 20, 76);
  const x0 = 70, step = 16.5;
  const xi = (i: number) => x0 + i * step;
  // Trend line through two swing lows, extended to the right.
  const p1 = { x: xi(3), y: y(24) }, p2 = { x: xi(7), y: y(34) };
  const k = (p2.y - p1.y) / (p2.x - p1.x);
  const endX = xi(13) + 8;
  const entry = y(60), tp = y(72), sl = y(54);
  const tools = 6;
  return (
    <Svg label="Drawing tools">
      <Frame />
      <rect x={24} y={30} width={28} height={tools * 28 + 8} rx={9} className="fill-panel-2 stroke-line" />
      {Array.from({ length: tools }, (_, i) => {
        const cy = 48 + i * 28;
        const active = i === 4;
        return (
          <g key={i}>
            {active && <rect x={28} y={cy - 11} width={20} height={22} rx={6} className="ob-pop fill-gold-soft stroke-gold/60" style={delay(300)} />}
            {i === 0 && <line x1={32} y1={cy + 6} x2={44} y2={cy - 6} strokeWidth={1.6} strokeLinecap="round" className="stroke-ink-2" />}
            {i === 1 && <line x1={31} y1={cy} x2={45} y2={cy} strokeWidth={1.6} strokeLinecap="round" className="stroke-ink-2" />}
            {i === 2 && <rect x={32} y={cy - 5} width={12} height={10} rx={2} fill="none" strokeWidth={1.4} className="stroke-ink-2" />}
            {i === 3 && [-5, 0, 5].map((d) => <line key={d} x1={31} y1={cy + d} x2={45} y2={cy + d} strokeWidth={1.2} className="stroke-ink-2" />)}
            {i === 4 && (
              <>
                <rect x={32} y={cy - 7} width={12} height={7} rx={1.5} className="fill-up" />
                <rect x={32} y={cy} width={12} height={5} rx={1.5} className="fill-down" />
              </>
            )}
            {i === 5 && <text x={38} y={cy + 4} textAnchor="middle" fontSize={11} fontWeight={700} className="fill-ink-2">T</text>}
          </g>
        );
      })}
      <Candles x0={x0} step={step} w={8} y={y} start={0} dim={0.9} />
      <path d={`M${p1.x},${p1.y} L${endX},${p1.y + k * (endX - p1.x)}`} fill="none" strokeWidth={1.8} strokeLinecap="round" pathLength={1} className="ob-draw stroke-gold" style={delay(650)} />
      <circle cx={p1.x} cy={p1.y} r={3.5} strokeWidth={1.5} className="ob-pop fill-panel stroke-gold" style={delay(600)} />
      <circle cx={p2.x} cy={p2.y} r={3.5} strokeWidth={1.5} className="ob-pop fill-panel stroke-gold" style={delay(1300)} />
      {/* Long position: TP zone above the entry, SL zone below. */}
      <g className="ob-fade" style={delay(1500)}>
        <rect x={256} y={tp} width={80} height={entry - tp} className="fill-up/15 stroke-up/50" />
        <rect x={256} y={entry} width={80} height={sl - entry} className="fill-down/15 stroke-down/50" />
        <line x1={256} x2={336} y1={entry} y2={entry} strokeWidth={1.4} className="stroke-ink-2" />
        <text x={262} y={tp + 12} fontSize={7.5} fontWeight={600} className="num fill-up">TP +40 {t("calc.pips")}</text>
        <text x={262} y={sl - 4} fontSize={7.5} fontWeight={600} className="num fill-down">SL −20</text>
      </g>
      <g className="ob-pop" style={delay(1900)}>
        <rect x={226} y={24} width={110} height={34} rx={9} className="fill-panel-2 stroke-line-2" style={{ filter: "drop-shadow(0 6px 14px var(--shadow))" }} />
        <text x={236} y={38} fontSize={8.5} fontWeight={600} className="fill-ink">{t("pos.long")} · 0.05 lot</text>
        <text x={236} y={50} fontSize={7.5} className="num fill-muted">R:R 1:2 · 1% {t("pos.risk")}</text>
      </g>
      <g transform={`translate(${336} ${tp})`}>
        <g className="ob-cursor" style={delay(900)}>
          <path d="M0 0 L0 13 L3.5 9.5 L6 15 L8 14 L5.5 8.5 L10 8.5 Z" className="fill-ink stroke-panel" strokeWidth={1} strokeLinejoin="round" />
        </g>
      </g>
    </Svg>
  );
}

/* ───────────── 3 · SobatFX AI ───────────── */
export function ArtAI() {
  const { t } = useT();
  const y = scaleY(64, 204);
  return (
    <Svg label="SobatFX AI">
      <Frame />
      <Candles x0={30} step={10} w={6} y={y} dim={0.4} />
      {[
        { v: 58, ms: 1900, label: "R", cls: "stroke-down", txt: "fill-down" },
        { v: 33, ms: 2100, label: "S", cls: "stroke-up", txt: "fill-up" },
      ].map((l) => (
        <g key={l.label} className="ob-fade" style={delay(l.ms)}>
          <line x1={22} x2={172} y1={y(l.v)} y2={y(l.v)} strokeWidth={1.4} strokeDasharray="4 3" className={l.cls} />
          <rect x={22} y={y(l.v) - 15} width={14} height={12} rx={3} className="fill-panel-2" />
          <text x={29} y={y(l.v) - 6} textAnchor="middle" fontSize={8} fontWeight={700} className={l.txt}>{l.label}</text>
        </g>
      ))}
      <rect x={180} y={22} width={158} height={196} rx={12} className="fill-panel-2 stroke-line" />
      <Sparkle x={196} y={38} r={6} />
      <text x={208} y={41.5} fontSize={9.5} fontWeight={600} className="fill-ink">SobatFX AI</text>
      <line x1={180} x2={338} y1={52} y2={52} className="stroke-line" />
      <g className="ob-fade" style={delay(200)}>
        <rect x={222} y={62} width={108} height={24} rx={10} className="fill-panel-3" />
        <text x={229} y={77} fontSize={8} className="fill-ink">{t("q.analyze")}</text>
      </g>
      <g className="ob-pop" style={delay(600)}>
        <circle cx={196} cy={102} r={8} className="fill-gold-soft" />
        <Sparkle x={196} y={102} r={4.5} />
      </g>
      {[118, 100, 110, 72].map((w, i) => (
        <rect key={i} x={210} y={97 + i * 11} width={w} height={6} rx={3} className="ob-fade fill-ink-2/25" style={delay(800 + i * 200)} />
      ))}
      <g className="ob-pop" style={delay(1700)}>
        <rect x={208} y={146} width={124} height={20} rx={7} className="fill-gold-soft stroke-gold/40" />
        <path d="M216 160 L219 152 L225 158 Z M218 154 L224 148 L226 150 L220 156" className="fill-gold" />
        <text x={230} y={159} fontSize={6.8} className="fill-gold">{t("ai.drew", { n: 2 })}</text>
      </g>
      <rect x={188} y={182} width={142} height={26} rx={9} className="fill-panel stroke-line-2" />
      <rect x={196} y={192} width={58} height={6} rx={3} className="fill-ink-2/15" />
      <circle cx={318} cy={195} r={9} className="fill-gold" />
      <path d="M318 199.5 L318 191 M314 194.5 L318 190.5 L322 194.5" fill="none" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="stroke-on-gold" />
    </Svg>
  );
}

/* ───────────── 4 · Demo trading ───────────── */
export function ArtTrade() {
  const { t } = useT();
  const y = scaleY(50, 205, 20, 76);
  const entry = y(60), tp = y(70), sl = y(53);
  return (
    <Svg label="Demo trading">
      <Frame />
      <Candles x0={30} step={12} w={7} y={y} dim={0.75} />
      <line x1={22} x2={206} y1={entry} y2={entry} strokeWidth={1.4} className="stroke-blue" />
      <rect x={22} y={entry - 7} width={50} height={14} rx={4} className="fill-blue" />
      <text x={47} y={entry + 3} textAnchor="middle" fontSize={7} fontWeight={700} className="fill-white">{t("trade.buy")} 0.05</text>
      <line x1={22} x2={206} y1={sl} y2={sl} strokeWidth={1.3} strokeDasharray="4 3" className="stroke-down" />
      <rect x={180} y={sl - 7} width={24} height={14} rx={4} className="fill-down" />
      <text x={192} y={sl + 3} textAnchor="middle" fontSize={7} fontWeight={700} className="fill-white">SL</text>
      {/* TP line being dragged up into place. */}
      <g className="ob-drag" style={delay(700)}>
        <line x1={22} x2={206} y1={tp} y2={tp} strokeWidth={1.3} strokeDasharray="4 3" className="stroke-up" />
        <rect x={180} y={tp - 7} width={24} height={14} rx={4} className="fill-up" />
        <text x={192} y={tp + 3} textAnchor="middle" fontSize={7} fontWeight={700} className="fill-white">TP</text>
        <g transform={`translate(${160} ${tp - 2})`}>
          <path d="M0 0 L0 13 L3.5 9.5 L6 15 L8 14 L5.5 8.5 L10 8.5 Z" className="fill-ink stroke-panel" strokeWidth={1} strokeLinejoin="round" />
        </g>
      </g>
      <g transform="translate(96 22)">
        <g className="ob-float" style={delay(400)}>
          <g className="ob-pop" style={delay(1400)}>
            <rect width={70} height={22} rx={11} className="fill-up/15 stroke-up/50" />
            <text x={35} y={14.5} textAnchor="middle" fontSize={9} fontWeight={700} className="num fill-up">+$42.10</text>
          </g>
        </g>
      </g>
      <rect x={216} y={22} width={122} height={196} rx={12} className="fill-panel-2 stroke-line" />
      <text x={228} y={41} fontSize={9.5} fontWeight={600} className="fill-ink">{t("trade.ticket")}</text>
      <text x={228} y={52} fontSize={7} className="fill-muted">{t("trade.virtual")}</text>
      <rect x={228} y={60} width={48} height={28} rx={8} className="fill-down/15 stroke-down/50" />
      <text x={252} y={77.5} textAnchor="middle" fontSize={8.5} fontWeight={700} className="fill-down">{t("trade.sell")}</text>
      <rect x={280} y={60} width={48} height={28} rx={8} className="ob-pop fill-up" style={delay(300)} />
      <text x={304} y={77.5} textAnchor="middle" fontSize={8.5} fontWeight={700} className="fill-white">{t("trade.buy")}</text>
      {[
        ["Lot", "0.05"],
        ["SL", "4,198.0"],
        ["TP", "4,238.0"],
      ].map(([k, v], i) => (
        <g key={k} className="ob-fade" style={delay(400 + i * 150)}>
          <rect x={228} y={98 + i * 26} width={100} height={20} rx={6} className="fill-panel stroke-line-2" />
          <text x={236} y={111 + i * 26} fontSize={7.5} className="fill-muted">{k}</text>
          <text x={320} y={111 + i * 26} textAnchor="end" fontSize={8} fontWeight={600} className="num fill-ink">{v}</text>
        </g>
      ))}
      <rect x={228} y={182} width={100} height={24} rx={8} className="ob-pop fill-up" style={delay(1000)} />
      <text x={278} y={197.5} textAnchor="middle" fontSize={8.5} fontWeight={700} className="fill-white">{t("trade.buy")} 0.05 lot</text>
    </Svg>
  );
}

/* ───────────── 5 · News & calendar ───────────── */
export function ArtNews() {
  const { t } = useT();
  const rows = [
    { time: "13:30", cur: "USD", impact: 3, title: "Non-Farm Payrolls", a: "256K", f: "160K", tone: "fill-up" },
    { time: "10:00", cur: "EUR", impact: 3, title: "CPI y/y", a: "2.1%", f: "2.4%", tone: "fill-down" },
    { time: "19:00", cur: "USD", impact: 2, title: "FOMC Minutes", a: null, f: null, tone: "" },
    { time: "07:00", cur: "GBP", impact: 1, title: "GDP m/m", a: "0.2%", f: "0.2%", tone: "fill-ink-2" },
  ];
  return (
    <Svg label={t("nav.news")}>
      <Frame />
      <rect x={28} y={26} width={22} height={22} rx={6} className="fill-gold-soft" />
      <rect x={33} y={32} width={12} height={11} rx={2} fill="none" strokeWidth={1.4} className="stroke-gold" />
      <line x1={33} x2={45} y1={35.5} y2={35.5} strokeWidth={1.4} className="stroke-gold" />
      <text x={58} y={41} fontSize={10.5} fontWeight={600} className="fill-ink">{t("nav.news")}</text>
      {/* Bell with a fresh-alert dot. */}
      <g transform="translate(316 28)">
        <g className="ob-ring">
          <path d="M0 14 L16 14 L14 11 L14 7 A6 6 0 0 0 2 7 L2 11 Z M6 16 A2 2 0 0 0 10 16" className="fill-ink-2" />
        </g>
      </g>
      <circle cx={331} cy={29} r={3.2} className="ob-pop fill-down" style={delay(1200)} />
      {rows.map((r, i) => {
        const ry = 60 + i * 38;
        return (
          <g key={r.title} className="ob-fade" style={delay(150 + i * 150)}>
            <rect x={24} y={ry} width={312} height={32} rx={9} className={i === 2 ? "fill-gold-soft stroke-gold/40" : "fill-panel-2 stroke-line"} />
            <text x={34} y={ry + 19.5} fontSize={8} className="num fill-muted">{r.time}</text>
            <text x={68} y={ry + 19.5} fontSize={8.5} fontWeight={700} className="fill-ink">{r.cur}</text>
            {[0, 1, 2].map((b) => (
              <rect
                key={b}
                x={96 + b * 5}
                y={ry + 20 - (b + 1) * 3.5}
                width={3.2}
                height={(b + 1) * 3.5}
                rx={1}
                className={b < r.impact ? (r.impact === 3 ? "fill-down" : r.impact === 2 ? "fill-gold" : "fill-muted") : "fill-line-2"}
              />
            ))}
            <text x={120} y={ry + 19.5} fontSize={8.5} className="fill-ink">{r.title}</text>
            {r.a ? (
              <g className="ob-pop" style={delay(900 + i * 220)}>
                <text x={282} y={ry + 19.5} textAnchor="end" fontSize={8.5} fontWeight={700} className={`num ${r.tone}`}>{r.a}</text>
                <text x={326} y={ry + 19.5} textAnchor="end" fontSize={7.5} className="num fill-muted">{r.f}</text>
              </g>
            ) : (
              <g>
                <rect x={276} y={ry + 9} width={50} height={14} rx={7} className="fill-gold" />
                <text x={301} y={ry + 19} textAnchor="middle" fontSize={7.5} fontWeight={700} className="num fill-on-gold">⏱ 2h</text>
              </g>
            )}
          </g>
        );
      })}
    </Svg>
  );
}

/* ───────────── 6 · Risk calculator ───────────── */
export function ArtCalc() {
  const { t } = useT();
  return (
    <Svg label="Risk calculator">
      <Frame />
      <rect x={26} y={26} width={156} height={188} rx={12} className="fill-panel-2 stroke-line" />
      <text x={38} y={46} fontSize={7.5} className="fill-muted">{t("trade.balance")}</text>
      <text x={38} y={64} fontSize={15} fontWeight={600} className="num fill-ink">$1,000</text>
      <text x={38} y={92} fontSize={7.5} className="fill-muted">1% {t("pos.risk")}</text>
      <text x={170} y={92} textAnchor="end" fontSize={8} fontWeight={600} className="num fill-down">$10.00</text>
      <rect x={38} y={102} width={132} height={6} rx={3} className="fill-panel-3" />
      <rect x={38} y={102} width={34} height={6} rx={3} className="ob-grow fill-gold" style={delay(300)} />
      <g className="ob-slide" style={delay(300)}>
        <circle cx={72} cy={105} r={7} strokeWidth={3} className="fill-gold stroke-panel-2" />
      </g>
      <text x={38} y={136} fontSize={7.5} className="fill-muted">Stop loss</text>
      <rect x={38} y={142} width={132} height={24} rx={7} className="fill-panel stroke-line-2" />
      <text x={46} y={157.5} fontSize={9} fontWeight={600} className="num fill-ink">20</text>
      <text x={162} y={157.5} textAnchor="end" fontSize={7.5} className="fill-muted">{t("calc.pips")}</text>
      <text x={38} y={190} fontSize={7.5} className="fill-muted">EUR/USD · 1H</text>
      {/* → */}
      <path d="M192 120 L208 120 M203 115 L208 120 L203 125" fill="none" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="ob-fade stroke-gold" style={delay(700)} />
      {/* Gauge: how much of the balance is at risk. */}
      <circle cx={274} cy={110} r={50} fill="none" strokeWidth={10} className="stroke-panel-3" />
      <circle
        cx={274}
        cy={110}
        r={50}
        fill="none"
        strokeWidth={10}
        strokeLinecap="round"
        pathLength={100}
        strokeDasharray="28 100"
        transform="rotate(-90 274 110)"
        className="ob-gauge stroke-gold"
        style={delay(400)}
      />
      <g className="ob-pop" style={delay(900)}>
        <text x={274} y={114} textAnchor="middle" fontSize={24} fontWeight={600} className="num fill-ink">0.05</text>
        <text x={274} y={130} textAnchor="middle" fontSize={8.5} className="fill-muted">lot</text>
      </g>
      <g className="ob-fade" style={delay(1200)}>
        <rect x={222} y={174} width={104} height={24} rx={12} className="fill-up/15 stroke-up/40" />
        <text x={274} y={189.5} textAnchor="middle" fontSize={8} fontWeight={600} className="fill-up">✓ R:R 1:2</text>
      </g>
    </Svg>
  );
}

/* ───────────── 7 · Done ───────────── */
export function ArtDone() {
  const bits = [
    { x: 92, y: 60, c: "fill-gold", r: 0 },
    { x: 262, y: 54, c: "fill-up", r: 30 },
    { x: 70, y: 150, c: "fill-blue", r: 60 },
    { x: 292, y: 150, c: "fill-gold", r: 15 },
    { x: 124, y: 34, c: "fill-down", r: 45 },
    { x: 236, y: 196, c: "fill-blue", r: 70 },
    { x: 118, y: 196, c: "fill-up", r: 20 },
    { x: 312, y: 96, c: "fill-down", r: 50 },
    { x: 48, y: 98, c: "fill-up", r: 10 },
    { x: 222, y: 26, c: "fill-gold", r: 35 },
  ];
  return (
    <Svg label="Done">
      <defs>
        <radialGradient id="ob-glow-done">
          <stop offset="0" style={{ stopColor: "var(--gold)", stopOpacity: 0.3 }} />
          <stop offset="1" style={{ stopColor: "var(--gold)", stopOpacity: 0 }} />
        </radialGradient>
      </defs>
      <circle cx={180} cy={116} r={100} fill="url(#ob-glow-done)" />
      <circle cx={180} cy={116} r={46} className="ob-pulse-soft fill-gold/20" style={delay(900)} />
      <circle cx={180} cy={116} r={46} strokeWidth={2} className="ob-pop fill-panel stroke-gold" />
      <path d="M160 117 L174 131 L201 102" fill="none" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" pathLength={1} className="ob-draw stroke-gold" style={delay(350)} />
      {bits.map((b, i) => (
        <g key={i} transform={`translate(${b.x} ${b.y}) rotate(${b.r})`}>
          <g className="ob-float" style={delay(i * 260)}>
            <rect x={-4} y={-2} width={i % 3 ? 8 : 5} height={i % 3 ? 4 : 5} rx={1.2} className={`ob-pop ${b.c}`} style={delay(500 + i * 70)} />
          </g>
        </g>
      ))}
      <Sparkle x={250} y={88} r={8} className="ob-pop fill-gold" />
      <Sparkle x={112} y={128} r={6} className="ob-pop fill-gold/70" />
      <Sparkle x={214} y={168} r={5} className="ob-pop fill-up" />
    </Svg>
  );
}
