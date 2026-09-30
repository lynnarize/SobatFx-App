import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import { I18nProvider } from "@/components/i18n";
import { Providers } from "@/components/workspace";
import { translate } from "@/lib/i18n";
import { getLang } from "@/lib/i18n-server";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  return { title: translate(lang, "meta.title"), description: translate(lang, "meta.description") };
}

export const viewport: Viewport = { themeColor: "#0a0a0b" };

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const lang = await getLang();
  return (
    <html lang={lang} className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="h-full">
        <I18nProvider initial={lang}>
          <Providers>
            <AppShell>{children}</AppShell>
          </Providers>
        </I18nProvider>
      </body>
    </html>
  );
}
