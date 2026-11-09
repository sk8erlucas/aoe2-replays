import type { Metadata } from "next";
import { getProfile } from "@/lib/aoe2companion";
import { pageMeta, serverMessages } from "@/lib/pageMeta";
import { isMatchId } from "@/lib/validate";

type Props = { params: Promise<{ profileId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { profileId } = await params;
  if (!isMatchId(profileId)) return {};
  const t = await serverMessages();
  // The page itself asks for the same profile, and the response is cached.
  const profile = await getProfile(Number(profileId)).catch(() => null);
  return profile ? pageMeta(profile.name, t.meta.player(profile.name), `/p/${profileId}`) : {};
}

export default function PlayerLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
