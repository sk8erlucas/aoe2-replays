// POST { email, password }: creates an account and logs in.
import { NextResponse } from "next/server";
import { newUserId, publicAccount, rejectCrossSite, startSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { apiError, readJson, withErrors } from "@/lib/http";
import { hashPassword } from "@/lib/password";
import { allow } from "@/lib/ratelimit";
import { hashIp } from "@/lib/replays";
import { LIMITS, isValidPassword, normalizeEmail } from "@/lib/validate";

export async function POST(request: Request) {
  return withErrors(async () => {
    const refused = rejectCrossSite(request);
    if (refused) return refused;
    if (!allow(`register:${hashIp(request) ?? "local"}`, LIMITS.registrationsPerHour, 3600_000)) {
      return apiError(429, "rate_limited", "Too many accounts created in the last hour.");
    }
    const body = await readJson(request);
    const email = normalizeEmail(body?.email);
    if (!email) return apiError(400, "invalid_email", "That email doesn't look right.");
    if (!isValidPassword(body?.password)) return apiError(400, "weak_password", "The password has the wrong length.");
    const passwordHash = await hashPassword(body.password);
    let user;
    try {
      user = await db().user.create({ data: { id: newUserId(), email, passwordHash } });
    } catch (err) {
      if ((err as { code?: string }).code === "P2002") return apiError(409, "email_taken", "That email already has an account.");
      throw err;
    }
    return startSession(user.id, NextResponse.json(publicAccount(user), { status: 201 }));
  });
}
