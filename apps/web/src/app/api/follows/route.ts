// GET: players the account follows. POST { profileId }: follows one more, up to the limit.
import { NextResponse } from "next/server";
import { getProfile } from "@/lib/aoe2companion";
import { currentSession, rejectCrossSite, unauthorized } from "@/lib/auth";
import { db } from "@/lib/db";
import { apiError, readJson, withErrors } from "@/lib/http";
import { allow } from "@/lib/ratelimit";
import { LIMITS, isMatchId } from "@/lib/validate";

async function list(userId: string) {
  const follows = await db().followedPlayer.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { profileId: true, name: true },
  });
  return { follows, max: LIMITS.maxFollows };
}

export async function GET() {
  return withErrors(async () => {
    const session = await currentSession();
    return session ? NextResponse.json(await list(session.user.id)) : unauthorized();
  });
}

export async function POST(request: Request) {
  return withErrors(async () => {
    const refused = rejectCrossSite(request);
    if (refused) return refused;
    const session = await currentSession();
    if (!session) return unauthorized();
    const userId = session.user.id;
    const body = await readJson(request);
    const profileId = String(body?.profileId ?? "");
    if (!isMatchId(profileId)) return apiError(400, "bad_request", "Invalid profile id.");

    const existing = await db().followedPlayer.findUnique({ where: { userId_profileId: { userId, profileId } } });
    if (existing) return NextResponse.json(await list(userId));
    if ((await db().followedPlayer.count({ where: { userId } })) >= LIMITS.maxFollows) {
      return apiError(409, "follow_limit", "You follow as many players as allowed.");
    }
    if (!allow(`account:${userId}`, 60, 60_000)) return apiError(429, "rate_limited", "Too many changes. Try again later.");
    let name: string;
    try {
      name = (await getProfile(Number(profileId))).name.replaceAll("\0", "");
    } catch {
      return apiError(502, "source_unavailable", "Could not look up that player.");
    }
    await db().$transaction([
      db().followedPlayer.upsert({
        where: { userId_profileId: { userId, profileId } },
        create: { userId, profileId, name },
        update: {},
      }),
      db().user.update({ where: { id: userId }, data: { notificationsCheckedAt: null } }),
    ]);
    return NextResponse.json(await list(userId), { status: 201 });
  });
}
