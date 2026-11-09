import type { Metadata } from "next";
import { findMatch } from "@/lib/matches";
import { pageMeta, serverMessages } from "@/lib/pageMeta";
import { isMatchId } from "@/lib/validate";

type Props = { params: Promise<{ matchId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { matchId } = await params;
  if (!isMatchId(matchId)) return {};
  const t = await serverMessages();
  const path = `/m/${matchId}`;
  const match = await findMatch(matchId).catch(() => null);
  if (!match) return pageMeta(t.match.online, t.meta.matchFallback, path);
  const map = match.mapName ?? t.common.unknownMap;
  const players = (match.players as Array<{ name?: string }>).map((p) => p.name).filter(Boolean).join(", ");
  return pageMeta(map, t.meta.match(map, players), path);
}

export default function MatchLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
