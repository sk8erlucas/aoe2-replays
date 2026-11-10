// GET: the logged-in account's replays, newest first (metadata only).
import { NextResponse } from "next/server";
import { currentSession, unauthorized } from "@/lib/auth";
import { withErrors } from "@/lib/http";
import { MAX_ACCOUNT_REPLAYS, accountReplays } from "@/lib/replays";

export async function GET() {
  return withErrors(async () => {
    const session = await currentSession();
    if (!session) return unauthorized();
    const replays = await accountReplays(session.user.id);
    return NextResponse.json({ replays, max: MAX_ACCOUNT_REPLAYS });
  });
}
