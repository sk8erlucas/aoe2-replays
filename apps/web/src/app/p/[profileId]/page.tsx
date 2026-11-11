"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { formatTime } from "@aoe2-replays/viewer";
import { FollowControls } from "@/components/FollowControls";
import { errorText, useI18n } from "@/i18n/I18nProvider";
import type { Messages } from "@/i18n/messages";
import type { MatchSummary, Profile } from "@/lib/aoe2companion";

type Load =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; profile: Profile; matches: MatchSummary[]; page: number; more: boolean };

// aoe2companion pages hold 20 matches; a shorter page is the last one.
const PAGE_SIZE = 20;

function duration(m: MatchSummary) {
  if (!m.started || !m.finished) return null;
  return new Date(m.finished).getTime() - new Date(m.started).getTime();
}

function result(t: Messages, m: MatchSummary, profileId: number) {
  const me = m.teams.flatMap((t) => t.players).find((p) => p.profileId === profileId);
  if (!me || me.won == null) return null;
  return me.won ? { label: t.profile.win, win: true } : { label: t.profile.loss, win: false };
}

export default function ProfilePage() {
  const { profileId } = useParams<{ profileId: string }>();
  const id = Number(profileId);
  const { t } = useI18n();
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoad({ kind: "loading" });
    fetch(`/api/players/${profileId}`)
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(errorText(t, json?.error?.code, res.status));
        if (!cancelled) {
          setLoad({ kind: "ready", profile: json.profile, matches: json.matches, page: 1, more: json.matches.length >= PAGE_SIZE });
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setLoad({ kind: "error", message: err.message });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId]);

  if (load.kind === "loading") return <main className="page message-page muted">{t.profile.loading}</main>;
  if (load.kind === "error") {
    return (
      <main className="page message-page">
        <h1>{t.profile.errorTitle}</h1>
        <p className="muted">{load.message}</p>
      </main>
    );
  }

  const { profile, matches } = load;

  async function loadMore() {
    if (load.kind !== "ready") return;
    const page = load.page + 1;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const res = await fetch(`/api/players/${profileId}?page=${page}`);
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(errorText(t, json?.error?.code, res.status));
      const next = json.matches as MatchSummary[];
      setLoad((l) => {
        if (l.kind !== "ready") return l;
        const seen = new Set(l.matches.map((m) => m.matchId));
        return {
          ...l,
          matches: [...l.matches, ...next.filter((m) => !seen.has(m.matchId))],
          page,
          more: next.length >= PAGE_SIZE && page < 50,
        };
      });
    } catch (err) {
      setMoreError(err instanceof Error ? err.message : t.errors.network);
    } finally {
      setLoadingMore(false);
    }
  }
  const ratings = profile.ratings.filter((r) => r.rating != null);

  return (
    <main className="page">
      <div className="container profile">
        <header className="profile-head">
          <div className="profile-title">
            <h1>
              {profile.clan && <span className="clan">[{profile.clan}] </span>}
              {profile.name}
            </h1>
            <FollowControls profileId={profileId} />
          </div>
          <p className="muted">
            {[profile.countryName ?? profile.country?.toUpperCase(), t.common.games(profile.games.toLocaleString(t.common.dateLocale))]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </header>

        {ratings.length > 0 && (
          <section>
            <h2>{t.profile.rankings}</h2>
            <div className="table-scroll">
              <table className="stats ratings">
                <thead>
                  <tr>
                    <th scope="col">{t.profile.mode}</th>
                    <th scope="col">{t.profile.elo}</th>
                    <th scope="col">{t.profile.max}</th>
                    <th scope="col">{t.profile.wins}</th>
                    <th scope="col">{t.profile.losses}</th>
                    <th scope="col">{t.profile.winRate}</th>
                  </tr>
                </thead>
                <tbody>
                  {ratings.map((r) => (
                    <tr key={r.leaderboardId}>
                      <th scope="row">{r.leaderboardName}</th>
                      <td>{r.rating}</td>
                      <td>{r.maxRating ?? "—"}</td>
                      <td>{r.wins}</td>
                      <td>{r.losses}</td>
                      <td>{r.wins + r.losses > 0 ? `${Math.round((r.wins / (r.wins + r.losses)) * 100)}%` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section>
          <h2>{t.profile.recent}</h2>
          {matches.length === 0 && <p className="muted">{t.profile.noMatches}</p>}
          <ul className="match-list">
            {matches.map((m) => {
              const res = result(t, m, id);
              const ms = duration(m);
              return (
                <li key={m.matchId} className="match-card">
                  <div className="match-head">
                    <div>
                      <strong>{m.mapName ?? t.common.unknownMap}</strong>
                      <span className="muted">
                        {" "}
                        · {m.leaderboardName ?? t.profile.match}
                        {m.started &&
                          ` · ${new Date(m.started).toLocaleString(t.common.dateLocale, { dateStyle: "medium", timeStyle: "short" })}`}
                        {ms != null && ` · ${formatTime(ms)}`}
                      </span>
                    </div>
                    {res && <span className={`result ${res.win ? "win" : "loss"}`}>{res.label}</span>}
                  </div>
                  <div className="match-teams">
                    {m.teams.map((t, ti) => (
                      <ul key={ti} className="match-team">
                        {t.players.map((p, pi) => (
                          <li key={pi}>
                            <span className="swatch" style={{ background: p.colorHex ?? "#999" }} aria-hidden="true" />
                            {p.profileId ? <Link href={`/p/${p.profileId}`}>{p.name}</Link> : p.name}
                            <span className="muted">
                              {" "}
                              {p.civName}
                              {p.rating != null && ` · ${p.rating}`}
                              {p.ratingDiff ? ` (${p.ratingDiff > 0 ? "+" : ""}${p.ratingDiff})` : ""}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ))}
                  </div>
                  <div className="match-actions">
                    <Link className="button-primary" href={`/m/${m.matchId}?p=${id}`}>
                      {t.profile.watch}
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
          {load.more && (
            <div className="load-more">
              <button type="button" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? t.common.loading : t.profile.loadMore}
              </button>
              {moreError && <p className="muted">{moreError}</p>}
            </div>
          )}
        </section>
        <p className="muted small source-note">
          <a href="https://www.aoe2companion.com">aoe2companion</a> · {t.profile.sources}
        </p>
      </div>
    </main>
  );
}
