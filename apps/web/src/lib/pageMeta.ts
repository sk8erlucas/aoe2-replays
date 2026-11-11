// Metadata for player and match pages. Those pages render in the browser, but
// search engines and link previews need the title and description from the server.
import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { MESSAGES, pickLocale, type Messages } from "@/i18n/messages";

export async function serverMessages(): Promise<Messages> {
  return MESSAGES[pickLocale((await cookies()).get("lang")?.value, (await headers()).get("accept-language"))];
}

/**
 * With `generatedImage` the page's own opengraph-image.tsx provides the
 * picture (X falls back to og:image); otherwise the site's general one.
 */
export function pageMeta(title: string, description: string, path: string, { generatedImage = false } = {}): Metadata {
  const fullTitle = `${title} · AoE2 Replays`;
  const images = generatedImage ? undefined : [{ url: "/images/og.jpg", width: 1200, height: 630 }];
  return {
    title: fullTitle,
    description,
    alternates: { canonical: path },
    openGraph: { type: "website", siteName: "AoE2 Replays", title: fullTitle, description, url: path, images },
    twitter: { card: "summary_large_image", title: fullTitle, description, images },
  };
}
