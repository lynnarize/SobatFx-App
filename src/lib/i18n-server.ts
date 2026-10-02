import { cookies } from "next/headers";
import { type Key, LANG_COOKIE, type Vars, parseLang, translate } from "./i18n";
import { THEME_COOKIE, parseTheme } from "./theme";

/** UI language from the cookie (defaults to Bahasa Indonesia). */
export async function getLang() {
  return parseLang((await cookies()).get(LANG_COOKIE)?.value);
}

/** Colour theme from the cookie (defaults to dark). */
export async function getTheme() {
  return parseTheme((await cookies()).get(THEME_COOKIE)?.value);
}

export async function serverT() {
  const lang = await getLang();
  return { lang, t: (key: Key, vars?: Vars) => translate(lang, key, vars) };
}
