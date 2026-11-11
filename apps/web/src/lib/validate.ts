// Input checks shared by the API routes. No imports (and no `@/` aliases), so
// the tests can load this file directly with Node.

/** Replay ids are 16 random bytes in base64url. */
export const isReplayId = (v: string) => /^[\w-]{22}$/.test(v);

/** Management tokens are 24 random bytes in base64url. */
export const isManageToken = (v: string) => /^[\w-]{32}$/.test(v);

/** Match and profile ids from Microsoft / aoe2companion: plain numbers. */
export const isMatchId = (v: string) => /^\d{1,12}$/.test(v);

/** A list page number from the query string: 1 when missing, null when invalid or past `max`. */
export function parsePage(v: string | null, max = 50): number | null {
  if (v == null || v === "") return 1;
  if (!/^\d{1,3}$/.test(v)) return null;
  const n = Number(v);
  return n >= 1 && n <= max ? n : null;
}

export const NOTE_MAX = 140;
export const TITLE_MAX = 80;
/** Longest match a saved moment can point into: a day of game time. */
const MAX_SECOND = 86_400;

/** One line of user text: no control characters (NUL can't go in Postgres), trimmed, at most `max`. */
export function cleanLine(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const line = v.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
  return line.length > 0 && line.length <= max ? line : null;
}

export type FavoriteKind = "match" | "replay";
export type FavoriteInput = { kind: FavoriteKind; targetId: string; second: number; note: string | null };

/** A favorite or saved moment from a request body, or null if anything is off. */
export function parseFavorite(body: Record<string, unknown> | null): FavoriteInput | null {
  if (!body) return null;
  const { kind, targetId, second = 0, note = null } = body;
  if (kind !== "match" && kind !== "replay") return null;
  if (typeof targetId !== "string" || !(kind === "match" ? isMatchId(targetId) : isReplayId(targetId))) return null;
  if (typeof second !== "number" || !Number.isInteger(second) || second < 0 || second > MAX_SECOND) return null;
  if (note !== null && note !== "" && cleanLine(note, NOTE_MAX) === null) return null;
  return { kind, targetId, second, note: note ? cleanLine(note, NOTE_MAX) : null };
}

/** Session cookies carry 32 random bytes in base64url. */
export const isSessionToken = (v: string) => /^[\w-]{43}$/.test(v);

export const PASSWORD_MIN = 8;
// Long enough for any password manager; keeps megabytes away from the hash.
export const PASSWORD_MAX = 200;

export const isValidPassword = (v: unknown): v is string =>
  typeof v === "string" && v.length >= PASSWORD_MIN && v.length <= PASSWORD_MAX;

/** Lowercased email, or null if it can't be one. Whether it exists is not checked. */
export function normalizeEmail(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const email = v.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email) ? email : null;
}

/** A path on this site to go to after logging in. Anything else could send the user elsewhere. */
export function safeNextPath(v: string | null | undefined): string {
  return v && /^\/(?![/\\])[^\\\s]*$/.test(v) ? v : "/";
}

/**
 * Whether a state-changing request comes from a page of this site. Browsers
 * always send Origin on POST/PATCH/DELETE and pages can't forge it or Host.
 */
export function isSameOrigin(origin: string | null, allowedHosts: Array<string | null | undefined>): boolean {
  if (!origin) return false;
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }
  return allowedHosts.some((allowed) => allowed === host);
}

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
  registrationsPerHour: envInt("REGISTRATIONS_PER_HOUR", 10),
  loginsPerWindow: envInt("LOGINS_PER_15_MINUTES", 20),
  maxFollows: envInt("MAX_FOLLOWS", 20),
  notificationChecksPerMinute: envInt("NOTIFICATION_CHECKS_PER_MINUTE", 120),
};
