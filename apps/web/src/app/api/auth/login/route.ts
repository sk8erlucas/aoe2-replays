// POST { email, password }: logs in. Same answer for a wrong password and an unknown email.
import { NextResponse } from "next/server";
import { publicAccount, rejectCrossSite, startSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { apiError, readJson, withErrors } from "@/lib/http";
import { burnPasswordCheck, verifyPassword } from "@/lib/password";
import { allow } from "@/lib/ratelimit";
import { hashIp } from "@/lib/replays";
import { LIMITS, PASSWORD_MAX, normalizeEmail } from "@/lib/validate";

const WINDOW_MS = 15 * 60_000;

export async function POST(request: Request) {
  return withErrors(async () => {
    const refused = rejectCrossSite(request);
    if (refused) return refused;
    const body = await readJson(request);
    const email = normalizeEmail(body?.email);
    const password = typeof body?.password === "string" ? body.password : "";
    // Per address too: guessing one account's password from many IPs is the attack that matters.
    if (
      !allow(`login:${hashIp(request) ?? "local"}`, LIMITS.loginsPerWindow, WINDOW_MS) ||
      (email && !allow(`login:${email}`, LIMITS.loginsPerWindow, WINDOW_MS))
    ) {
      return apiError(429, "rate_limited", "Too many attempts. Try again later.");
    }
    const invalid = () => apiError(401, "invalid_credentials", "Wrong email or password.");
    if (!email || !password || password.length > PASSWORD_MAX) return invalid();
    const user = await db().user.findUnique({ where: { email } });
    if (!user) {
      await burnPasswordCheck(password);
      return invalid();
    }
    if (!(await verifyPassword(password, user.passwordHash))) return invalid();
    return startSession(user.id, NextResponse.json(publicAccount(user)));
  });
}
