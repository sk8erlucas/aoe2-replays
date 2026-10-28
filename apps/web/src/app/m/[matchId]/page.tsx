"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import type { ReplayData } from "@aoe2-replays/shared";
import { ReplayViewer } from "@/components/ReplayViewer";
import { errorText, useI18n } from "@/i18n/I18nProvider";

type Load =
  | { kind: "loading"; message: string }
  | { kind: "error"; message: string }
  | { kind: "ready"; data: ReplayData };

function MatchView() {
  const { matchId } = useParams<{ matchId: string }>();
  const profileId = useSearchParams().get("p");
  const { t } = useI18n();
  const [load, setLoad] = useState<Load>({ kind: "loading", message: t.match.loading });
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const set = (l: Load) => {
      if (!cancelled) setLoad(l);
    };
    (async () => {
      let res = await fetch(`/api/matches/${matchId}`);
      // First visit: download the replay from Microsoft through our server.
      if (res.status === 404 && profileId) {
        set({ kind: "loading", message: t.match.downloading });
        res = await fetch(`/api/matches/${matchId}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ profileId }),
        });
      }
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        set({
          kind: "error",
          message:
            res.status === 404 && (!json?.error?.code || json.error.code === "not_found")
              ? t.match.notFound
              : errorText(t, json?.error?.code, res.status),
        });
        return;
      }
      const dataRes = await fetch(`/api/matches/${matchId}/data`);
      if (!dataRes.ok) {
        set({ kind: "error", message: t.errors.generic(dataRes.status) });
        return;
      }
      set({ kind: "ready", data: await dataRes.json() });
    })().catch(() => set({ kind: "error", message: t.errors.network }));
    return () => {
      cancelled = true;
    };
    // Texts come from the current language; reloading on a language change is not needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, profileId]);

  if (load.kind === "loading") return <main className="page message-page muted">{load.message}</main>;
  if (load.kind === "error") {
    return (
      <main className="page message-page">
        <h1>{t.match.errorTitle}</h1>
        <p className="muted">{load.message}</p>
        {profileId && <Link href={`/p/${profileId}`}>{t.common.backToProfile}</Link>}
      </main>
    );
  }

  const actions = (
    <div className="replay-actions">
      <span className="badge public">{t.match.online}</span>
      <button
        type="button"
        onClick={async () => {
          const url = `${location.origin}/m/${matchId}`;
          try {
            await navigator.clipboard.writeText(url);
            setNotice(t.common.linkCopied);
          } catch {
            window.prompt(t.common.copyPrompt, url);
          }
        }}
      >
        {t.common.copyLink}
      </button>
      {profileId && <Link href={`/p/${profileId}`}>{t.common.backToProfile}</Link>}
      {notice && <p className="notice">{notice}</p>}
    </div>
  );
  return <ReplayViewer data={load.data} actions={actions} />;
}

export default function MatchPage() {
  // useSearchParams needs a Suspense boundary in the App Router.
  return (
    <Suspense fallback={<main className="page message-page muted">…</main>}>
      <MatchView />
    </Suspense>
  );
}
