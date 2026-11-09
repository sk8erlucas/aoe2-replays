import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { SITE_URL } from "@/lib/site";

// Read SITE_URL and the matches at request time, not at build time.
export const dynamic = "force-dynamic";

const MAX_MATCHES = 1000;

// Only online matches, which are public. Uploaded replays never go here.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const matches = await db()
    .match.findMany({ orderBy: { importedAt: "desc" }, take: MAX_MATCHES, select: { id: true, importedAt: true } })
    .catch(() => []);
  return [
    { url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    ...matches.map((m) => ({ url: `${SITE_URL}/m/${m.id}`, lastModified: m.importedAt, priority: 0.5 })),
  ];
}
