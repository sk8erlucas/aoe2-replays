// GET: the parser JSON of a stored match, sent as stored (gzip); the page inflates it (lib/replayJson.ts).
import { apiError, withErrors } from "@/lib/http";
import { isMatchId, matchData } from "@/lib/matches";

export async function GET(_request: Request, { params }: { params: Promise<{ matchId: string }> }) {
  return withErrors(async () => {
    const { matchId } = await params;
    const found = isMatchId(matchId) ? await matchData(matchId) : null;
    if (!found) return apiError(404, "not_found", "This match has not been downloaded yet.");
    return new Response(Buffer.from(found.data), {
      headers: {
        // Not Content-Encoding: Next 16 drops it from route responses. The page inflates it.
        "content-type": "application/gzip",
        // A stored match only changes when a newer parser refreshes it (lib/matches.ts):
        // an outdated copy is not cached, so the next visit gets the refreshed one.
        "cache-control": found.current ? "public, max-age=86400" : "no-store",
      },
    });
  });
}
