// Input checks shared by the API routes. No imports (and no `@/` aliases), so
// the tests can load this file directly with Node.

/** Replay ids are 16 random bytes in base64url. */
export const isReplayId = (v: string) => /^[\w-]{22}$/.test(v);

/** Management tokens are 24 random bytes in base64url. */
export const isManageToken = (v: string) => /^[\w-]{32}$/.test(v);

/** Match and profile ids from Microsoft / aoe2companion: plain numbers. */
export const isMatchId = (v: string) => /^\d{1,12}$/.test(v);

/** A non-negative integer from the environment, or `fallback` if unset or invalid. */
export function envInt(name: string, fallback: number, env: Record<string, string | undefined> = process.env): number {
  const raw = env[name]?.trim();
  if (!raw || !/^\d+$/.test(raw)) return fallback;
  return Number(raw);
}

/**
 * Request limits, configurable per deployment (see docs/DEPLOY.md). 0 turns a
 * limit off. The match import limit is per IP and also global, because every
 * import is a download from Microsoft.
 */
export const LIMITS = {
  searchesPerMinute: envInt("SEARCHES_PER_MINUTE", 60),
  importsPerHour: envInt("MATCH_IMPORTS_PER_HOUR", 20),
  importsPerHourGlobal: envInt("MATCH_IMPORTS_PER_HOUR_GLOBAL", 300),
};
