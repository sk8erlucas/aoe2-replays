// Stored replays: id and token generation, access checks, limits and expiry.
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { gzipSync } from "node:zlib";
import type { ReplayData } from "@aoe2-replays/shared";
import { db } from "@/lib/db";
import { envInt, isManageToken, isReplayId } from "@/lib/validate";

const TTL_DAYS = envInt("REPLAY_TTL_DAYS", 30);
const UPLOADS_PER_HOUR = envInt("UPLOADS_PER_HOUR", 20);
/** Replays an account can keep (they don't expire). 0 = no limit. */
export const MAX_ACCOUNT_REPLAYS = envInt("MAX_ACCOUNT_REPLAYS", 200);

export const TOKEN_HEADER = "x-manage-token";

const randomId = () => randomBytes(16).toString("base64url");
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

// The client can write any X-Forwarded-For it wants, so only trust what the
// reverse proxy (Traefik) adds: X-Real-IP, or the last X-Forwarded-For entry.
export function clientIp(request: Request): string | null {
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim();
  return forwarded || null;
}

export function hashIp(request: Request): string | null {
  const ip = clientIp(request);
  if (!ip) return null;
  const secret = process.env.IP_HASH_SECRET ?? "dev-only-secret";
  return createHmac("sha256", secret).update(ip).digest("hex");
}

export async function uploadsLastHour(ipHash: string): Promise<number> {
  return db().replay.count({
    where: { uploaderIpHash: ipHash, createdAt: { gte: new Date(Date.now() - 3600_000) } },
  });
}

export async function userUploadsLastHour(userId: string): Promise<number> {
  return db().replay.count({ where: { userId, createdAt: { gte: new Date(Date.now() - 3600_000) } } });
}

export async function accountReplayCount(userId: string): Promise<number> {
  return db().replay.count({ where: { userId } });
}

export function accountFull(count: number) {
  return MAX_ACCOUNT_REPLAYS > 0 && count >= MAX_ACCOUNT_REPLAYS;
}

export function uploadLimitReached(count: number) {
  return UPLOADS_PER_HOUR > 0 && count >= UPLOADS_PER_HOUR;
}

export async function deleteExpired() {
  await db().replay.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}

/**
 * Stores a parsed replay. Returns the public id and the secret management token.
 * With `userId` it belongs to that account and never expires.
 */
export async function createReplay(
  data: ReplayData,
  raw: string,
  fileName: string,
  ipHash: string | null,
  userId: string | null = null,
) {
  const id = randomId();
  const token = randomBytes(24).toString("base64url");
  await db().replay.create({
    data: {
      id,
      manageTokenHash: sha256(token),
      expiresAt: !userId && TTL_DAYS > 0 ? new Date(Date.now() + TTL_DAYS * 86400_000) : null,
      uploaderIpHash: ipHash,
      userId,
      fileName: fileName.replaceAll("\0", "").slice(0, 200), // Postgres text cannot hold NUL
      ...storedGame(data, raw),
    },
  });
  return { id, token };
}

/** Columns shared by uploaded replays and imported matches. */
export function storedGame(data: ReplayData, raw: string) {
  const gz = gzipSync(raw);
  return {
    schemaVersion: data.schema_version,
    gameVersion: data.game.game_version,
    saveVersion: data.game.save_version,
    mapName: data.map.name,
    mapSize: data.map.size,
    durationMs: data.game.duration_ms,
    players: data.game.players.map((p) => ({
      number: p.number,
      name: p.name,
      civilization: p.civilization,
      color_id: p.color_id,
      team_id: p.team_id,
    })),
    data: gz,
    dataBytes: gz.length,
  };
}

function tokenMatches(token: string | null, hash: string) {
  if (!token || !isManageToken(token)) return false;
  const a = Buffer.from(sha256(token), "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

const notExpired = () => ({ OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] });

/**
 * Loads a replay if the caller may see it: public replays for anyone,
 * private ones only with the management token or to the account that owns it.
 * Otherwise null, so a private replay is indistinguishable from a missing one.
 */
export async function findVisibleReplay(id: string, token: string | null, userId: string | null = null) {
  if (!isReplayId(id)) return null;
  const replay = await db().replay.findFirst({ where: { id, ...notExpired() }, omit: { data: true } });
  if (!replay) return null;
  const tokenValid = tokenMatches(token, replay.manageTokenHash);
  const inAccount = userId != null && replay.userId === userId;
  const canManage = tokenValid || inAccount;
  if (!replay.isPublic && !canManage) return null;
  return { replay, canManage, tokenValid, inAccount };
}

/** The stored gzip JSON. Call only after an access check. */
export async function replayData(id: string) {
  const row = await db().replay.findUnique({ where: { id }, select: { data: true } });
  return row?.data ?? null;
}

/** The replay if the caller may change it: management token, or the owning account. */
export async function findManagedReplay(id: string, token: string | null, userId: string | null = null) {
  if (!isReplayId(id)) return null;
  const replay = await db().replay.findFirst({ where: { id, ...notExpired() }, omit: { data: true } });
  if (!replay) return null;
  if (tokenMatches(token, replay.manageTokenHash) || (userId != null && replay.userId === userId)) return replay;
  return null;
}

/** The account's replays, newest first (no data). */
export async function accountReplays(userId: string) {
  return db().replay.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { id: true, isPublic: true, createdAt: true, fileName: true, title: true, mapName: true, durationMs: true, players: true },
  });
}
