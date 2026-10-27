import type { Metadata } from "next";
import { Cinzel, Montserrat } from "next/font/google";
import Link from "next/link";
import "./globals.css";

// Self-hosted at build time by next/font; both are SIL Open Font License.
const cinzel = Cinzel({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-cinzel" });
const montserrat = Montserrat({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-montserrat" });

export const metadata: Metadata = {
  title: "AoE2 Replays",
  description: "Visor y análisis de replays de Age of Empires II: Definitive Edition.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={`${cinzel.variable} ${montserrat.variable}`}>
      <body>
        <div className="app">
          <header className="topbar">
            <Link href="/" className="brand">
              AoE2 Replays
            </Link>
          </header>
          {children}
          <footer className="legal muted small">
            Proyecto de fans, open source (MIT). No afiliado a Microsoft, Xbox Game Studios ni World&apos;s Edge.
          </footer>
        </div>
      </body>
    </html>
  );
}
