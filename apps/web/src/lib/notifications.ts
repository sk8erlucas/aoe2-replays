// The bell: looks up new matches of the linked and followed players while the
// user is on the site. Nothing polls aoe2companion for users who aren't here.
import { getMatches, getMatchesOf } from "@/lib/aoe2companion";
import type { AccountUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  NOTIFICATION_BACKFILL_MS,
  NOTIFICATION_RETENTION_MS,
  pickNotifications,
  type Watched,
} from "@/lib/notificationRules";
import { allow } from "@/lib/ratelimit";
import { LIMITS } from "@/lib/validate";

const CHECK_EVERY_MS = 2 * 60_000;
const MAX_PER_USER = 100;
export const SHOWN = 30;

/** Adds the matches finished since the last check. Failures of the source are the caller's to ignore. */
export async function syncNotifications(user: AccountUser): Promise<void> {
  const now = Date.now();
  const follows = (
    await db().followedPlayer.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } })
  ).slice(0, LIMITS.maxFollows);
  if (!user.aoeProfileId && follows.length === 0) return;
  if (user.notificationsCheckedAt && now - user.notificationsCheckedAt.getTime() < CHECK_EVERY_MS) return;
  if (!allow("notify:all", LIMITS.notificationChecksPerMinute, 60_000)) return;

  // Claimed before calling out, so several open tabs make one request, not one each.
  const claim = await db().user.updateMany({
    where: { id: user.id, notificationsCheckedAt: user.notificationsCheckedAt },
    data: { notificationsCheckedAt: new Date(now) },
  });
  if (claim.count === 0) return;

  // Separate requests: a page of matches shared with busy friends could push the user's own out.
  const [mine, theirs] = await Promise.all([
    user.aoeProfileId ? getMatches(Number(user.aoeProfileId)) : [],
    follows.length > 0 ? getMatchesOf(follows.map((f) => Number(f.profileId))) : [],
  ]);

  const watched: Watched[] = follows.map((f) => ({
    profileId: f.profileId,
    since: f.createdAt.getTime() - NOTIFICATION_BACKFILL_MS,
    mine: false,
  }));
  if (user.aoeProfileId) {
    watched.push({
      profileId: user.aoeProfileId,
      since: (user.aoeLinkedAt?.getTime() ?? now) - NOTIFICATION_BACKFILL_MS,
      mine: true,
    });
  }

  const rows = pickNotifications([...mine, ...theirs], watched, now);
  if (rows.length === 0) return;
  await db().notification.createMany({
    data: rows.map((row) => ({ ...row, userId: user.id })),
    skipDuplicates: true,
  });
  const overflow = await db().notification.findMany({
    where: { userId: user.id },
    orderBy: { finishedAt: "desc" },
    skip: MAX_PER_USER,
    select: { matchId: true },
  });
  if (overflow.length > 0) {
    await db().notification.deleteMany({ where: { userId: user.id, matchId: { in: overflow.map((n) => n.matchId) } } });
  }
}

export async function listNotifications(userId: string) {
  const [items, unread] = await Promise.all([
    db().notification.findMany({ where: { userId }, orderBy: { finishedAt: "desc" }, take: SHOWN }),
    db().notification.count({ where: { userId, readAt: null } }),
  ]);
  return {
    unread,
    items: items.map((n) => ({
      matchId: n.matchId,
      profileId: n.profileId,
      playerName: n.playerName,
      mine: n.mine,
      won: n.won,
      mapName: n.mapName,
      leaderboardName: n.leaderboardName,
      finishedAt: n.finishedAt,
      read: n.readAt !== null,
    })),
  };
}

export async function deleteStaleAccountData() {
  await db().session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await db().notification.deleteMany({ where: { finishedAt: { lt: new Date(Date.now() - NOTIFICATION_RETENTION_MS) } } });
}
