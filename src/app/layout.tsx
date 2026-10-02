import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import { I18nProvider } from "@/components/i18n";
import { ThemeProvider } from "@/components/theme";
import { Providers } from "@/components/workspace";
import { translate } from "@/lib/i18n";
import { getLang, getTheme } from "@/lib/i18n-server";
import { THEME_COLOR } from "@/lib/theme";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  return { title: translate(lang, "meta.title"), description: translate(lang, "meta.description") };
}

export async function generateViewport(): Promise<Viewport> {
  const theme = await getTheme();
  if (theme !== "system") return { themeColor: THEME_COLOR[theme], colorScheme: theme };
  return {
    themeColor: [
      { media: "(prefers-color-scheme: light)", color: THEME_COLOR.light },
      { media: "(prefers-color-scheme: dark)", color: THEME_COLOR.dark },
    ],
    colorScheme: "dark light",
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [lang, theme] = await Promise.all([getLang(), getTheme()]);
  return (
    <html lang={lang} data-theme={theme} className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="h-full">
        <I18nProvider initial={lang}>
          <ThemeProvider initial={theme}>
            <Providers>
              <AppShell>{children}</AppShell>
            </Providers>
          </ThemeProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
