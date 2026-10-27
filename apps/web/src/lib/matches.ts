// Online matches: download the replay from Microsoft, parse it and store it
// once per match id. Matches are public, so there is no access token.
import { unzipSync } from "fflate";
import { db } from "@/lib/db";
import { MAX_UPLOAD_BYTES, parseReplay } from "@/lib/parser";
import { storedGame } from "@/lib/replays";

const REPLAY_URL = "https://api.ageofempires.com/api/GameStats/AgeII/GetMatchReplay/";
const MAX_ZIP_BYTES = MAX_UPLOAD_BYTES;
const MAX_REPLAY_BYTES = 60 * 1024 * 1024; // uncompressed, guards against zip bombs

export const isMatchId = (v: string) => /^\d{1,12}$/.test(v);

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
  return row?.data ?? null;
}

async function readCapped(res: Response, max: number): Promise<Uint8Array> {
  const reader = res.body?.getReader();
  if (!reader) throw new ImportError(502, "replay_unavailable", "Microsoft no devolvió el replay.");
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > max) {
      await reader.cancel();
      throw new ImportError(413, "too_large", "El replay es demasiado grande.");
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
  const url = `${REPLAY_URL}?gameId=${matchId}&profileId=${profileId}&matchId=${matchId}`;
  let res: Response;
  try {
    res = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(30_000) });
  } catch {
    throw new ImportError(502, "replay_unavailable", "No se pudo conectar con el servicio de replays de Microsoft.");
  }
  if (!res.ok) {
    throw new ImportError(404, "replay_unavailable", "Microsoft no tiene el replay de esta partida (puede haber expirado).");
  }
  const zip = await readCapped(res, MAX_ZIP_BYTES);
  if (zip[0] !== 0x50 || zip[1] !== 0x4b) {
    throw new ImportError(404, "replay_unavailable", "Microsoft no tiene el replay de esta partida (puede haber expirado).");
  }
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(zip, {
      filter: (f) => f.name.toLowerCase().endsWith(".aoe2record") && f.originalSize <= MAX_REPLAY_BYTES,
    });
  } catch {
    throw new ImportError(422, "corrupt_replay", "El archivo de Microsoft está dañado.");
  }
  const replay = Object.values(files)[0];
  if (!replay) throw new ImportError(422, "corrupt_replay", "El archivo de Microsoft no contiene un replay.");
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
