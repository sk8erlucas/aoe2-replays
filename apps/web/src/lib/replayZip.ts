// What comes back from Microsoft: building the URL and opening the ZIP. No `@/`
// imports, so the tests can load it directly.
import { unzipSync } from "fflate";

const REPLAY_URL = "https://api.ageofempires.com/api/GameStats/AgeII/GetMatchReplay/";
export const MAX_REPLAY_BYTES = 60 * 1024 * 1024; // uncompressed, guards against zip bombs

/** Fixed host; only digits reach the query string (SSRF). Null if an id isn't a plain number. */
export function replayUrl(matchId: string, profileId: string): string | null {
  if (!/^\d{1,12}$/.test(matchId) || !/^\d{1,12}$/.test(profileId)) return null;
  return `${REPLAY_URL}?gameId=${matchId}&profileId=${profileId}&matchId=${matchId}`;
}

/**
 * The replay inside the ZIP, or null if there isn't one of an acceptable size.
 * Only the first one is inflated: each entry passing the size check is not
 * enough, since a ZIP can hold thousands of them. Throws if the ZIP is damaged.
 */
export function extractReplay(zip: Uint8Array): Uint8Array | null {
  let taken = false;
  const files = unzipSync(zip, {
    filter: (f) => {
      if (taken || !f.name.toLowerCase().endsWith(".aoe2record") || f.originalSize > MAX_REPLAY_BYTES) return false;
      taken = true;
      return true;
    },
  });
  return Object.values(files)[0] ?? null;
}
