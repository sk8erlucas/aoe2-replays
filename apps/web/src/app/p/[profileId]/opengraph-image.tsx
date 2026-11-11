import { getProfile } from "@/lib/aoe2companion";
import { OG_SIZE, ogImage } from "@/lib/ogImage";
import { serverMessages } from "@/lib/pageMeta";
import { isMatchId } from "@/lib/validate";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "AoE2 Replays";

type Props = { params: Promise<{ profileId: string }> };

/** Name, country and rating per mode. */
export default async function Image({ params }: Props) {
  const { profileId } = await params;
  const t = await serverMessages();
  const profile = isMatchId(profileId) ? await getProfile(Number(profileId)).catch(() => null) : null;
  const ratings = (profile?.ratings ?? []).filter((r) => r.rating != null).sort((a, b) => b.wins + b.losses - (a.wins + a.losses));
  return ogImage({
    kicker: t.profile.rankings,
    title: profile ? `${profile.clan ? `[${profile.clan}] ` : ""}${profile.name}` : t.profile.errorTitle,
    subtitle: profile
      ? [profile.countryName ?? profile.country?.toUpperCase(), t.common.games(profile.games.toLocaleString(t.common.dateLocale))]
          .filter(Boolean)
          .join(" · ")
      : null,
    teams: [],
    stats: ratings.map((r) => ({
      label: r.leaderboardName,
      value: `${r.rating}${r.wins + r.losses > 0 ? ` · ${Math.round((r.wins / (r.wins + r.losses)) * 100)}%` : ""}`,
    })),
    winLabel: t.profile.win,
    lossLabel: t.profile.loss,
  });
}
