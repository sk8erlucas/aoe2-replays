import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Read SITE_URL at request time, not at build time.
export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 }];
}
