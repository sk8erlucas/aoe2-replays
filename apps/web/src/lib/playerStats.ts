// What a player plays most in the matches loaded on their profile: civilizations
// and maps, with games and wins. Pure, so it is testable.
import type { MatchSummary } from "./aoe2companion";

export type StatRow = { name: string; games: number; wins: number };
export type PlayerStats = { games: number; wins: number; losses: number; civs: StatRow[]; maps: StatRow[] };

const TOP = 5;

export function playerStats(matches: MatchSummary[], profileId: number): PlayerStats {
  const civs = new Map<string, StatRow>();
  const maps = new Map<string, StatRow>();
  let games = 0;
  let wins = 0;
  let losses = 0;
  const add = (rows: Map<string, StatRow>, name: string | null, won: boolean | null) => {
    if (!name) return;
    const row = rows.get(name) ?? { name, games: 0, wins: 0 };
    row.games++;
    if (won) row.wins++;
    rows.set(name, row);
  };
  for (const m of matches) {
    const me = m.teams.flatMap((t) => t.players).find((p) => p.profileId === profileId);
    if (!me) continue;
    games++;
    if (me.won === true) wins++;
    else if (me.won === false) losses++;
    add(civs, me.civName, me.won);
    add(maps, m.mapName, me.won);
  }
  const top = (rows: Map<string, StatRow>) =>
    [...rows.values()].sort((a, b) => b.games - a.games || b.wins - a.wins || a.name.localeCompare(b.name)).slice(0, TOP);
  return { games, wins, losses, civs: top(civs), maps: top(maps) };
}
