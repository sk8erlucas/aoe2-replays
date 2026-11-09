// DELETE: stops following a player and drops the notifications about them.
import { NextResponse } from "next/server";
import { currentSession, rejectCrossSite, unauthorized } from "@/lib/auth";
import { db } from "@/lib/db";
import { apiError, withErrors } from "@/lib/http";
import { isMatchId } from "@/lib/validate";

export async function DELETE(request: Request, { params }: { params: Promise<{ profileId: string }> }) {
  return withErrors(async () => {
    const refused = rejectCrossSite(request);
    if (refused) return refused;
    const session = await currentSession();
    if (!session) return unauthorized();
    const { profileId } = await params;
    if (!isMatchId(profileId)) return apiError(404, "not_found", "Player not found.");
    const userId = session.user.id;
    await db().$transaction([
      db().followedPlayer.deleteMany({ where: { userId, profileId } }),
      db().notification.deleteMany({ where: { userId, profileId, mine: false } }),
    ]);
    return NextResponse.json({ ok: true });
  });
}
