// GET: stored match metadata. POST { profileId }: download and store it.
import { NextResponse } from "next/server";
import { apiError, withErrors } from "@/lib/http";
import { ImportError, findMatch, importMatch, isMatchId } from "@/lib/matches";
import { allow } from "@/lib/ratelimit";
import { hashIp } from "@/lib/replays";

type Context = { params: Promise<{ matchId: string }> };

function meta(m: NonNullable<Awaited<ReturnType<typeof findMatch>>>) {
  return {
    id: m.id,
    importedAt: m.importedAt,
    mapName: m.mapName,
    durationMs: m.durationMs,
    players: m.players,
  };
}

export async function GET(_request: Request, { params }: Context) {
  return withErrors(async () => {
    const { matchId } = await params;
    const m = isMatchId(matchId) ? await findMatch(matchId) : null;
    if (!m) return apiError(404, "not_found", "Esta partida todavía no fue descargada.");
    return NextResponse.json(meta(m));
  });
}

export async function POST(request: Request, context: Context) {
  return withErrors(() => importRoute(request, context));
}

async function importRoute(request: Request, { params }: Context) {
  const { matchId } = await params;
  const body = await request.json().catch(() => null);
  const profileId = String(body?.profileId ?? "");
  if (!isMatchId(matchId) || !isMatchId(profileId)) {
    return apiError(400, "bad_request", "Faltan el número de partida o el jugador.");
  }
  const existing = await findMatch(matchId);
  if (existing) return NextResponse.json(meta(existing));
  if (!allow(`import:${hashIp(request) ?? "local"}`, 20, 3600_000)) {
    return apiError(429, "rate_limited", "Descargaste muchas partidas en la última hora. Probá más tarde.");
  }
  try {
    await importMatch(matchId, profileId);
  } catch (err) {
    if (err instanceof ImportError) return apiError(err.status, err.code, err.message);
    return apiError(500, "import_failed", "No se pudo descargar la partida.");
  }
  const m = await findMatch(matchId);
  return m ? NextResponse.json(meta(m), { status: 201 }) : apiError(500, "import_failed", "No se pudo guardar la partida.");
}
