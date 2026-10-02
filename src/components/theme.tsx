"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { THEME_COLOR, THEME_COOKIE, type Theme, type ThemePref } from "@/lib/theme";

interface ThemeCtx {
  pref: ThemePref;
  /** What is actually on screen ("system" resolved against the OS setting). */
  theme: Theme;
  setPref(p: ThemePref): void;
}

const Ctx = createContext<ThemeCtx | null>(null);
const LIGHT_QUERY = "(prefers-color-scheme: light)";
const subscribeOs = (cb: () => void) => {
  const mq = window.matchMedia(LIGHT_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

/** The server sets data-theme on <html> from the cookie; this keeps it in step when the user changes it. */
export function ThemeProvider({ initial, children }: { initial: ThemePref; children: ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>(initial);
  const osLight = useSyncExternalStore(subscribeOs, () => window.matchMedia(LIGHT_QUERY).matches, () => false);
  const theme: Theme = pref === "system" ? (osLight ? "light" : "dark") : pref;

  const setPref = useCallback((p: ThemePref) => {
    setPrefState(p);
    document.cookie = `${THEME_COOKIE}=${p}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.dataset.theme = p;
  }, []);

  useEffect(() => {
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", THEME_COLOR[theme]));
  }, [theme]);

  const value = useMemo(() => ({ pref, theme, setPref }), [pref, theme, setPref]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTheme outside ThemeProvider");
  return c;
}
