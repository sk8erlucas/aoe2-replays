// POST { current, next }: changes the password and closes every other session.
import { NextResponse } from "next/server";
import { currentSession, rejectCrossSite, unauthorized } from "@/lib/auth";
import { db } from "@/lib/db";
import { apiError, readJson, withErrors } from "@/lib/http";
import { hashPassword, verifyPassword } from "@/lib/password";
import { allow } from "@/lib/ratelimit";
import { isValidPassword } from "@/lib/validate";

export async function POST(request: Request) {
  return withErrors(async () => {
    const refused = rejectCrossSite(request);
    if (refused) return refused;
    const session = await currentSession();
    if (!session) return unauthorized();
    const userId = session.user.id;
    if (!allow(`password:${userId}`, 10, 3600_000)) return apiError(429, "rate_limited", "Too many attempts. Try again later.");
    const body = await readJson(request);
    if (!isValidPassword(body?.next)) return apiError(400, "weak_password", "The password has the wrong length.");
    const current = typeof body?.current === "string" ? body.current : "";
    if (!(await verifyPassword(current, session.user.passwordHash))) {
      return apiError(403, "wrong_password", "Wrong password.");
    }
    const passwordHash = await hashPassword(body.next);
    await db().$transaction([
      db().user.update({ where: { id: userId }, data: { passwordHash } }),
      db().session.deleteMany({ where: { userId, tokenHash: { not: session.tokenHash } } }),
    ]);
    return NextResponse.json({ ok: true });
  });
}
