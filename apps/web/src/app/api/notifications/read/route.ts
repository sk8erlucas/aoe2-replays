// POST { matchId }: marks one notification as read. POST { all: true }: all of them.
import { NextResponse } from "next/server";
import { currentSession, rejectCrossSite, unauthorized } from "@/lib/auth";
import { db } from "@/lib/db";
import { apiError, readJson, withErrors } from "@/lib/http";
import { isMatchId } from "@/lib/validate";

export async function POST(request: Request) {
  return withErrors(async () => {
    const refused = rejectCrossSite(request);
    if (refused) return refused;
    const session = await currentSession();
    if (!session) return unauthorized();
    const body = await readJson(request);
    const matchId = String(body?.matchId ?? "");
    if (body?.all !== true && !isMatchId(matchId)) return apiError(400, "bad_request", "Missing match id.");
    await db().notification.updateMany({
      where: { userId: session.user.id, readAt: null, ...(body?.all === true ? {} : { matchId }) },
      data: { readAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  });
}
