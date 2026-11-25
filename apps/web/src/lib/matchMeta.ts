// Description of a match page for search engines and link previews: map, mode,
// size, duration, teams with their ratings and who won. Pure, so it is testable.
import type { MatchSummary } from "./aoe2companion";

export type MatchMetaText = {
  match: (head: string, teams: string) => string;
  matchWon: (names: string) => string;
  minutes: (n: number) => string;
};

type StoredPlayer = { name?: string; team_id?: number };

export function matchDescription(
  t: MatchMetaText,
  { map, durationMs, info, stored }: { map: string; durationMs: number | null; info: MatchSummary | null; stored: StoredPlayer[] },
): string {
  // aoe2companion knows teams, ratings and results; without it, the replay's teams.
  let teams: Array<Array<{ name: string; rating: number | null; won: boolean | null }>>;
  if (info && info.teams.some((team) => team.players.length)) {
    teams = info.teams.map((team) => team.players.map((p) => ({ name: p.name, rating: p.rating, won: p.won })));
  } else {
    const byTeam = new Map<number, Array<{ name: string; rating: null; won: null }>>();
    for (const p of stored) {
      if (!p.name) continue;
      const list = byTeam.get(p.team_id ?? 0) ?? [];
      list.push({ name: p.name, rating: null, won: null });
      byTeam.set(p.team_id ?? 0, list);
    }
    teams = [...byTeam.values()];
  }
  teams = teams.filter((team) => team.length);
  const size = teams.length > 1 ? teams.map((team) => team.length).join("v") : null;
  const head = [map, info?.leaderboardName ?? null, size, durationMs ? t.minutes(Math.max(1, Math.round(durationMs / 60_000))) : null]
    .filter(Boolean)
    .join(" · ");
  const list = teams
    .map((team) => team.map((p) => (p.rating != null ? `${p.name} (${p.rating})` : p.name)).join(", "))
    .join(" vs ");
  const winners = teams.find((team) => team.every((p) => p.won === true));
  const won = winners ? ` ${t.matchWon(winners.map((p) => p.name).join(", "))}` : "";
  return t.match(head, list ? `${list}.${won}` : "");
}
