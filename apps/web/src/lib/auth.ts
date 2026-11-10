// Accounts: database sessions behind an httpOnly cookie. The cookie holds a
// random token; only its hash is stored, so a database leak gives no sessions.
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { cache } from "react";
import { db } from "@/lib/db";
import { apiError } from "@/lib/http";
import { SITE_URL } from "@/lib/site";
import { isSameOrigin, isSessionToken } from "@/lib/validate";

const COOKIE = "session";
const SESSION_MS = 60 * 86400_000;

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export const newUserId = () => randomBytes(16).toString("base64url");

/** Who is logged in, once per request. Null without a valid, unexpired session. */
export const currentSession = cache(async () => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token || !isSessionToken(token)) return null;
  const session = await db().session.findFirst({
    where: { tokenHash: sha256(token), expiresAt: { gt: new Date() } },
    include: { user: true },
  });
  return session ? { user: session.user, tokenHash: session.tokenHash } : null;
});

export type AccountUser = NonNullable<Awaited<ReturnType<typeof currentSession>>>["user"];

/** The only account fields the browser gets. */
export function publicAccount(user: AccountUser) {
  return { email: user.email, profileId: user.aoeProfileId, profileName: user.aoeProfileName };
}

export type PublicAccount = ReturnType<typeof publicAccount>;

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    // Plain-http deployments (forks, local `next start`) would lose the cookie otherwise.
    secure: process.env.NODE_ENV === "production" && SITE_URL.startsWith("https://"),
    path: "/",
  };
}

/** Starts a session and puts its cookie on `response`. */
export async function startSession<T extends NextResponse>(userId: string, response: T): Promise<T> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_MS);
  await db().session.create({ data: { tokenHash: sha256(token), userId, expiresAt } });
  response.cookies.set(COOKIE, token, { ...cookieOptions(), expires: expiresAt });
  return response;
}

export function clearSessionCookie<T extends NextResponse>(response: T): T {
  response.cookies.set(COOKIE, "", { ...cookieOptions(), maxAge: 0 });
  return response;
}

/** A 403 response if a state-changing request doesn't come from this site, else null. */
export function rejectCrossSite(request: Request): Response | null {
  const hosts = [request.headers.get("x-forwarded-host"), request.headers.get("host"), new URL(SITE_URL).host];
  if (isSameOrigin(request.headers.get("origin"), hosts)) return null;
  return apiError(403, "forbidden", "Cross-site request refused.");
}

export const unauthorized = () => apiError(401, "unauthorized", "You need to log in.");

/**
 * The logged-in user's id for a request that changes something, only when it
 * comes from this site: a cross-site request is treated as anonymous.
 */
export async function sameSiteUserId(request: Request): Promise<string | null> {
  if (rejectCrossSite(request)) return null;
  return (await currentSession())?.user.id ?? null;
}
