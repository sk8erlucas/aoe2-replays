// Online matches: download the replay from Microsoft, parse it and store it
// once per match id. Matches are public, so there is no access token.
import { db } from "@/lib/db";
import { MAX_UPLOAD_BYTES, parseReplay } from "@/lib/parser";
import { storedGame } from "@/lib/replays";
import { extractReplay, replayUrl } from "@/lib/replayZip";
import { envInt } from "@/lib/validate";

const MAX_ZIP_BYTES = MAX_UPLOAD_BYTES;
// Anyone can make the site store a match (~230 KB), so the ones nobody opens go.
const MATCH_TTL_DAYS = envInt("MATCH_TTL_DAYS", 90);
const DAY_MS = 86400_000;

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

export async function matchData(id: string) {
  const row = await db().match.findUnique({ where: { id }, select: { data: true } });
  if (row) void markViewed(id);
  return row?.data ?? null;
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

const inFlight = new Map<string, Promise<void>>();

/** Downloads, parses and stores a match unless it is already stored. */
export async function importMatch(matchId: string, profileId: string): Promise<void> {
  if (await findMatch(matchId)) return;
  const running = inFlight.get(matchId);
  if (running) return running;
  const job = (async () => {
    const replay = await download(matchId, profileId);
    const parsed = await parseReplay(new Blob([replay as BlobPart]));
    if (!parsed.ok) throw new ImportError(parsed.status, parsed.code, parsed.message);
    await db().match.upsert({
      where: { id: matchId },
      create: { id: matchId, sourceProfileId: profileId, ...storedGame(parsed.data, parsed.raw) },
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
