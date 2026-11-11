import { formatTime } from "@aoe2-replays/viewer";
import { getMatch } from "@/lib/aoe2companion";
import { findMatch } from "@/lib/matches";
import { OG_SIZE, ogImage, type OgPlayer } from "@/lib/ogImage";
import { serverMessages } from "@/lib/pageMeta";
import { isMatchId } from "@/lib/validate";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "AoE2 Replays";

type Props = { params: Promise<{ matchId: string }> };

type Stored = { name?: string; team_id?: number; civilization?: string | null };

/** Teams, ratings and results from aoe2companion; map and duration from the stored match. */
export default async function Image({ params }: Props) {
  const { matchId } = await params;
  const t = await serverMessages();
  const [stored, info] = isMatchId(matchId)
    ? await Promise.all([findMatch(matchId).catch(() => null), getMatch(Number(matchId)).catch(() => null)])
    : [null, null];

  let teams: OgPlayer[][];
  if (info && info.teams.length > 0) {
    teams = info.teams.map((team) =>
      team.players.map((p) => ({
        name: p.name,
        detail: [p.civName, p.rating != null ? String(p.rating) : null].filter(Boolean).join(" · ") || null,
        color: p.colorHex,
        won: p.won,
      })),
    );
  } else {
    const byTeam = new Map<number, OgPlayer[]>();
    for (const p of (stored?.players as Stored[] | undefined) ?? []) {
      const list = byTeam.get(p.team_id ?? 0) ?? [];
      list.push({ name: p.name ?? "?", detail: p.civilization ?? null, color: null, won: null });
      byTeam.set(p.team_id ?? 0, list);
    }
    teams = [...byTeam.values()];
  }

  const map = stored?.mapName ?? info?.mapName ?? t.common.unknownMap;
  const duration = stored ? formatTime(stored.durationMs) : null;
  return ogImage({
    kicker: info?.leaderboardName ?? t.match.online,
    title: map,
    subtitle: [teams.map((team) => team.length).join(" vs "), duration].filter(Boolean).join(" · ") || null,
    // More than two teams don't fit side by side: one list.
    teams: teams.length > 2 ? [teams.flat()] : teams,
    stats: [],
    winLabel: t.profile.win,
    lossLabel: t.profile.loss,
  });
}
