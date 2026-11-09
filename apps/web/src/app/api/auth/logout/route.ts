// POST: ends this browser's session.
import { NextResponse } from "next/server";
import { clearSessionCookie, currentSession, rejectCrossSite } from "@/lib/auth";
import { db } from "@/lib/db";
import { withErrors } from "@/lib/http";

export async function POST(request: Request) {
  return withErrors(async () => {
    const refused = rejectCrossSite(request);
    if (refused) return refused;
    const session = await currentSession();
    if (session) await db().session.deleteMany({ where: { tokenHash: session.tokenHash } });
    return clearSessionCookie(NextResponse.json({ ok: true }));
  });
}
