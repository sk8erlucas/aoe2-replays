// Players listed in the sitemap, from the stored online matches.
const MAX_PLAYERS = 2000;

/**
 * Players of the stored matches, most recent first: the one whose copy was downloaded
 * and, for matches stored since November 2026, everyone in them. Their pages
 * show what aoe2companion already shows publicly.
 */
export function sitemapPlayers(matches: Array<{ sourceProfileId: string; players: unknown }>, max = MAX_PLAYERS): string[] {
  const out = new Set<string>();
  for (const m of matches) {
    const ids = [m.sourceProfileId, ...(Array.isArray(m.players) ? m.players : []).map((p) => (p as { profile_id?: unknown })?.profile_id)];
    for (const id of ids) {
      const s = typeof id === "number" ? String(id) : id;
      if (typeof s === "string" && /^[1-9][0-9]{0,11}$/.test(s)) out.add(s);
      if (out.size >= max) return [...out];
    }
  }
  return [...out];
}
