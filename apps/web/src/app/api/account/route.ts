// GET: the logged-in account. PATCH { profileId | null }: links or unlinks the
// player. DELETE { password }: deletes the account and everything tied to it.
import { NextResponse } from "next/server";
import { getProfile } from "@/lib/aoe2companion";
import { clearSessionCookie, currentSession, publicAccount, rejectCrossSite, unauthorized } from "@/lib/auth";
import { db } from "@/lib/db";
import { apiError, readJson, withErrors } from "@/lib/http";
import { verifyPassword } from "@/lib/password";
import { allow } from "@/lib/ratelimit";
import { isMatchId } from "@/lib/validate";

export async function GET() {
  return withErrors(async () => {
    const session = await currentSession();
    return session ? NextResponse.json(publicAccount(session.user)) : unauthorized();
  });
}

export async function PATCH(request: Request) {
  return withErrors(async () => {
    const refused = rejectCrossSite(request);
    if (refused) return refused;
    const session = await currentSession();
    if (!session) return unauthorized();
    const userId = session.user.id;
    const body = await readJson(request);
    if (!body || !("profileId" in body)) return apiError(400, "bad_request", "Missing profile id.");

    // Notifications about the previous player make no sense for the new one.
    const forgetMine = db().notification.deleteMany({ where: { userId, mine: true } });
    if (body.profileId === null) {
      const [user] = await db().$transaction([
        db().user.update({ where: { id: userId }, data: { aoeProfileId: null, aoeProfileName: null, aoeLinkedAt: null } }),
        forgetMine,
      ]);
      return NextResponse.json(publicAccount(user));
    }

    const profileId = String(body.profileId);
    if (!isMatchId(profileId)) return apiError(400, "bad_request", "Invalid profile id.");
    if (!allow(`account:${userId}`, 60, 60_000)) return apiError(429, "rate_limited", "Too many changes. Try again later.");
    let name: string;
    try {
      name = (await getProfile(Number(profileId))).name.replaceAll("\0", "");
    } catch {
      return apiError(502, "source_unavailable", "Could not look up that player.");
    }
    const [user] = await db().$transaction([
      db().user.update({
        where: { id: userId },
        data: { aoeProfileId: profileId, aoeProfileName: name, aoeLinkedAt: new Date(), notificationsCheckedAt: null },
      }),
      forgetMine,
    ]);
    return NextResponse.json(publicAccount(user));
  });
}

export async function DELETE(request: Request) {
  return withErrors(async () => {
    const refused = rejectCrossSite(request);
    if (refused) return refused;
    const session = await currentSession();
    if (!session) return unauthorized();
    if (!allow(`account-delete:${session.user.id}`, 10, 3600_000)) {
      return apiError(429, "rate_limited", "Too many attempts. Try again later.");
    }
    const body = await readJson(request);
    const password = typeof body?.password === "string" ? body.password : "";
    if (!(await verifyPassword(password, session.user.passwordHash))) {
      return apiError(403, "wrong_password", "Wrong password.");
    }
    // Sessions, follows and notifications go with it (ON DELETE CASCADE).
    await db().user.delete({ where: { id: session.user.id } });
    return clearSessionCookie(NextResponse.json({ ok: true }));
  });
}
