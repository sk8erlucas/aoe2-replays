import type { Metadata } from "next";
import { getMatch } from "@/lib/aoe2companion";
import { findMatch } from "@/lib/matches";
import { matchDescription } from "@/lib/matchMeta";
import { pageMeta, serverMessages } from "@/lib/pageMeta";
import { isMatchId } from "@/lib/validate";

type Props = { params: Promise<{ matchId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { matchId } = await params;
  if (!isMatchId(matchId)) return {};
  const t = await serverMessages();
  const path = `/m/${matchId}`;
  // aoe2companion is cached (and the preview image asks for the same match).
  const [match, info] = await Promise.all([findMatch(matchId).catch(() => null), getMatch(Number(matchId)).catch(() => null)]);
  if (!match) return pageMeta(t.match.online, t.meta.matchFallback, path, { generatedImage: true });
  const map = match.mapName ?? t.common.unknownMap;
  const stored = match.players as Array<{ name?: string; team_id?: number }>;
  return pageMeta(map, matchDescription(t.meta, { map, durationMs: match.durationMs, info, stored }), path, { generatedImage: true });
}

export default function MatchLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
