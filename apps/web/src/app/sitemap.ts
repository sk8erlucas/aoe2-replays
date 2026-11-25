import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { SITE_URL } from "@/lib/site";
import { sitemapPlayers } from "@/lib/sitemapPlayers";

// Read SITE_URL and the matches at request time, not at build time.
export const dynamic = "force-dynamic";

const MAX_MATCHES = 1000;

// Only online matches, which are public. Uploaded replays never go here.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const matches = await db()
    .match.findMany({
      orderBy: { importedAt: "desc" },
      take: MAX_MATCHES,
      select: { id: true, importedAt: true, sourceProfileId: true, players: true },
    })
    .catch(() => []);
  return [
    { url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/tools`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    ...matches.map((m) => ({ url: `${SITE_URL}/m/${m.id}`, lastModified: m.importedAt, priority: 0.5 })),
    ...sitemapPlayers(matches).map((id) => ({ url: `${SITE_URL}/p/${id}`, changeFrequency: "daily" as const, priority: 0.4 })),
  ];
}
