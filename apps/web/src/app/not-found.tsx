"use client";

import Link from "next/link";
import { PlayerSearch } from "@/components/PlayerSearch";
import { useI18n } from "@/i18n/I18nProvider";

export default function NotFound() {
  const { t } = useI18n();
  return (
    <main className="page message-page">
      <h1>{t.notFound.title}</h1>
      <p className="muted">{t.notFound.text}</p>
      <div className="not-found-search">
        <PlayerSearch size="large" />
      </div>
      <Link href="/">{t.notFound.home}</Link>
    </main>
  );
}
