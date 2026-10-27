"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import type { ReplayData } from "@aoe2-replays/shared";
import { ReplayViewer } from "@/components/ReplayViewer";

type Load =
  | { kind: "loading"; message: string }
  | { kind: "error"; message: string }
  | { kind: "ready"; data: ReplayData };

function MatchView() {
  const { matchId } = useParams<{ matchId: string }>();
  const profileId = useSearchParams().get("p");
  const [load, setLoad] = useState<Load>({ kind: "loading", message: "Cargando partida…" });
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
        set({ kind: "loading", message: "Descargando el replay de los servidores de Microsoft y analizándolo…" });
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
          message: json?.error?.message ?? "No encontramos esta partida. Abrila desde el perfil de un jugador.",
        });
        return;
      }
      const dataRes = await fetch(`/api/matches/${matchId}/data`);
      if (!dataRes.ok) {
        set({ kind: "error", message: `HTTP ${dataRes.status}` });
        return;
      }
      set({ kind: "ready", data: await dataRes.json() });
    })().catch((err: Error) => set({ kind: "error", message: err.message }));
    return () => {
      cancelled = true;
    };
  }, [matchId, profileId]);

  if (load.kind === "loading") return <main className="page message-page muted">{load.message}</main>;
  if (load.kind === "error") {
    return (
      <main className="page message-page">
        <h1>No se pudo abrir la partida</h1>
        <p className="muted">{load.message}</p>
        {profileId && <Link href={`/p/${profileId}`}>Volver al perfil</Link>}
      </main>
    );
  }

  const actions = (
    <div className="replay-actions">
      <span className="badge public">Partida online</span>
      <button
        type="button"
        onClick={async () => {
          const url = `${location.origin}/m/${matchId}`;
          try {
            await navigator.clipboard.writeText(url);
            setNotice("Enlace copiado.");
          } catch {
            window.prompt("Copiá el enlace:", url);
          }
        }}
      >
        Copiar enlace
      </button>
      {profileId && <Link href={`/p/${profileId}`}>Volver al perfil</Link>}
      {notice && <p className="notice">{notice}</p>}
    </div>
  );
  return <ReplayViewer data={load.data} actions={actions} />;
}

export default function MatchPage() {
  // useSearchParams needs a Suspense boundary in the App Router.
  return (
    <Suspense fallback={<main className="page message-page muted">Cargando partida…</main>}>
      <MatchView />
    </Suspense>
  );
}
