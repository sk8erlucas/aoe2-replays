import type { Metadata } from "next";
import { pageMeta, serverMessages } from "@/lib/pageMeta";

export async function generateMetadata(): Promise<Metadata> {
  const t = await serverMessages();
  return pageMeta(t.tools.pageTitle, t.tools.pageDescription, "/tools");
}

export default function ToolsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
