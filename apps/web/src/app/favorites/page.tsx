"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatTime } from "@aoe2-replays/viewer";
import { useFavorites } from "@/components/useFavorites";
import { useI18n } from "@/i18n/I18nProvider";
import { listLocal, replaceLocal, type Favorite } from "@/lib/localFavorites";

type Tab = "matches" | "moments" | "players";
type Follow = { profileId: string; name: string };

const hrefOf = (f: Favorite) => `/${f.kind === "match" ? "m" : "r"}/${f.targetId}${f.second > 0 ? `?t=${f.second}` : ""}`;

export default function FavoritesPage() {
  const { t } = useI18n();
  const { list, loggedIn, save, remove } = useFavorites();
  const [tab, setTab] = useState<Tab>("matches");
  const [follows, setFollows] = useState<Follow[] | null>(null);
  const [local, setLocal] = useState<Favorite[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!loggedIn) return;
    setLocal(listLocal());
    let cancelled = false;
    fetch("/api/follows")
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { follows: Follow[] } | null) => {
        if (!cancelled) setFollows(json?.follows ?? []);
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [loggedIn]);

  // Logged in with favorites saved before: one by one, so each keeps its own access check.
  async function importLocal() {
    setBusy(true);
    let ok = 0;
    const failed: Favorite[] = [];
    for (const f of local) {
      const result = await save({ kind: f.kind, targetId: f.targetId, second: f.second, note: f.note, title: f.title });
      if (result.ok) ok++;
      else failed.push(f);
    }
    // Keep the ones that could not move, so nothing is lost.
    replaceLocal(failed);
    setLocal(failed);
    setNotice(failed.length ? t.favorites.importPartial(ok, failed.length) : t.favorites.imported(ok));
    setBusy(false);
  }

  const items = (list ?? []).filter((f) => (tab === "moments" ? f.second > 0 : f.second === 0));

  return (
    <main className="page">
      <div className="container favorites">
        <h1>{t.favorites.title}</h1>
        <p className="muted">{loggedIn ? t.favorites.lead : t.favorites.localLead}</p>
        {!loggedIn && (
          <p>
            <Link href={`/login?next=${encodeURIComponent("/favorites")}`}>{t.nav.login}</Link>
          </p>
        )}
        {loggedIn && local.length > 0 && (
          <div className="notice-box">
            <span>{t.favorites.importTitle(local.length)}</span>
            <button type="button" disabled={busy} onClick={importLocal}>
              {t.favorites.importButton}
            </button>
          </div>
        )}
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}

        <div className="tabs" role="tablist">
          {(["matches", "moments", "players"] as const).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              className={tab === key ? "active" : ""}
              onClick={() => setTab(key)}
            >
              {t.favorites.tabs[key]}
            </button>
          ))}
        </div>

        {tab !== "players" && list === null && <p className="muted">{t.common.loading}</p>}
        {tab !== "players" && list !== null && items.length === 0 && (
          <p className="muted">{tab === "moments" ? t.favorites.emptyMoments : t.favorites.emptyMatches}</p>
        )}
        {tab !== "players" && items.length > 0 && (
          <ul className="follow-list favorite-list">
            {items.map((f) => (
              <li key={f.id}>
                <span>
                  <Link href={hrefOf(f)}>
                    {f.second > 0 && <span className="moment-time">{formatTime(f.second * 1000)}</span>}
                    {f.note ?? f.title}
                  </Link>
                  <span className="muted small">
                    {" "}
                    · {f.note ? `${f.title} · ` : ""}
                    {f.kind === "match" ? t.favorites.online : t.favorites.uploaded} ·{" "}
                    {new Date(f.createdAt).toLocaleDateString(t.common.dateLocale)}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    if (!(await remove(f.id))) setNotice(t.favorites.failed);
                  }}
                >
                  {t.favorites.remove}
                </button>
              </li>
            ))}
          </ul>
        )}

        {tab === "players" && !loggedIn && <p className="muted">{t.favorites.playersLogin}</p>}
        {tab === "players" && loggedIn && follows === null && <p className="muted">{t.common.loading}</p>}
        {tab === "players" && follows?.length === 0 && <p className="muted">{t.favorites.emptyPlayers}</p>}
        {tab === "players" && follows && follows.length > 0 && (
          <ul className="follow-list">
            {follows.map((f) => (
              <li key={f.profileId}>
                <Link href={`/p/${f.profileId}`}>{f.name}</Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
