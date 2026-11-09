// Which finished matches become notifications. Pure and free of `@/` imports,
// so the tests can load it directly.
import type { MatchSummary } from "./aoe2companion";

/** Older matches are neither notified nor kept. */
export const NOTIFICATION_RETENTION_MS = 30 * 86400_000;
/** Linking or following someone also brings their last day, so the bell isn't empty at first. */
export const NOTIFICATION_BACKFILL_MS = 86400_000;

export type Watched = { profileId: string; since: number; mine: boolean };

export type NewNotification = {
  matchId: string;
  profileId: string;
  playerName: string;
  mine: boolean;
  won: boolean | null;
  mapName: string | null;
  leaderboardName: string | null;
  finishedAt: Date;
};

// Postgres text cannot hold NUL, and these strings come from another service.
const clean = (v: string) => v.replaceAll("\0", "").slice(0, 200);

/** One notification per match, preferring the user's own participation over a followed player's. */
export function pickNotifications(matches: MatchSummary[], watched: Watched[], now: number): NewNotification[] {
  const ordered = [...watched].sort((a, b) => Number(b.mine) - Number(a.mine));
  const found = new Map<number, NewNotification>();
  for (const m of matches) {
    if (m.matchId <= 0 || !m.finished || found.has(m.matchId)) continue;
    const finished = new Date(m.finished).getTime();
    if (Number.isNaN(finished) || finished <= now - NOTIFICATION_RETENTION_MS) continue;
    const players = m.teams.flatMap((t) => t.players);
    for (const w of ordered) {
      const player = players.find((p) => String(p.profileId) === w.profileId);
      if (!player || finished <= w.since) continue;
      found.set(m.matchId, {
        matchId: String(m.matchId),
        profileId: w.profileId,
        playerName: clean(player.name),
        mine: w.mine,
        won: player.won,
        mapName: m.mapName && clean(m.mapName),
        leaderboardName: m.leaderboardName && clean(m.leaderboardName),
        finishedAt: new Date(finished),
      });
      break;
    }
  }
  return [...found.values()];
}
