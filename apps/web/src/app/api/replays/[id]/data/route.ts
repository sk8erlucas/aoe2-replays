// GET: the parser JSON, sent as stored (gzip) so the browser inflates it.
import { apiError } from "@/lib/http";
import { TOKEN_HEADER, findVisibleReplay, replayData } from "@/lib/replays";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await findVisibleReplay(id, request.headers.get(TOKEN_HEADER));
  const data = found && (await replayData(id));
  if (!found || !data) return apiError(404, "not_found", "The replay does not exist, has expired or is private.");
  return new Response(Buffer.from(data), {
    headers: {
      "content-type": "application/json",
      "content-encoding": "gzip",
      // Never cache in shared caches: a replay can be made private again.
      "cache-control": found.replay.isPublic ? "private, max-age=60" : "private, no-store",
    },
  });
}
