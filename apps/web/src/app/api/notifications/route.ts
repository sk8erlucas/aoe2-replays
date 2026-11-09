// GET: the bell's content, after looking for new matches.
import { NextResponse } from "next/server";
import { currentSession, unauthorized } from "@/lib/auth";
import { db } from "@/lib/db";
import { withErrors } from "@/lib/http";
import { listNotifications, syncNotifications } from "@/lib/notifications";

export async function GET() {
  return withErrors(async () => {
    const session = await currentSession();
    if (!session) return unauthorized();
    const { user } = session;
    // If aoe2companion is down the bell still shows what it already has.
    await syncNotifications(user).catch((err) => console.error("could not check for new matches", err));
    const [list, follows] = await Promise.all([
      listNotifications(user.id),
      db().followedPlayer.count({ where: { userId: user.id } }),
    ]);
    return NextResponse.json({ ...list, watching: Boolean(user.aoeProfileId) || follows > 0 });
  });
}
