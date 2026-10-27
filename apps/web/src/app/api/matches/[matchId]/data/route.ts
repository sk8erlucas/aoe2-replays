// GET: the parser JSON of a stored match, sent as stored (gzip).
import { apiError } from "@/lib/http";
import { isMatchId, matchData } from "@/lib/matches";

export async function GET(_request: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const data = isMatchId(matchId) ? await matchData(matchId) : null;
  if (!data) return apiError(404, "not_found", "Esta partida todavía no fue descargada.");
  return new Response(Buffer.from(data), {
    headers: {
      "content-type": "application/json",
      "content-encoding": "gzip",
      // Matches never change once stored.
      "cache-control": "public, max-age=86400, immutable",
    },
  });
}
