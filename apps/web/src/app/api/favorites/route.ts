// GET: the account's favorites and saved moments.
// POST { kind, targetId, second?, note? }: saves one (or updates a moment's note).
import { NextResponse } from "next/server";
import { currentSession, rejectCrossSite, unauthorized } from "@/lib/auth";
import { MAX_FAVORITES, addFavorite, listFavorites } from "@/lib/favorites";
import { apiError, readJson, withErrors } from "@/lib/http";
import { allow } from "@/lib/ratelimit";
import { parseFavorite } from "@/lib/validate";

export async function GET() {
  return withErrors(async () => {
    const session = await currentSession();
    if (!session) return unauthorized();
    return NextResponse.json({ favorites: await listFavorites(session.user.id), max: MAX_FAVORITES });
  });
}

export async function POST(request: Request) {
  return withErrors(async () => {
    const refused = rejectCrossSite(request);
    if (refused) return refused;
    const session = await currentSession();
    if (!session) return unauthorized();
    const userId = session.user.id;
    const input = parseFavorite(await readJson(request));
    if (!input) return apiError(400, "bad_request", "Invalid favorite.");
    if (!allow(`account:${userId}`, 60, 60_000)) return apiError(429, "rate_limited", "Too many changes. Try again later.");
    const result = await addFavorite(userId, input);
    if (!result.ok) return apiError(result.status, result.code, result.message);
    return NextResponse.json({ favorite: result.favorite }, { status: 201 });
  });
}
