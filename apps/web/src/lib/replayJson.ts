import type { ReplayData } from "@aoe2-replays/shared";

/**
 * The JSON of a stored replay or match. The API sends the gzip it keeps as it is
 * (application/gzip) and the browser inflates it: Next 16 drops a route's
 * Content-Encoding header, so the browser can no longer do it on its own.
 */
export async function readReplayJson(res: Response): Promise<ReplayData> {
  if (!res.body) throw new Error("empty response");
  // A proxy may have inflated it already.
  if (res.headers.get("content-type")?.includes("application/json")) return res.json();
  const text = await new Response(res.body.pipeThrough(new DecompressionStream("gzip"))).text();
  return JSON.parse(text) as ReplayData;
}
