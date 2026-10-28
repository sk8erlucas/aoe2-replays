// GET ?q=<name>: player search for the autocomplete.
import { NextResponse } from "next/server";
import { searchProfiles } from "@/lib/aoe2companion";
import { apiError } from "@/lib/http";
import { allow } from "@/lib/ratelimit";
import { hashIp } from "@/lib/replays";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ profiles: [] });
  if (q.length > 40) return apiError(400, "bad_request", "Search query too long.");
  if (!allow(`search:${hashIp(request) ?? "local"}`, 60, 60_000)) {
    return apiError(429, "rate_limited", "Too many searches. Wait a moment.");
  }
  try {
    return NextResponse.json({ profiles: await searchProfiles(q) });
  } catch {
    return apiError(502, "source_unavailable", "Player search is not responding.");
  }
}
