import type { Metadata } from "next";

// Uploaded replays are private or shared by link only.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function UploadedReplayLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
