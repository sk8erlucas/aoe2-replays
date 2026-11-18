"use client";

import { useMemo } from "react";
import type { Player } from "@aoe2-replays/shared";
import type { FollowMode, Replay } from "@aoe2-replays/viewer";
import { useI18n } from "@/i18n/I18nProvider";

const JOBS = ["food", "wood", "gold", "stone", "build", "idle"] as const;

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

  return (
    <>
      {followed && researching.length > 0 && (
        <div className="stage-panel research-panel" aria-label={p.researchOf(followed.name)}>
          <ul>
            {researching.map((r) => (
              <li key={r.techId} title={p.researchEnds(r.name)}>
                <span className="research-name">{r.name}</span>
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
