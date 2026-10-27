import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AoE2 Replays",
  description: "Visor y análisis de replays de Age of Empires II: Definitive Edition.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
