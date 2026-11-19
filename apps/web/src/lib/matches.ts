// Online matches: download the replay from Microsoft, parse it and store it
// once per match id. Matches are public, so there is no access token.
import { getMatch } from "@/lib/aoe2companion";
import { db } from "@/lib/db";
import { MAX_UPLOAD_BYTES, parseReplay } from "@/lib/parser";
import { storedGame } from "@/lib/replays";
import { extractReplay, replayUrl } from "@/lib/replayZip";
import { allow } from "@/lib/ratelimit";
import { LIMITS, envInt } from "@/lib/validate";

const MAX_ZIP_BYTES = MAX_UPLOAD_BYTES;
// Anyone can make the site store a match (~230 KB), so the ones nobody opens go.
const MATCH_TTL_DAYS = envInt("MATCH_TTL_DAYS", 90);
const DAY_MS = 86400_000;
/**
 * Bump when the parser starts giving data worth downloading a stored match
 * again for: matches stored with an older one are refreshed when opened (see
 * refreshMatch). 1: resource_totals (19/11/2026).
 */
export const MATCH_PARSER_REVISION = 1;
// Longest a viewer waits for a refresh before getting the stored copy.
const REFRESH_WAIT_MS = 20_000;

export { isMatchId } from "@/lib/validate";

export class ImportError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function findMatch(id: string) {
  return db().match.findUnique({ where: { id }, omit: { data: true } });
}

/** The stored parser JSON (gzip) and whether it is from the current parser revision. */
export async function matchData(id: string): Promise<{ data: Uint8Array; current: boolean } | null> {
  const row = await db().match.findUnique({ where: { id }, select: { data: true, parserRevision: true, sourceProfileId: true } });
  if (!row) return null;
  void markViewed(id);
  if (row.parserRevision >= MATCH_PARSER_REVISION) return { data: row.data, current: true };
  const fresh = await refreshMatch(id, row.sourceProfileId);
  return fresh ? { data: fresh, current: true } : { data: row.data, current: false };
}

const refreshing = new Map<string, Promise<Uint8Array | null>>();

/**
 * Downloads and parses a stored match again with the current parser, and
 * stores it. Null (the stored copy stays) if Microsoft can't be reached, the
 * site is busy, or it takes too long; a refresh still running then finishes
 * for the next visit. If Microsoft no longer has the replay (kept ~4 months),
 * the match is marked as refreshed so it isn't tried on every visit.
 */
async function refreshMatch(id: string, profileId: string): Promise<Uint8Array | null> {
  let job = refreshing.get(id);
  if (!job) {
    if (!allow("import:all", LIMITS.importsPerHourGlobal, 3600_000)) return null;
    job = (async () => {
      try {
        const { replay } = await downloadAny(id, profileId);
        const parsed = await parseReplay(new Blob([replay as BlobPart]));
        if (!parsed.ok) {
          await markRevision(id);
          return null;
        }
        const stored = storedGame(parsed.data, parsed.raw);
        await db().match.update({ where: { id }, data: { ...stored, parserRevision: MATCH_PARSER_REVISION } });
        return stored.data;
      } catch (err) {
        if (err instanceof ImportError && err.status === 404) await markRevision(id);
        else console.error("could not refresh match", id, err);
        return null;
      } finally {
        refreshing.delete(id);
      }
    })();
    refreshing.set(id, job);
  }
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), REFRESH_WAIT_MS));
  return Promise.race([job, timeout]);
}

async function markRevision(id: string) {
  await db()
    .match.update({ where: { id }, data: { parserRevision: MATCH_PARSER_REVISION } })
    .catch((err) => console.error("could not mark match revision", id, err));
}

// At most one write per match and day: the condition makes repeat views a no-op.
async function markViewed(id: string) {
  const now = new Date();
  await db()
    .match.updateMany({ where: { id, lastViewedAt: { lt: new Date(now.getTime() - DAY_MS) } }, data: { lastViewedAt: now } })
    .catch((err) => console.error("could not mark match as viewed", err));
}

/** Deletes matches nobody opened in MATCH_TTL_DAYS (0 keeps them forever). */
export async function deleteStaleMatches() {
  if (MATCH_TTL_DAYS <= 0) return;
  await db().match.deleteMany({ where: { lastViewedAt: { lt: new Date(Date.now() - MATCH_TTL_DAYS * DAY_MS) } } });
}

async function readCapped(res: Response, max: number): Promise<Uint8Array> {
  const reader = res.body?.getReader();
  if (!reader) throw new ImportError(502, "replay_unavailable", "Microsoft returned no replay.");
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > max) {
      await reader.cancel();
      throw new ImportError(413, "too_large", "The replay is too large.");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

async function download(matchId: string, profileId: string): Promise<Uint8Array> {
  const url = replayUrl(matchId, profileId);
  if (!url) throw new ImportError(400, "bad_request", "Invalid match or player id.");
  let res: Response;
  try {
    res = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(30_000) });
  } catch {
    throw new ImportError(502, "replay_unavailable", "Could not reach Microsoft's replay service.");
  }
  if (!res.ok) {
    throw new ImportError(404, "replay_unavailable", "Microsoft has no replay for this match (it may have expired).");
  }
  const zip = await readCapped(res, MAX_ZIP_BYTES);
  if (zip[0] !== 0x50 || zip[1] !== 0x4b) {
    throw new ImportError(404, "replay_unavailable", "Microsoft has no replay for this match (it may have expired).");
  }
  let replay: Uint8Array | null;
  try {
    replay = extractReplay(zip);
  } catch {
    throw new ImportError(422, "corrupt_replay", "The file from Microsoft is damaged.");
  }
  if (!replay) throw new ImportError(422, "corrupt_replay", "The file from Microsoft contains no replay.");
  return replay;
}

// Each player's game uploads its own copy, and some are missing (in two 4v4s
// tested on 12/11/2026, 3 and 4 of 8 copies gave 404 while the rest were there).
const MAX_OTHER_COPIES = 7;

/** The given player's copy, or else the first copy found among the other players of the match. */
async function downloadAny(matchId: string, profileId: string): Promise<{ replay: Uint8Array; source: string }> {
  try {
    return { replay: await download(matchId, profileId), source: profileId };
  } catch (err) {
    if (!(err instanceof ImportError && err.code === "replay_unavailable" && err.status === 404)) throw err;
    const match = await getMatch(Number(matchId)).catch(() => null);
    const others = (match?.teams ?? [])
      .flatMap((team) => team.players.map((p) => p.profileId))
      .filter((id): id is number => id != null && String(id) !== profileId)
      .slice(0, MAX_OTHER_COPIES);
    for (const id of others) {
      try {
        return { replay: await download(matchId, String(id)), source: String(id) };
      } catch (other) {
        if (!(other instanceof ImportError && other.code === "replay_unavailable" && other.status === 404)) throw other;
      }
    }
    throw err;
  }
}

const inFlight = new Map<string, Promise<void>>();

/** Downloads, parses and stores a match unless it is already stored. */
export async function importMatch(matchId: string, profileId: string): Promise<void> {
  if (await findMatch(matchId)) return;
  const running = inFlight.get(matchId);
  if (running) return running;
  const job = (async () => {
    const { replay, source } = await downloadAny(matchId, profileId);
    const parsed = await parseReplay(new Blob([replay as BlobPart]));
    if (!parsed.ok) throw new ImportError(parsed.status, parsed.code, parsed.message);
    await db().match.upsert({
      where: { id: matchId },
      create: { id: matchId, sourceProfileId: source, parserRevision: MATCH_PARSER_REVISION, ...storedGame(parsed.data, parsed.raw) },
      update: {},
    });
  })();
  inFlight.set(matchId, job);
  try {
    await job;
  } finally {
    inFlight.delete(matchId);
  }
}
