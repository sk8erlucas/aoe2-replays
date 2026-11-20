// What each tab of the players panel shows: shared by the panel over the map
// and the video export, which draws the same table on its frames.
import type { Player } from "@aoe2-replays/shared";
import type { Replay } from "@aoe2-replays/viewer";
import type { Messages } from "@/i18n/messages";

export const PANEL_TABS = ["villagers", "army", "resources", "overview"] as const;
export type PanelTab = (typeof PANEL_TABS)[number];
export type PanelRow = Record<string, number | string | null>;
export type PanelColumn = { key: string; label: string; title: string };
export type PanelTable = { rows: Map<number, PanelRow>; columns: PanelColumn[] };
type PanelLabels = Messages["viewer"]["panels"];

const JOBS = ["food", "wood", "gold", "stone", "build", "idle"] as const;
const ARMY = ["infantry", "archers", "cavalry", "siege", "ships", "monks"] as const;
const STOCK = ["food", "wood", "gold", "stone"] as const;
const OVERVIEW = ["age", "pop", "researches", "buildings"] as const;
const TAB_KEY = "viewer-panel-tab";

/** The tab picked last in this browser, else villagers. */
export function readPanelTab(): PanelTab {
  try {
    const stored = localStorage.getItem(TAB_KEY);
    if (stored && (PANEL_TABS as readonly string[]).includes(stored)) return stored as PanelTab;
  } catch {
    // storage blocked: the default
  }
  return "villagers";
}

export function savePanelTab(tab: PanelTab) {
  try {
    localStorage.setItem(TAB_KEY, tab);
  } catch {
    // storage blocked: only for this visit
  }
}

function toRows(m: Map<number, object>): Map<number, PanelRow> {
  return new Map([...m].map(([n, v]) => [n, Object.fromEntries(Object.entries(v)) as PanelRow]));
}

/** The rows (by player number) and columns of a tab at game time t. */
export function panelTable(replay: Replay, tab: PanelTab, t: number, p: PanelLabels, players: Player[]): PanelTable {
  if (tab === "army") {
    return {
      rows: toRows(replay.armyAt(t)),
      columns: [
        { key: "total", label: "Σ", title: p.armyTotal },
        ...ARMY.map((k) => ({ key: k, label: p.armyShort[k], title: p.armyKinds[k] })),
      ],
    };
  }
  if (tab === "resources") {
    const stock = replay.stockAt(t);
    const rows = new Map<number, PanelRow>();
    for (const pl of players) {
      const s = stock?.get(pl.number);
      rows.set(pl.number, s ? { ...s } : { total: null, food: null, wood: null, gold: null, stone: null });
    }
    return {
      rows,
      columns: [
        { key: "total", label: "Σ", title: p.stockTitle },
        ...STOCK.map((k) => ({ key: k, label: p.stockShort[k], title: p.stockKinds[k] })),
      ],
    };
  }
  if (tab === "overview") {
    const rows = new Map<number, PanelRow>();
    for (const [n, o] of replay.overviewAt(t)) {
      rows.set(n, { age: p.ages[o.age - 1] ?? String(o.age), pop: o.villagers + o.army, researches: o.researches, buildings: o.buildings });
    }
    return { rows, columns: OVERVIEW.map((k) => ({ key: k, label: p.overviewShort[k], title: p.overviewTitles[k] })) };
  }
  return {
    rows: toRows(replay.villagerJobsAt(t)),
    columns: [
      { key: "total", label: "Σ", title: p.villagersTotal },
      ...JOBS.map((j) => ({ key: j, label: p.short[j], title: p.jobs[j] })),
    ],
  };
}

/** A cell as text: thousands as "12.3k" so the column stays narrow, missing as a dash. */
export function panelCell(key: string, v: number | string | null | undefined): string {
  if (v == null) return "–";
  if (typeof v === "number" && v >= 10_000) return `${(v / 1000).toFixed(1)}k`;
  return String(v);
}
