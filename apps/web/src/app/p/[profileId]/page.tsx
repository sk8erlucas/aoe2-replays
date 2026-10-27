"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { formatTime } from "@aoe2-replays/viewer";
import type { MatchSummary, Profile } from "@/lib/aoe2companion";

type Load =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; profile: Profile; matches: MatchSummary[] };

function duration(m: MatchSummary) {
  if (!m.started || !m.finished) return null;
  return new Date(m.finished).getTime() - new Date(m.started).getTime();
}

function result(m: MatchSummary, profileId: number) {
  const me = m.teams.flatMap((t) => t.players).find((p) => p.profileId === profileId);
  if (!me || me.won == null) return null;
  return me.won ? "Victoria" : "Derrota";
}

export default function ProfilePage() {
  const { profileId } = useParams<{ profileId: string }>();
  const id = Number(profileId);
  const [load, setLoad] = useState<Load>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setLoad({ kind: "loading" });
    fetch(`/api/players/${profileId}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
        if (!cancelled) setLoad({ kind: "ready", profile: json.profile, matches: json.matches });
      })
      .catch((err: Error) => {
        if (!cancelled) setLoad({ kind: "error", message: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  if (load.kind === "loading") return <main className="page message-page muted">Buscando al jugador…</main>;
  if (load.kind === "error") {
    return (
      <main className="page message-page">
        <h1>No pudimos cargar este jugador</h1>
        <p className="muted">{load.message}</p>
      </main>
    );
  }

  const { profile, matches } = load;
  const ratings = profile.ratings.filter((r) => r.rating != null);

  return (
    <main className="page">
      <div className="container profile">
        <header className="profile-head">
          <h1>
            {profile.clan && <span className="clan">[{profile.clan}] </span>}
            {profile.name}
          </h1>
          <p className="muted">
            {[profile.countryName ?? profile.country?.toUpperCase(), `${profile.games.toLocaleString("es")} partidas`]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </header>

        {ratings.length > 0 && (
          <section>
            <h2>Rankings</h2>
            <div className="table-scroll">
              <table className="stats ratings">
                <thead>
                  <tr>
                    <th scope="col">Modo</th>
                    <th scope="col">ELO</th>
                    <th scope="col">Máximo</th>
                    <th scope="col">Victorias</th>
                    <th scope="col">Derrotas</th>
                    <th scope="col">% victorias</th>
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
          <h2>Partidas recientes</h2>
          {matches.length === 0 && <p className="muted">No encontramos partidas recientes.</p>}
          <ul className="match-list">
            {matches.map((m) => {
              const res = result(m, id);
              const ms = duration(m);
              return (
                <li key={m.matchId} className="match-card">
                  <div className="match-head">
                    <div>
                      <strong>{m.mapName ?? "Mapa desconocido"}</strong>
                      <span className="muted">
                        {" "}
                        · {m.leaderboardName ?? "Partida"}
                        {m.started &&
                          ` · ${new Date(m.started).toLocaleString("es", { dateStyle: "medium", timeStyle: "short" })}`}
                        {ms != null && ` · ${formatTime(ms)}`}
                      </span>
                    </div>
                    {res && <span className={`result ${res === "Victoria" ? "win" : "loss"}`}>{res}</span>}
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
                      Ver partida
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
        <p className="muted small source-note">
          Datos de jugadores y partidas: <a href="https://www.aoe2companion.com">aoe2companion</a>. Replays: servicio
          público de Microsoft.
        </p>
      </div>
    </main>
  );
}
