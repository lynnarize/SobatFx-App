// Colour theme. Dark is the default (the SobatFX brand look); "system" follows the OS setting.
// The choice lives in a cookie so the server renders the right theme from the first paint.

export type ThemePref = "dark" | "light" | "system";
export type Theme = "dark" | "light";
export const THEME_COOKIE = "sfx_theme";
export const THEMES: ThemePref[] = ["dark", "light", "system"];

export function parseTheme(v: string | undefined | null): ThemePref {
  return v === "light" || v === "system" ? v : "dark";
}

/** Browser bar colour per theme (matches --bg in globals.css). */
export const THEME_COLOR: Record<Theme, string> = { dark: "#0a0a0b", light: "#f6f4ef" };

/** Chart colours that can't come from CSS variables (the chart draws on a canvas). */
export const CHART_THEME: Record<Theme, { bg: string; text: string; grid: string; border: string }> = {
  dark: { bg: "#111113", text: "#858077", grid: "rgba(244,241,234,0.04)", border: "rgba(244,241,234,0.08)" },
  light: { bg: "#ffffff", text: "#77716a", grid: "rgba(23,20,16,0.05)", border: "rgba(23,20,16,0.1)" },
};
