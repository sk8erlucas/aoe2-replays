"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import type { ReplayData } from "@aoe2-replays/shared";
import { ReplayViewer, type PlayerExtra } from "@/components/ReplayViewer";
import { FavoriteButton } from "@/components/FavoriteButton";
import { ShareMenu } from "@/components/ShareMenu";
import { errorText, useI18n } from "@/i18n/I18nProvider";
import type { MatchSummary } from "@/lib/aoe2companion";
import { readReplayJson } from "@/lib/replayJson";

type Load =
  | { kind: "loading"; message: string }
  | { kind: "error"; message: string }
  | { kind: "ready"; data: ReplayData };

/** Ratings and results from aoe2companion, by the replay's player numbers (profile id, else name). */
function playerExtras(data: ReplayData, info: MatchSummary): Map<number, PlayerExtra> {
  const all = info.teams.flatMap((t) => t.players);
  const out = new Map<number, PlayerExtra>();
  for (const p of data.game.players) {
    const hit = all.find((x) => p.profile_id != null && x.profileId === p.profile_id) ?? all.find((x) => x.name === p.name);
    if (hit) out.set(p.number, { rating: hit.rating, ratingDiff: hit.ratingDiff, won: hit.won });
  }
  return out;
}

function MatchView() {
  const { matchId } = useParams<{ matchId: string }>();
  const profileId = useSearchParams().get("p");
  const { t } = useI18n();
  const [load, setLoad] = useState<Load>({ kind: "loading", message: t.match.loading });
  const [notice, setNotice] = useState<string | null>(null);
  const [info, setInfo] = useState<MatchSummary | null>(null);

  // Optional: the match plays fine without it.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/matches/${matchId}/info`)
      .then((res) => (res.ok ? (res.json() as Promise<MatchSummary>) : null))
      .then((m) => {
        if (!cancelled) setInfo(m);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [matchId]);
  const extras = useMemo(() => (info && load.kind === "ready" ? playerExtras(load.data, info) : undefined), [info, load]);

  useEffect(() => {
    let cancelled = false;
    const set = (l: Load) => {
      if (!cancelled) setLoad(l);
    };
    (async () => {
      let res = await fetch(`/api/matches/${matchId}`);
      // A shared link without ?p=: any player of the match has a copy of the replay.
      let source = profileId;
      if (res.status === 404 && !source) {
        const known = await fetch(`/api/matches/${matchId}/info`)
          .then((r) => (r.ok ? (r.json() as Promise<MatchSummary>) : null))
          .catch(() => null);
        const ids = known?.teams.flatMap((team) => team.players.map((p) => p.profileId)) ?? [];
        source = ids.find((id) => id != null)?.toString() ?? null;
      }
      // First visit: download the replay from Microsoft through our server.
      if (res.status === 404 && source) {
        set({ kind: "loading", message: t.match.downloading });
        res = await fetch(`/api/matches/${matchId}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ profileId: source }),
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
      set({ kind: "ready", data: await readReplayJson(dataRes) });
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

  const shareTitle = (data: ReplayData) =>
    t.share.matchTitle(data.map.name ?? t.common.mapNumber(data.map.id), data.game.players.map((p) => p.name).join(", "));
  const title = shareTitle(load.data);
  const actions = (
    <div className="replay-actions">
      <span className="badge public">{t.match.online}</span>
      {info?.leaderboardName && <span className="muted">{info.leaderboardName}</span>}
      <FavoriteButton kind="match" targetId={matchId} title={title} onNotice={setNotice} />
      <ShareMenu url={`${location.origin}/m/${matchId}`} title={title} onCopied={() => setNotice(t.common.linkCopied)} />
      {profileId && <Link href={`/p/${profileId}`}>{t.common.backToProfile}</Link>}
      {notice && <p className="notice">{notice}</p>}
    </div>
  );
  return (
    <ReplayViewer data={load.data} actions={actions} extras={extras} moment={{ kind: "match", targetId: matchId, title }} />
  );
}

export default function MatchPage() {
  // useSearchParams needs a Suspense boundary in the App Router.
  return (
    <Suspense fallback={<main className="page message-page muted">…</main>}>
      <MatchView />
    </Suspense>
  );
}
