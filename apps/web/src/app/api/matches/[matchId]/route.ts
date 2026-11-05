// GET: stored match metadata. POST { profileId }: download and store it.
import { NextResponse } from "next/server";
import { apiError, withErrors } from "@/lib/http";
import { ImportError, findMatch, importMatch, isMatchId } from "@/lib/matches";
import { allow, hasRoom } from "@/lib/ratelimit";
import { hashIp } from "@/lib/replays";
import { LIMITS } from "@/lib/validate";

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
    if (!m) return apiError(404, "not_found", "This match has not been downloaded yet.");
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
    return apiError(400, "bad_request", "Missing match id or player id.");
  }
  const existing = await findMatch(matchId);
  if (existing) return NextResponse.json(meta(existing));
  const hour = 3600_000;
  // The global limit is checked first, so a full site does not use up anyone's own quota.
  if (!hasRoom("import:all", LIMITS.importsPerHourGlobal, hour)) {
    return apiError(503, "busy", "Too many match downloads on the site right now. Try again later.");
  }
  if (!allow(`import:${hashIp(request) ?? "local"}`, LIMITS.importsPerHour, hour)) {
    return apiError(429, "rate_limited", "Too many match downloads in the last hour. Try again later.");
  }
  allow("import:all", LIMITS.importsPerHourGlobal, hour);
  try {
    await importMatch(matchId, profileId);
  } catch (err) {
    if (err instanceof ImportError) return apiError(err.status, err.code, err.message);
    return apiError(500, "import_failed", "Could not download the match.");
  }
  const m = await findMatch(matchId);
  return m ? NextResponse.json(meta(m), { status: 201 }) : apiError(500, "import_failed", "Could not store the match.");
}
