// GET: what aoe2companion knows about a match (ratings, who won). Not in the
// replay itself, so the viewer shows it when available and skips it otherwise.
import { NextResponse } from "next/server";
import { getMatch } from "@/lib/aoe2companion";
import { apiError } from "@/lib/http";
import { isMatchId } from "@/lib/validate";

export async function GET(_request: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  if (!isMatchId(matchId)) return apiError(404, "not_found", "Match not found.");
  try {
    const match = await getMatch(Number(matchId));
    if (!match) return apiError(404, "not_found", "Match not found.");
    return NextResponse.json(match, { headers: { "cache-control": "public, max-age=300" } });
  } catch {
    return apiError(502, "source_unavailable", "Could not fetch the match's data.");
  }
}
