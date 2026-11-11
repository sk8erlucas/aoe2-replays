// Link preview images (1200×630) for matches and players, drawn with next/og
// in the site's parchment style. Plain shapes and text only: no game art.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

export const OG_SIZE = { width: 1200, height: 630 };

const PAPER = "#efe2c8";
const PAPER_RAISED = "#f6ecd8";
const INK = "#2f2620";
const INK_SOFT = "#5c4f43";
const BRONZE = "#8c5226";
const BRONZE_DARK = "#5e3416";
const CHARCOAL = "#2d2a27";
const WIN = "#2f6b2a";
const LOSS = "#a4282b";

let logoPromise: Promise<string | null> | null = null;
// Standalone builds run from the repo root (/app), `next dev` from apps/web.
function logo() {
  logoPromise ??= (async () => {
    for (const dir of [process.cwd(), path.join(process.cwd(), "apps/web")]) {
      try {
        const svg = await readFile(path.join(dir, "public/images/logo.svg"));
        return `data:image/svg+xml;base64,${svg.toString("base64")}`;
      } catch {
        // try the next location
      }
    }
    return null;
  })();
  return logoPromise;
}

export type OgPlayer = { name: string; detail: string | null; color: string | null; won: boolean | null };

type Card = {
  kicker: string;
  title: string;
  subtitle: string | null;
  /** Players grouped in teams (matches), or a single list. */
  teams: OgPlayer[][];
  /** Lines of label: value (player ratings). */
  stats: Array<{ label: string; value: string }>;
  winLabel: string;
  lossLabel: string;
};

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

export async function ogImage(card: Card) {
  const logoSrc = await logo();
  const many = card.teams.flat().length > 4;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: PAPER, color: INK }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            padding: "22px 48px",
            background: CHARCOAL,
            color: PAPER,
            fontSize: 30,
            letterSpacing: 3,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- next/og draws plain <img> */}
          {logoSrc && <img src={logoSrc} width={44} height={44} alt="" />}
          <span>AoE2 REPLAYS</span>
          <span style={{ marginLeft: "auto", fontSize: 24, color: "#d39a5f", letterSpacing: 1 }}>{clip(card.kicker, 48)}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "34px 48px 30px" }}>
          <div style={{ fontSize: 64, fontWeight: 700, color: BRONZE_DARK, lineHeight: 1.1 }}>{clip(card.title, 34)}</div>
          {card.subtitle && <div style={{ fontSize: 30, color: INK_SOFT, marginTop: 8 }}>{clip(card.subtitle, 70)}</div>}
          <div style={{ display: "flex", gap: 28, marginTop: 28, flex: 1 }}>
            {card.teams.map((team, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  flex: 1,
                  gap: many ? 8 : 14,
                  padding: "16px 20px",
                  background: PAPER_RAISED,
                  border: `2px solid ${BRONZE}`,
                  borderRadius: 6,
                }}
              >
                {team.slice(0, 4).map((p, j) => (
                  <div key={j} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: many ? 24 : 30 }}>
                    <div style={{ width: 22, height: 22, background: p.color ?? "#999", border: `2px solid ${INK}`, flexShrink: 0 }} />
                    <span style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{clip(p.name, many ? 15 : 22)}</span>
                    {p.detail && (
                      <span style={{ color: INK_SOFT, fontSize: many ? 20 : 24, whiteSpace: "nowrap" }}>{clip(p.detail, 22)}</span>
                    )}
                    {p.won != null && (
                      <span style={{ marginLeft: "auto", fontSize: many ? 18 : 22, fontWeight: 700, color: p.won ? WIN : LOSS }}>
                        {p.won ? card.winLabel : card.lossLabel}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ))}
            {card.stats.length > 0 && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  flex: 1,
                  gap: 12,
                  padding: "16px 20px",
                  background: PAPER_RAISED,
                  border: `2px solid ${BRONZE}`,
                  borderRadius: 6,
                }}
              >
                {card.stats.slice(0, 5).map((s) => (
                  <div key={s.label} style={{ display: "flex", fontSize: 30 }}>
                    <span style={{ color: INK_SOFT }}>{clip(s.label, 26)}</span>
                    <span style={{ marginLeft: "auto", fontWeight: 700 }}>{s.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    ),
    { ...OG_SIZE, headers: { "cache-control": "public, max-age=3600, s-maxage=3600" } },
  );
}
