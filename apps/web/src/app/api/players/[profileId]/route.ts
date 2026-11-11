// GET: public profile, ratings and recent matches of a player.
// ?page=N (2 and up) returns only that page of matches, for "Load more".
import { NextResponse } from "next/server";
import { getMatches, getProfile } from "@/lib/aoe2companion";
import { apiError } from "@/lib/http";
import { isMatchId, parsePage } from "@/lib/validate";

export async function GET(request: Request, { params }: { params: Promise<{ profileId: string }> }) {
  const { profileId } = await params;
  if (!isMatchId(profileId)) return apiError(404, "not_found", "Player not found.");
  const page = parsePage(new URL(request.url).searchParams.get("page"));
  if (page == null) return apiError(400, "bad_request", "Invalid page.");
  try {
    const id = Number(profileId);
    if (page > 1) return NextResponse.json({ matches: await getMatches(id, page) });
    const [profile, matches] = await Promise.all([getProfile(id), getMatches(id)]);
    return NextResponse.json({ profile, matches });
  } catch {
    return apiError(502, "source_unavailable", "Could not fetch the player's data.");
  }
}
