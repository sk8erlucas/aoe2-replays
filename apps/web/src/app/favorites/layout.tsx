import type { Metadata } from "next";
import { serverMessages } from "@/lib/pageMeta";

export async function generateMetadata(): Promise<Metadata> {
  const t = await serverMessages();
  // Personal page: nothing for search engines.
  return { title: `${t.favorites.title} · AoE2 Replays`, robots: { index: false } };
}

export default function FavoritesLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
