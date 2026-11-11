// Starred matches and replays, and saved moments in them. A favorite only
// points at something: the list re-checks access, so a replay that went
// private (or was deleted) drops out of it without leaking anything.
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { findMatch } from "@/lib/matches";
import { findVisibleReplay } from "@/lib/replays";
import { envInt, type FavoriteInput, type FavoriteKind } from "@/lib/validate";

export const MAX_FAVORITES = envInt("MAX_FAVORITES", 500);

export type FavoriteView = {
  id: string;
  kind: FavoriteKind;
  targetId: string;
  second: number;
  note: string | null;
  title: string;
  createdAt: Date;
};

/** What the browser gets: everything but the user id. */
function view(row: Omit<FavoriteView, "kind"> & { kind: string }): FavoriteView {
  const { id, targetId, second, note, title, createdAt } = row;
  return { id, kind: row.kind as FavoriteKind, targetId, second, note, title, createdAt };
}

/** "Black Forest: Ana, Bruno, …" from the stored columns. */
function titleOf(mapName: string | null, players: unknown): string {
  const names = Array.isArray(players)
    ? players.map((p) => (p && typeof p === "object" && "name" in p ? String(p.name) : "")).filter(Boolean)
    : [];
  return `${mapName ?? "?"}: ${names.join(", ")}`.slice(0, 200);
}

/** The title of what the user wants to save, or null if they can't see it. */
export async function favoriteTarget(kind: FavoriteKind, targetId: string, userId: string): Promise<string | null> {
  if (kind === "match") {
    const match = await findMatch(targetId);
    return match ? titleOf(match.mapName, match.players) : null;
  }
  // No token here on purpose: a private replay can only be saved by its owner account.
  const found = await findVisibleReplay(targetId, null, userId);
  return found ? titleOf(found.replay.mapName, found.replay.players) : null;
}

export async function listFavorites(userId: string): Promise<FavoriteView[]> {
  const rows = await db().favorite.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
  const replayIds = rows.filter((r) => r.kind === "replay").map((r) => r.targetId);
  const visible = new Set(
    replayIds.length === 0
      ? []
      : (
          await db().replay.findMany({
            where: {
              id: { in: replayIds },
              AND: [{ OR: [{ isPublic: true }, { userId }] }, { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }],
            },
            select: { id: true },
          })
        ).map((r) => r.id),
  );
  return rows
    .filter((r) => r.kind === "match" || visible.has(r.targetId))
    .map(view);
}

export type AddResult = { ok: true; favorite: FavoriteView } | { ok: false; status: number; code: string; message: string };

export async function addFavorite(userId: string, input: FavoriteInput): Promise<AddResult> {
  const where = { userId_kind_targetId_second: { userId, kind: input.kind, targetId: input.targetId, second: input.second } };
  const existing = await db().favorite.findUnique({ where });
  if (existing) {
    // Saving the same moment again updates its note.
    const favorite =
      input.note !== existing.note && input.second > 0
        ? await db().favorite.update({ where, data: { note: input.note } })
        : existing;
    return { ok: true, favorite: view(favorite) };
  }
  if (MAX_FAVORITES > 0 && (await db().favorite.count({ where: { userId } })) >= MAX_FAVORITES) {
    return { ok: false, status: 409, code: "favorites_full", message: "You have as many favorites as allowed." };
  }
  const title = await favoriteTarget(input.kind, input.targetId, userId);
  if (!title) return { ok: false, status: 404, code: "not_found", message: "Not found." };
  const favorite = await db().favorite.create({
    data: { id: randomBytes(8).toString("base64url"), userId, ...input, title },
  });
  return { ok: true, favorite: view(favorite) };
}
