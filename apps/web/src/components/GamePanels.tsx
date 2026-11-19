"use client";

import { useEffect, useMemo, useState } from "react";
import type { Player } from "@aoe2-replays/shared";
import type { FollowMode, Replay } from "@aoe2-replays/viewer";
import { useI18n } from "@/i18n/I18nProvider";
import { PANEL_TABS, panelCell, panelTable, readPanelTab, savePanelTab, type PanelTab } from "@/lib/panelTable";

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
 * Panels over the map, like the game's spectator view: per player (by team),
 * villagers by job, army by kind, resources in stock (the game's, from the
 * replay) and a summary, one tab each; and, when following a player, what they
 * are researching. All but the resources are estimated by the engine (see tasks/18).
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
  const [tab, setTab] = useState<PanelTab>("villagers");
  useEffect(() => setTab(readPanelTab()), []);
  const pickTab = (k: PanelTab) => {
    setTab(k);
    savePanelTab(k);
  };
  const { rows, columns } = useMemo(() => panelTable(replay, tab, second * 1000, p, players), [replay, tab, second, p, players]);
  const noStock = tab === "resources" && replay.resourcesAt(0) === null;
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
        <div className="panel-tabs" role="tablist" aria-label={p.tabsLabel}>
          {PANEL_TABS.map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              className={tab === k ? "active" : ""}
              title={p.tabTitles[k]}
              onClick={() => pickTab(k)}
            >
              {p.tabs[k]}
            </button>
          ))}
        </div>
        <table role="tabpanel">
          <caption>{p.captions[tab]}</caption>
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">{p.player}</span>
              </th>
              {columns.map((c) => (
                <th key={c.key} scope="col" title={c.title}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {players.map((pl, i) => {
              const row = rows.get(pl.number);
              if (!row) return null;
              const newTeam = i > 0 && pl.team_id > 1 && pl.team_id !== players[i - 1].team_id;
              return (
                <tr key={pl.number} className={newTeam ? "team-start" : ""}>
                  <th scope="row">
                    <span className="swatch" style={{ background: color(pl.number) ?? "#fff" }} aria-hidden="true" />
                    <span className="name">{pl.name}</span>
                  </th>
                  {columns.map((c) => {
                    const v = row[c.key];
                    return (
                      <td key={c.key} className={v ? "" : "zero"}>
                        {panelCell(c.key, v)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        {noStock && <p className="panel-note">{p.noResources}</p>}
      </div>
    </>
  );
}
