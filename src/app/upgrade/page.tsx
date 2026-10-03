"use client";

import { Check, CheckCircle2, Copy, Crown, Landmark, Loader2, LogIn, QrCode, Send, Ticket, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/components/i18n";
import { useStartSignIn } from "@/components/SignInConsent";
import { useWs } from "@/components/workspace";
import { type PaidTier, TIER_INFO, TIER_ORDER, type Tier } from "@/lib/tiers";

interface Plans {
  paymentsEnabled: boolean;
  transferEnabled?: boolean;
  qrisSoon?: boolean;
  saleTiers?: PaidTier[];
  vouchers?: Partial<Record<PaidTier, boolean>>;
  plans: Record<Tier, { priceIdr: number; listPriceUsd?: number; listPriceIdr?: number; days?: number; limit: number; period: "daily" | "lifetime" }>;
}
interface Pay {
  orderId: string;
  amount: number;
  tier: PaidTier;
  days: number;
  expiresAt: number;
  qr: string;
  status: "pending" | "paid" | "expired" | "failed";
}

interface TransferPay {
  orderId: string;
  amount: number;
  tier: PaidTier;
  days: number;
  expiresAt: number;
  status: "pending" | "paid" | "expired" | "failed";
  claimed: boolean;
  bank: { name: string; number: string; holder: string };
  email: string;
  proofContact: string;
  proofUrl: string;
}

const idr = (n: number) => "Rp " + n.toLocaleString("id-ID");

export default function UpgradePage() {
  const { me, refreshMe } = useWs();
  const { t, locale, lang } = useT();
  const startSignIn = useStartSignIn();
  const [plans, setPlans] = useState<Plans | null>(null);
  const [pay, setPay] = useState<Pay | null>(null);
  const [transfer, setTransfer] = useState<TransferPay | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // Applied vouchers per plan: the code is sent with the order, the server re-checks it and sets the price.
  const [vouchers, setVouchers] = useState<Partial<Record<PaidTier, { code: string; priceIdr: number }>>>({});

  useEffect(() => {
    fetch("/api/plans").then((r) => r.json()).then(setPlans).catch(() => {});
  }, []);

  const buy = async (tier: PaidTier) => {
    if (!me?.signedIn) return startSignIn();
    setErr(null);
    setLoading(tier);
    try {
      const r = await fetch("/api/payments/qris", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tier, voucher: vouchers[tier]?.code }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setPay({ ...j, status: "pending" });
    } catch (e) {
      setErr((e as Error).message || t("up.couldNotStart"));
    } finally {
      setLoading(null);
    }
  };

  const buyTransfer = async (tier: PaidTier) => {
    if (!me?.signedIn) return startSignIn();
    setErr(null);
    setLoading(`${tier}-transfer`);
    try {
      const r = await fetch("/api/payments/transfer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tier, voucher: vouchers[tier]?.code }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setTransfer(j);
    } catch (e) {
      setErr((e as Error).message || t("up.couldNotStart"));
    } finally {
      setLoading(null);
    }
  };

  const current = me?.tier ?? "free";
  const noPayment = plans !== null && !plans.paymentsEnabled && !plans.transferEnabled && !plans.qrisSoon;
  const features = {
    free: ["tier.free.f1", "tier.free.f2", "tier.free.f3", "tier.free.f4", "tier.free.trading"],
    pro: ["tier.pro.smarter", "tier.pro.review", "tier.pro.journal", "tier.pro.upload", "tier.pro.f1", "tier.pro.f2", "tier.pro.f3", "tier.pro.f4"],
    ultimate: ["tier.ultimate.f1", "tier.ultimate.f2", "tier.ultimate.f3", "tier.ultimate.f4"],
  } as const;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-6 @2xl:px-8">
      <h1 className="text-2xl font-medium">{t("up.title")}</h1>
      <p className="mt-1 text-sm text-muted">{t("up.sub")}</p>

      {me?.signedIn && me.tier !== "free" && me.tierUntil && (
        <div className="mt-4 inline-flex items-center gap-2 rounded-xl border border-gold-deep/40 bg-gold-soft px-3 py-2 text-sm text-gold">
          <Crown size={15} /> {t("up.activeUntil", { tier: TIER_INFO[me.tier!].label, date: new Date(me.tierUntil).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" }) })}
        </div>
      )}
      {err && <p className="mt-4 text-sm text-down">{err}</p>}

      <div className="stagger mt-6 grid gap-5 @3xl:grid-cols-3">
        {TIER_ORDER.map((tier) => {
          const info = TIER_INFO[tier];
          const p = plans?.plans[tier];
          const featured = tier === "pro";
          const forSale = !plans?.saleTiers || plans.saleTiers.includes(tier as PaidTier);
          const applied = tier === "free" ? undefined : vouchers[tier];
          return (
            <div key={tier} className={`card relative flex flex-col p-6 ${featured ? "border-gold-deep/60" : ""} ${tier === "ultimate" ? "bg-gradient-to-b from-gold-soft to-panel-2" : ""}`}>
              {featured && <span className="absolute -top-2.5 left-6 rounded-full bg-gold px-2.5 py-0.5 text-[11px] font-semibold text-on-gold">{t("up.popular")}</span>}
              {p?.listPriceUsd ? <span className="absolute -top-2.5 right-6 rounded-full bg-down px-2.5 py-0.5 text-[11px] font-semibold text-white">{t("up.discount")}</span> : null}
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">{info.label}</h2>
                {tier === current && me?.signedIn && <span className="rounded bg-panel-3 px-2 py-0.5 text-[10px] text-ink-2">{t("up.current")}</span>}
              </div>
              <p className="text-sm text-muted">{t(`tier.${tier}.tagline`)}</p>
              <div className="mt-4 flex flex-wrap items-baseline gap-x-1">
                {applied && p ? (
                  <span className="num mr-1 whitespace-nowrap text-lg text-muted line-through decoration-down/70" aria-label={t("up.normalPrice", { price: idr(p.priceIdr) })}>
                    {idr(p.priceIdr)}
                  </span>
                ) : p?.listPriceUsd
                  ? (() => {
                      // Indonesian UI shows the normal price in rupiah (live USD→IDR rate); English keeps dollars.
                      const normal = lang === "id" && p.listPriceIdr ? idr(p.listPriceIdr) : `$${p.listPriceUsd}`;
                      return (
                        <span className="num mr-1 whitespace-nowrap text-lg text-muted line-through decoration-down/70" aria-label={t("up.normalPrice", { price: normal })}>
                          {normal}
                        </span>
                      );
                    })()
                  : null}
                <span className="num whitespace-nowrap text-3xl font-medium">{p ? (applied ? idr(applied.priceIdr) : p.priceIdr ? idr(p.priceIdr) : "Rp 0") : "…"}</span>
                {p?.priceIdr ? <span className="text-sm text-muted">{t("up.perDays", { n: p.days ?? 30 })}</span> : null}
              </div>
              <p className="mt-1 text-xs text-gold">{p ? t(p.period === "daily" ? "up.requestsDaily" : "up.requests", { n: p.limit }) : ""}</p>
              <ul className="mt-5 flex-1 space-y-2 text-sm text-ink-2">
                {features[tier].map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check size={16} className="mt-0.5 shrink-0 text-gold" /> {t(f)}
                  </li>
                ))}
              </ul>
              <div className="mt-6">
                {tier === "free" ? (
                  me?.signedIn ? (
                    <div className="btn w-full justify-center opacity-60">{t("up.included")}</div>
                  ) : (
                    <button className="btn w-full justify-center" onClick={startSignIn}>
                      <LogIn size={15} /> {t("app.signIn")}
                    </button>
                  )
                ) : !forSale || noPayment ? (
                  <button className={`btn w-full justify-center ${featured || tier === "ultimate" ? "btn-gold" : ""}`} disabled>
                    <QrCode size={15} /> {t("up.comingSoon")}
                  </button>
                ) : (
                  <div className="space-y-2">
                    {plans?.vouchers?.[tier] && (
                      <VoucherField
                        tier={tier}
                        applied={applied}
                        onApply={(v) => setVouchers((all) => ({ ...all, [tier]: v ?? undefined }))}
                      />
                    )}
                    {(plans === null || plans.paymentsEnabled) && (
                      <button className={`btn w-full justify-center ${featured || tier === "ultimate" ? "btn-gold" : ""}`} onClick={() => buy(tier)} disabled={loading !== null}>
                        {loading === tier ? <Loader2 size={15} className="animate-spin" /> : <QrCode size={15} />}
                        {!me?.signedIn ? t("up.signInToBuy") : current === tier ? t("up.extend", { tier: info.label }) : t("up.payQris")}
                      </button>
                    )}
                    {plans?.transferEnabled && (
                      <button className={`btn w-full justify-center ${plans.paymentsEnabled ? "" : featured || tier === "ultimate" ? "btn-gold" : ""}`} onClick={() => buyTransfer(tier)} disabled={loading !== null}>
                        {loading === `${tier}-transfer` ? <Loader2 size={15} className="animate-spin" /> : <Landmark size={15} />}
                        {!me?.signedIn ? t("up.signInToBuy") : current === tier ? t("up.extend", { tier: info.label }) : t("up.payTransfer")}
                      </button>
                    )}
                    {plans?.qrisSoon && (
                      <button className="btn w-full justify-center" disabled>
                        <QrCode size={15} /> {t("up.qrisSoon")}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-xs text-muted">{t("up.footnote")}</p>

      {pay && (
        <QrisModal
          pay={pay}
          onStatus={(status) => {
            setPay((p) => (p ? { ...p, status } : p));
            if (status === "paid") refreshMe();
          }}
          onClose={() => setPay(null)}
        />
      )}
      {transfer && (
        <TransferModal
          pay={transfer}
          onChange={(patch) => {
            setTransfer((p) => (p ? { ...p, ...patch } : p));
            if (patch.status === "paid") refreshMe();
          }}
          onClose={() => setTransfer(null)}
        />
      )}
    </div>
  );
}

function VoucherField({ tier, applied, onApply }: { tier: PaidTier; applied?: { code: string; priceIdr: number }; onApply(v: { code: string; priceIdr: number } | null): void }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (applied)
    return (
      <div className="flex items-center justify-between gap-2 rounded-xl border border-gold-deep/40 bg-gold-soft px-3 py-2 text-sm text-gold">
        <span className="flex min-w-0 items-center gap-1.5 truncate">
          <Ticket size={14} className="shrink-0" /> {t("up.voucherApplied", { code: applied.code })}
        </span>
        <button className="shrink-0 text-xs underline" onClick={() => onApply(null)}>{t("up.removeVoucher")}</button>
      </div>
    );
  if (!open)
    return (
      <button className="flex items-center gap-1.5 text-xs text-muted hover:text-ink-2" onClick={() => setOpen(true)}>
        <Ticket size={13} /> {t("up.haveVoucher")}
      </button>
    );

  const apply = async (e: React.FormEvent) => {
    e.preventDefault();
    const c = code.trim();
    if (!c) return;
    setErr(null);
    setBusy(true);
    try {
      const r = await fetch("/api/payments/voucher", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tier, code: c }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      onApply({ code: c, priceIdr: j.priceIdr });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={apply}>
      <div className="flex gap-2">
        <input
          className="field min-w-0 flex-1"
          placeholder={t("up.voucher")}
          aria-label={t("up.voucher")}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          autoFocus
        />
        <button className="btn shrink-0" type="submit" disabled={busy || !code.trim()}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : t("up.applyVoucher")}
        </button>
      </div>
      {err && <p className="mt-1 text-xs text-down">{err}</p>}
    </form>
  );
}

function PaidView({ tier, days, onClose }: { tier: PaidTier; days: number; onClose(): void }) {
  const { t } = useT();
  return (
    <div className="py-6">
      <CheckCircle2 size={48} className="mx-auto text-up" />
      <h2 className="mt-3 text-lg font-semibold">{t("qris.received")}</h2>
      <p className="mt-1 text-sm text-muted">{t("qris.activeFor", { tier: TIER_INFO[tier].label, n: days })}</p>
      <button className="btn btn-gold mt-5" onClick={onClose}>{t("qris.start")}</button>
    </div>
  );
}

function QrisModal({ pay, onStatus, onClose }: { pay: Pay; onStatus(s: Pay["status"]): void; onClose(): void }) {
  const { t } = useT();
  const [now, setNow] = useState(() => Date.now());
  const left = Math.max(0, pay.expiresAt - now);
  // Parent passes a fresh callback every render; keep the polling interval stable.
  const statusCb = useRef(onStatus);
  useEffect(() => {
    statusCb.current = onStatus;
  });

  useEffect(() => {
    if (pay.status !== "pending") return;
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    const poll = window.setInterval(async () => {
      const r = await fetch(`/api/payments/status?orderId=${pay.orderId}`).then((x) => x.json()).catch(() => null);
      if (r?.status && r.status !== "pending") statusCb.current(r.status);
    }, 3000);
    return () => {
      window.clearInterval(tick);
      window.clearInterval(poll);
    };
  }, [pay.orderId, pay.status]);

  useEffect(() => {
    if (left === 0 && pay.status === "pending") statusCb.current("expired");
  }, [left, pay.status]);

  return (
    <div className="backdrop-fade fixed inset-0 z-[60] grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label={t("up.dialog")}>
      <div className="card pop relative w-full max-w-sm p-6 text-center">
        <button className="icon-btn absolute right-3 top-3 h-8 w-8" aria-label={t("app.close")} onClick={onClose}>
          <X size={14} />
        </button>
        {pay.status === "paid" ? (
          <PaidView tier={pay.tier} days={pay.days} onClose={onClose} />
        ) : pay.status === "pending" ? (
          <>
            <h2 className="text-lg font-semibold">{t("qris.scan")}</h2>
            <p className="text-sm text-muted">{t("qris.item", { tier: TIER_INFO[pay.tier].label, n: pay.days })}</p>
            <div className="num mt-2 text-2xl font-medium text-gold">{idr(pay.amount)}</div>
            <div className="mx-auto mt-4 w-fit rounded-xl bg-white p-3">
              <Image src={pay.qr} alt={t("qris.alt")} width={240} height={240} unoptimized />
            </div>
            <p className="mt-3 text-xs text-muted">{t("qris.howTo")}</p>
            <div className="mt-3 flex items-center justify-center gap-2 text-xs text-ink-2">
              <Loader2 size={13} className="animate-spin text-gold" /> {t("qris.waiting", { time: `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, "0")}` })}
            </div>
            <p className="mt-3 text-[10px] text-muted">{t("qris.order", { id: pay.orderId })}</p>
          </>
        ) : (
          <div className="py-6">
            <h2 className="text-lg font-semibold">{t(pay.status === "expired" ? "qris.expired" : "qris.failed")}</h2>
            <p className="mt-1 text-sm text-muted">{t("qris.noMoney")}</p>
            <button className="btn mt-5" onClick={onClose}>{t("app.close")}</button>
          </div>
        )}
      </div>
    </div>
  );
}

const clock = (ms: number) => {
  const sec = Math.floor(ms / 1000);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${Math.floor(sec / 3600)}:${two(Math.floor((sec % 3600) / 60))}:${two(sec % 60)}`;
};

function CopyRow({ label, value, copy }: { label: string; value: string; copy: string }) {
  const { t } = useT();
  const [done, setDone] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(copy);
      setDone(true);
      window.setTimeout(() => setDone(false), 1500);
    } catch {
      // clipboard blocked: the number is on screen to copy by hand
    }
  };
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-panel-2 px-3 py-2 text-left">
      <div className="min-w-0">
        <div className="text-[11px] text-muted">{label}</div>
        <div className="num truncate text-base font-medium">{value}</div>
      </div>
      <button className="btn h-8 shrink-0 px-2.5 text-xs" onClick={onCopy} aria-label={`${t("xfer.copy")} ${label}`}>
        {done ? <Check size={13} /> : <Copy size={13} />} {done ? t("xfer.copied") : t("xfer.copy")}
      </button>
    </div>
  );
}

function TransferModal({ pay, onChange, onClose }: { pay: TransferPay; onChange(p: Partial<TransferPay>): void; onClose(): void }) {
  const { t } = useT();
  const [now, setNow] = useState(() => Date.now());
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const left = Math.max(0, pay.expiresAt - now);
  const changeCb = useRef(onChange);
  useEffect(() => {
    changeCb.current = onChange;
  });

  useEffect(() => {
    if (pay.status !== "pending") return;
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    const poll = window.setInterval(async () => {
      const r = await fetch(`/api/payments/status?orderId=${pay.orderId}`).then((x) => x.json()).catch(() => null);
      if (r?.status && r.status !== "pending") changeCb.current({ status: r.status });
    }, 5000);
    return () => {
      window.clearInterval(tick);
      window.clearInterval(poll);
    };
  }, [pay.orderId, pay.status]);

  useEffect(() => {
    if (left === 0 && pay.status === "pending") changeCb.current({ status: "expired" });
  }, [left, pay.status]);

  const claim = async (quiet = false) => {
    if (pay.claimed) return;
    setErr(null);
    setSending(true);
    try {
      const r = await fetch("/api/payments/transfer/claim", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: pay.orderId }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      onChange({ claimed: true });
    } catch (e) {
      if (!quiet) setErr((e as Error).message || t("up.couldNotStart"));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="backdrop-fade fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-black/70 p-4" role="dialog" aria-modal="true" aria-label={t("xfer.title")}>
      <div className="card pop relative w-full max-w-sm p-6 text-center">
        <button className="icon-btn absolute right-3 top-3 h-8 w-8" aria-label={t("app.close")} onClick={onClose}>
          <X size={14} />
        </button>
        {pay.status === "paid" ? (
          <PaidView tier={pay.tier} days={pay.days} onClose={onClose} />
        ) : pay.status === "pending" ? (
          <>
            <h2 className="text-lg font-semibold">{t("xfer.title")}</h2>
            <p className="text-sm text-muted">{t("qris.item", { tier: TIER_INFO[pay.tier].label, n: pay.days })}</p>
            <div className="mt-4 space-y-2">
              <CopyRow label={t("xfer.amount")} value={idr(pay.amount)} copy={String(pay.amount)} />
              <CopyRow label={`${t("xfer.bank")} · ${pay.bank.holder}`} value={`${pay.bank.name} ${pay.bank.number}`} copy={pay.bank.number} />
            </div>
            <p className="mt-3 text-xs text-gold">{t("xfer.exact")}</p>
            <p className="mt-1 text-xs text-muted">{t("xfer.deadline", { time: clock(left) })}</p>
            <div className="mt-4 rounded-xl border border-line-2 p-3 text-left">
              <h3 className="text-sm font-semibold">{t("xfer.proofTitle")}</h3>
              <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-xs text-ink-2">
                <li>{t("xfer.step1")}</li>
                <li>{t("xfer.step2", { contact: `@${pay.proofContact}` })}</li>
                <li>{t("xfer.step3")}</li>
              </ol>
              <div className="mt-3">
                <CopyRow label={t("xfer.email")} value={pay.email} copy={pay.email} />
              </div>
              {/* Sending proof also counts as "I've paid", so the order lands in the owner's approval queue. */}
              <a className="btn btn-gold mt-3 w-full justify-center" href={pay.proofUrl} target="_blank" rel="noreferrer" onClick={() => void claim(true)}>
                <Send size={14} /> {t("xfer.sendProof")}
              </a>
            </div>
            {pay.claimed ? (
              <div className="mt-4 rounded-xl border border-gold-deep/40 bg-gold-soft p-3 text-sm text-gold">
                <Loader2 size={14} className="mr-1.5 inline animate-spin" />
                {t("xfer.claimed")}
              </div>
            ) : (
              <button className="btn mt-2 w-full justify-center" onClick={() => claim()} disabled={sending}>
                {sending ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} {t("xfer.paid")}
              </button>
            )}
            {err && <p className="mt-2 text-xs text-down">{err}</p>}
            <p className="mt-3 text-[10px] text-muted">{t("qris.order", { id: pay.orderId })}</p>
          </>
        ) : (
          <div className="py-6">
            <h2 className="text-lg font-semibold">{t(pay.status === "expired" ? "xfer.expired" : "xfer.rejected")}</h2>
            <p className="mt-1 text-sm text-muted">{t(pay.status === "expired" ? "xfer.expiredNote" : "xfer.rejectedNote")}</p>
            <p className="mt-3 text-[10px] text-muted">{t("qris.order", { id: pay.orderId })}</p>
            <button className="btn mt-5" onClick={onClose}>{t("app.close")}</button>
          </div>
        )}
      </div>
    </div>
  );
}
