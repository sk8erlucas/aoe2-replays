// Share links for a page. Plain URLs to each site's share form: no scripts or
// trackers from them are loaded on our pages.

export type ShareSite = "whatsapp" | "x" | "reddit" | "telegram";

export function shareLinks(url: string, title: string): Array<{ site: ShareSite; href: string }> {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);
  return [
    { site: "whatsapp", href: `https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}` },
    { site: "x", href: `https://x.com/intent/post?text=${t}&url=${u}` },
    { site: "reddit", href: `https://www.reddit.com/submit?url=${u}&title=${t}` },
    { site: "telegram", href: `https://t.me/share/url?url=${u}&text=${t}` },
  ];
}
