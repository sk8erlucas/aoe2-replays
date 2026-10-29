import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Read SITE_URL at request time, not at build time.
export const dynamic = "force-dynamic";

// Uploaded replays (/r/) are private or link-only: never indexed.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/r/"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
