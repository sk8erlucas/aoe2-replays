// GET: replay metadata. PATCH: change visibility. DELETE: remove it.
// PATCH and DELETE need the management token in the x-manage-token header.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/http";
import { TOKEN_HEADER, findManagedReplay, findVisibleReplay } from "@/lib/replays";

type Context = { params: Promise<{ id: string }> };

const NOT_FOUND = () => apiError(404, "not_found", "The replay does not exist, has expired or is private.");

export async function GET(request: Request, { params }: Context) {
  const { id } = await params;
  const found = await findVisibleReplay(id, request.headers.get(TOKEN_HEADER));
  if (!found) return NOT_FOUND();
  const { replay, canManage } = found;
  return NextResponse.json({
    id: replay.id,
    isPublic: replay.isPublic,
    canManage,
    fileName: canManage ? replay.fileName : null,
    createdAt: replay.createdAt,
    expiresAt: replay.expiresAt,
    mapName: replay.mapName,
    durationMs: replay.durationMs,
    players: replay.players,
  });
}

export async function PATCH(request: Request, { params }: Context) {
  const { id } = await params;
  const replay = await findManagedReplay(id, request.headers.get(TOKEN_HEADER));
  if (!replay) return NOT_FOUND();
  const body = await request.json().catch(() => null);
  if (typeof body?.isPublic !== "boolean") return apiError(400, "bad_request", "Missing isPublic (true/false).");
  await db().replay.update({ where: { id }, data: { isPublic: body.isPublic } });
  return NextResponse.json({ id, isPublic: body.isPublic });
}

export async function DELETE(request: Request, { params }: Context) {
  const { id } = await params;
  const replay = await findManagedReplay(id, request.headers.get(TOKEN_HEADER));
  if (!replay) return NOT_FOUND();
  await db().replay.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
