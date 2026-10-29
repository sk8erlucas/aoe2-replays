import type { Metadata } from "next";
import localFont from "next/font/local";
import { cookies, headers } from "next/headers";
import Link from "next/link";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { PlayerSearch } from "@/components/PlayerSearch";
import { I18nProvider } from "@/i18n/I18nProvider";
import { MESSAGES, REPO_URL, pickLocale } from "@/i18n/messages";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

// Variable fonts (latin subset) kept in the repo, so the build never depends on
// Google Fonts answering. Both SIL Open Font License (src/fonts/OFL-*.txt).
const cinzel = localFont({
  src: "../fonts/cinzel-latin.woff2",
  weight: "400 900",
  variable: "--font-cinzel",
  display: "swap",
});
const montserrat = localFont({
  src: "../fonts/montserrat-latin.woff2",
  weight: "100 900",
  variable: "--font-montserrat",
  display: "swap",
});

// The user's choice (cookie) wins over the browser's languages.
async function currentLocale() {
  return pickLocale((await cookies()).get("lang")?.value, (await headers()).get("accept-language"));
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await currentLocale();
  const t = MESSAGES[locale];
  const image = { url: "/images/og.jpg", width: 1200, height: 630, alt: t.meta.imageAlt };
  return {
    metadataBase: new URL(SITE_URL),
    title: "AoE2 Replays",
    description: t.meta.description,
    openGraph: {
      type: "website",
      siteName: "AoE2 Replays",
      title: "AoE2 Replays",
      description: t.meta.description,
      url: "/",
      locale: locale === "es" ? "es_AR" : "en_US",
      images: [image],
    },
    twitter: { card: "summary_large_image", title: "AoE2 Replays", description: t.meta.description, images: [image] },
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await currentLocale();
  const t = MESSAGES[locale];
  const rules = "Game Content Usage Rules";
  const [before, after] = t.footer.notice(rules).split(rules);
  return (
    <html lang={locale} className={`${cinzel.variable} ${montserrat.variable}`}>
      <body>
        <I18nProvider initial={locale}>
          <div className="app">
            <header className="topbar">
              <Link href="/" className="brand">
                AoE2 Replays
              </Link>
              <nav className="topnav">
                <Link href="/#upload">{t.nav.upload}</Link>
                <a href={REPO_URL}>GitHub</a>
              </nav>
              <PlayerSearch />
              <LanguageSwitcher />
            </header>
            {children}
            <footer className="legal">
              <p>
                {before}
                <a href="https://www.xbox.com/en-US/developers/rules">{rules}</a>
                {after}
              </p>
              <p>
                {t.footer.project} <a href={REPO_URL}>{t.footer.source}</a>
              </p>
            </footer>
          </div>
        </I18nProvider>
      </body>
    </html>
  );
}
