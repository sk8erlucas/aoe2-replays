import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { currentSession } from "@/lib/auth";
import { safeNextPath } from "@/lib/validate";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNextPath((await searchParams).next);
  if (await currentSession().catch(() => null)) redirect(next);
  return <AuthForm mode="register" next={next} />;
}
