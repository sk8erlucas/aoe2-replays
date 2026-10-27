import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "AoE2 Replays",
  description: "Visor y análisis de replays de Age of Empires II: Definitive Edition.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
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
