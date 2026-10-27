// Player search, profiles and match lists from aoe2companion's public API.
// Responses are cached in memory for a few minutes to stay gentle with it.

const BASE = "https://data.aoe2companion.com/api";
const TTL_MS = 5 * 60_000;
const MAX_ENTRIES = 500;

const cache = new Map<string, { at: number; value: unknown }>();

async function getJson<T>(path: string): Promise<T> {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T;
  const res = await fetch(`${BASE}${path}`, {
    headers: { accept: "application/json", "user-agent": "aoe2-replays (open source replay viewer)" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`aoe2companion ${res.status}`);
  const value = (await res.json()) as T;
  if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
  cache.set(path, { at: Date.now(), value });
  return value;
}

export type ProfileHit = { profileId: number; name: string; country: string | null; clan: string | null; games: number };

export type Rating = {
  leaderboardId: string;
  leaderboardName: string;
  rating: number | null;
  maxRating: number | null;
  rank: number | null;
  wins: number;
  losses: number;
  streak: number | null;
};

export type Profile = {
  profileId: number;
  name: string;
  country: string | null;
  countryName: string | null;
  clan: string | null;
  games: number;
  ratings: Rating[];
};

export type MatchPlayer = {
  profileId: number | null;
  name: string;
  civName: string | null;
  colorHex: string | null;
  team: number | null;
  rating: number | null;
  ratingDiff: number | null;
  won: boolean | null;
};

export type MatchSummary = {
  matchId: number;
  started: string | null;
  finished: string | null;
  leaderboardName: string | null;
  mapName: string | null;
  teams: Array<{ teamId: number | null; players: MatchPlayer[] }>;
};

type Raw = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" && v ? v : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : null);

export async function searchProfiles(query: string): Promise<ProfileHit[]> {
  const body = await getJson<{ profiles?: Raw[] }>(`/profiles?search=${encodeURIComponent(query)}&page=1`);
  return (body.profiles ?? [])
    .map((p) => ({
      profileId: num(p.profileId) ?? 0,
      name: str(p.name) ?? "",
      country: str(p.country),
      clan: str(p.clan),
      games: num(p.games) ?? 0,
    }))
    .filter((p) => p.profileId > 0 && p.name)
    .slice(0, 10);
}

export async function getProfile(profileId: number): Promise<Profile> {
  const p = await getJson<Raw>(`/profiles/${profileId}`);
  const boards = Array.isArray(p.leaderboards) ? (p.leaderboards as Raw[]) : [];
  return {
    profileId,
    name: str(p.name) ?? `#${profileId}`,
    country: str(p.country),
    countryName: str(p.countryName),
    clan: str(p.clan),
    games: num(p.games) ?? 0,
    ratings: boards.map((b) => ({
      leaderboardId: str(b.leaderboardId) ?? "",
      leaderboardName: str(b.leaderboardName) ?? str(b.leaderboardId) ?? "",
      rating: num(b.rating),
      maxRating: num(b.maxRating),
      rank: num(b.rank),
      wins: num(b.wins) ?? 0,
      losses: num(b.losses) ?? 0,
      streak: num(b.streak),
    })),
  };
}

export async function getMatches(profileId: number): Promise<MatchSummary[]> {
  const body = await getJson<{ matches?: Raw[] }>(`/matches?profile_ids=${profileId}&page=1`);
  return (body.matches ?? []).map((m) => ({
    matchId: num(m.matchId) ?? 0,
    started: str(m.started),
    finished: str(m.finished),
    leaderboardName: str(m.leaderboardName) ?? str(m.gameModeName),
    mapName: str(m.mapName),
    teams: (Array.isArray(m.teams) ? (m.teams as Raw[]) : []).map((t) => ({
      teamId: num(t.teamId),
      players: (Array.isArray(t.players) ? (t.players as Raw[]) : []).map((pl) => ({
        profileId: num(pl.profileId),
        name: str(pl.name) ?? "?",
        civName: str(pl.civName),
        colorHex: str(pl.colorHex),
        team: num(pl.team),
        rating: num(pl.rating),
        ratingDiff: num(pl.ratingDiff),
        won: typeof pl.won === "boolean" ? pl.won : null,
      })),
    })),
  }));
}
