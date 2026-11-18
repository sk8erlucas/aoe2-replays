"use client";

import { useEffect, useMemo, useState } from "react";
import type { Player } from "@aoe2-replays/shared";
import type { FollowMode, Replay } from "@aoe2-replays/viewer";
import { useI18n } from "@/i18n/I18nProvider";

const JOBS = ["food", "wood", "gold", "stone", "build", "idle"] as const;
const ICON_PX = 30; // shown size of a research icon

// The game's research icons (tools/sprites/techicons.py): one atlas, fetched once.
type TechIcons = { size: number; cols: number; techs: Record<string, number> };
let iconsPromise: Promise<TechIcons | null> | null = null;
function loadIcons(): Promise<TechIcons | null> {
  iconsPromise ??= fetch("/sprites/tech-icons.json")
    .then((r) => (r.ok ? (r.json() as Promise<TechIcons>) : null))
    .catch(() => null);
  return iconsPromise;
}

function TechIcon({ icons, techId, name }: { icons: TechIcons | null; techId: number; name: string }) {
  const cell = icons?.techs[techId];
  if (!icons || cell == null) return <span className="research-name">{name}</span>;
  return (
    <span
      className="research-icon"
      role="img"
      aria-label={name}
      style={{
        backgroundSize: `${icons.cols * ICON_PX}px auto`,
        backgroundPosition: `-${(cell % icons.cols) * ICON_PX}px -${Math.floor(cell / icons.cols) * ICON_PX}px`,
      }}
    />
  );
}

/**
 * Panels over the map, like the game's spectator view: villagers of each player
 * by job and, when following a player, what they are researching. All estimated
 * by the engine (see tasks/18).
 */
export function GamePanels({
  replay,
  t,
  follow,
  players,
  color,
}: {
  replay: Replay;
  t: number;
  follow: FollowMode;
  players: Player[];
  color: (n: number) => string | undefined;
}) {
  const { t: tr } = useI18n();
  const p = tr.viewer.panels;
  const second = Math.floor(t / 1000);
  const jobs = useMemo(() => replay.villagerJobsAt(second * 1000), [replay, second]);
  const researching = typeof follow === "number" ? replay.researchesAt(follow, t) : [];
  const followed = typeof follow === "number" ? replay.playerByNumber.get(follow) : undefined;
  const [icons, setIcons] = useState<TechIcons | null>(null);
  useEffect(() => {
    let live = true;
    loadIcons().then((i) => live && setIcons(i));
    return () => {
      live = false;
    };
  }, []);

  return (
    <>
      {followed && researching.length > 0 && (
        <div className="stage-panel research-panel" aria-label={p.researchOf(followed.name)}>
          <ul>
            {researching.map((r) => (
              <li key={r.techId} title={p.researchEnds(r.name)}>
                <TechIcon icons={icons} techId={r.techId} name={r.name} />
                <span className="research-bar" aria-hidden="true">
                  <span style={{ width: `${Math.round(r.progress * 100)}%` }} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="stage-panel villagers-panel">
        <table>
          <caption>{p.villagers}</caption>
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">{p.player}</span>
              </th>
              <th scope="col" title={p.villagersTotal}>
                Σ
              </th>
              {JOBS.map((j) => (
                <th key={j} scope="col" title={p.jobs[j]}>
                  {p.short[j]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {players.map((pl) => {
              const row = jobs.get(pl.number);
              if (!row) return null;
              return (
                <tr key={pl.number}>
                  <th scope="row">
                    <span className="swatch" style={{ background: color(pl.number) ?? "#fff" }} aria-hidden="true" />
                    <span className="name">{pl.name}</span>
                  </th>
                  <td>{row.total}</td>
                  {JOBS.map((j) => (
                    <td key={j} className={row[j] ? "" : "zero"}>
                      {row[j]}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
