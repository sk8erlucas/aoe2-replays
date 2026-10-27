import type { Metadata } from "next";
import { Cinzel, Montserrat } from "next/font/google";
import Link from "next/link";
import { PlayerSearch } from "@/components/PlayerSearch";
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
            <nav className="topnav">
              <Link href="/#subir">Subir replay</Link>
            </nav>
            <PlayerSearch />
          </header>
          {children}
          <footer className="legal">
            <p>
              Age of Empires II © Microsoft Corporation. AoE2 Replays se creó bajo las{" "}
              <a href="https://www.xbox.com/en-US/developers/rules">Game Content Usage Rules</a> de Microsoft usando
              contenido de Age of Empires II, y no está respaldado ni afiliado a Microsoft.
            </p>
            <p>Proyecto de fans, de código abierto (MIT).</p>
          </footer>
        </div>
      </body>
    </html>
  );
}
