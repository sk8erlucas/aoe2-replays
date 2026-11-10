// GET: replay metadata. PATCH: change visibility, or save it to the account.
// DELETE: remove it. PATCH and DELETE need the management token in the
// x-manage-token header, or the owning account (from this site only).
import { NextResponse } from "next/server";
import { currentSession, sameSiteUserId, unauthorized } from "@/lib/auth";
import { db } from "@/lib/db";
import { apiError, readJson, withErrors } from "@/lib/http";
import {
  TOKEN_HEADER,
  accountFull,
  accountReplayCount,
  findManagedReplay,
  findVisibleReplay,
} from "@/lib/replays";

type Context = { params: Promise<{ id: string }> };

const NOT_FOUND = () => apiError(404, "not_found", "The replay does not exist, has expired or is private.");

export async function GET(request: Request, context: Context) {
  return withErrors(() => show(request, context));
}

export async function PATCH(request: Request, context: Context) {
  return withErrors(() => update(request, context));
}

export async function DELETE(request: Request, context: Context) {
  return withErrors(() => remove(request, context));
}

async function show(request: Request, { params }: Context) {
  const { id } = await params;
  const session = await currentSession();
  const found = await findVisibleReplay(id, request.headers.get(TOKEN_HEADER), session?.user.id ?? null);
  if (!found) return NOT_FOUND();
  const { replay, canManage, tokenValid, inAccount } = found;
  return NextResponse.json({
    id: replay.id,
    isPublic: replay.isPublic,
    canManage,
    tokenValid,
    inAccount,
    fileName: canManage ? replay.fileName : null,
    createdAt: replay.createdAt,
    expiresAt: replay.expiresAt,
    mapName: replay.mapName,
    durationMs: replay.durationMs,
    players: replay.players,
  });
}

async function update(request: Request, { params }: Context) {
  const { id } = await params;
  const userId = await sameSiteUserId(request);
  const replay = await findManagedReplay(id, request.headers.get(TOKEN_HEADER), userId);
  if (!replay) return NOT_FOUND();
  const body = await readJson(request);
  if (body?.saveToAccount === true) {
    // Claiming needs the account (this site only) and the token or ownership already checked above.
    if (!userId) return unauthorized();
    if (replay.userId === userId) return NextResponse.json({ id, inAccount: true });
    if (replay.userId) return NOT_FOUND();
    if (accountFull(await accountReplayCount(userId))) {
      return apiError(409, "account_full", "Your account has reached its replay limit. Delete some first.");
    }
    await db().replay.update({ where: { id }, data: { userId, expiresAt: null } });
    return NextResponse.json({ id, inAccount: true });
  }
  if (typeof body?.isPublic !== "boolean") return apiError(400, "bad_request", "Missing isPublic (true/false).");
  await db().replay.update({ where: { id }, data: { isPublic: body.isPublic } });
  return NextResponse.json({ id, isPublic: body.isPublic });
}

async function remove(request: Request, { params }: Context) {
  const { id } = await params;
  const replay = await findManagedReplay(id, request.headers.get(TOKEN_HEADER), await sameSiteUserId(request));
  if (!replay) return NOT_FOUND();
  await db().replay.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
