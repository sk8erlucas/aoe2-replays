import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountSettings } from "@/components/AccountSettings";
import { currentSession } from "@/lib/auth";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AccountPage() {
  if (!(await currentSession().catch(() => null))) redirect("/login?next=/account");
  return <AccountSettings />;
}
