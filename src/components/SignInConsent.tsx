"use client";

import { LogIn, ShieldCheck, X } from "lucide-react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useT } from "./i18n";

// Every "Sign in with Google" button goes through startSignIn(): the Google sign-in only starts after the
// visitor ticks that they have read the Terms and the Privacy Policy. The tick is asked again on each sign-in.

const Ctx = createContext<(() => void) | null>(null);

export function useStartSignIn() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useStartSignIn outside SignInConsentProvider");
  return c;
}

export function SignInConsentProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const start = useCallback(() => setOpen(true), []);
  return (
    <Ctx.Provider value={start}>
      {children}
      {open && <ConsentDialog onClose={() => setOpen(false)} />}
    </Ctx.Provider>
  );
}

function ConsentDialog({ onClose }: { onClose(): void }) {
  const { t } = useT();
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLInputElement>(null);
  const titleId = useId();

  useEffect(() => {
    box.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const go = () => {
    if (!agreed || busy) return;
    setBusy(true);
    signIn("google");
  };

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/70 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="pop card relative w-full max-w-md p-6 shadow-2xl shadow-black/60" onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn absolute right-3 top-3 h-8 w-8" aria-label={t("app.close")} onClick={onClose}>
          <X size={16} />
        </button>
        <div className="mb-3 grid h-10 w-10 place-items-center rounded-xl border border-line-2 bg-panel-3">
          <ShieldCheck size={18} className="text-gold" />
        </div>
        <h2 id={titleId} className="text-lg font-semibold">
          {t("consent.title")}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">{t("consent.body")}</p>
        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-line-2 bg-panel p-3 text-sm leading-snug text-ink-2">
          <input ref={box} type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--gold)]" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
          <span>
            {t("consent.check")}{" "}
            <Link href="/terms" target="_blank" rel="noopener" className="text-gold underline underline-offset-2" onClick={(e) => e.stopPropagation()}>
              {t("consent.terms")}
            </Link>{" "}
            {t("consent.and")}{" "}
            <Link href="/privacy" target="_blank" rel="noopener" className="text-gold underline underline-offset-2" onClick={(e) => e.stopPropagation()}>
              {t("legal.privacy")}
            </Link>
            .
          </span>
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn" onClick={onClose}>
            {t("consent.cancel")}
          </button>
          <button className="btn btn-gold" disabled={!agreed || busy} onClick={go}>
            <LogIn size={15} /> {t("consent.continue")}
          </button>
        </div>
      </div>
    </div>
  );
}
