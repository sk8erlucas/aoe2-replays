// DELETE: removes one of the account's favorites or saved moments.
import { NextResponse } from "next/server";
import { currentSession, rejectCrossSite, unauthorized } from "@/lib/auth";
import { db } from "@/lib/db";
import { apiError, withErrors } from "@/lib/http";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withErrors(async () => {
    const refused = rejectCrossSite(request);
    if (refused) return refused;
    const session = await currentSession();
    if (!session) return unauthorized();
    const { id } = await params;
    if (!/^[\w-]{11}$/.test(id)) return apiError(404, "not_found", "Not found.");
    const { count } = await db().favorite.deleteMany({ where: { id, userId: session.user.id } });
    return count ? NextResponse.json({ ok: true }) : apiError(404, "not_found", "Not found.");
  });
}
