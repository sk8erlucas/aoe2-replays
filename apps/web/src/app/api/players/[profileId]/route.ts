// GET: public profile, ratings and recent matches of a player.
import { NextResponse } from "next/server";
import { getMatches, getProfile } from "@/lib/aoe2companion";
import { apiError } from "@/lib/http";

export async function GET(_request: Request, { params }: { params: Promise<{ profileId: string }> }) {
  const { profileId } = await params;
  if (!/^\d{1,12}$/.test(profileId)) return apiError(404, "not_found", "Player not found.");
  try {
    const id = Number(profileId);
    const [profile, matches] = await Promise.all([getProfile(id), getMatches(id)]);
    return NextResponse.json({ profile, matches });
  } catch {
    return apiError(502, "source_unavailable", "Could not fetch the player's data.");
  }
}
