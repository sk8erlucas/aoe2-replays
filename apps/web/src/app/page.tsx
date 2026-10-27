"use client";

import { useState } from "react";
import type { ReplayData } from "@aoe2-replays/shared";
import { ReplayViewer } from "@/components/ReplayViewer";
import { Uploader } from "@/components/Uploader";

export default function Home() {
  const [replay, setReplay] = useState<{ data: ReplayData; name: string } | null>(null);

  return (
    <div className="app">
      <header className="topbar">
        <strong className="brand">AoE2 Replays</strong>
        {replay && <span className="muted file-name">{replay.name}</span>}
        {replay && (
          <button type="button" onClick={() => setReplay(null)}>
            Subir otro
          </button>
        )}
      </header>

      {replay ? (
        <ReplayViewer data={replay.data} />
      ) : (
        <main className="home">
          <h1>Mirá y analizá tus partidas de Age of Empires II</h1>
          <p className="muted">
            Subí un replay y miralo reproducido en el mapa: edificios, unidades, eventos y chat. Prototipo en desarrollo.
          </p>
          <Uploader onParsed={(data, name) => setReplay({ data, name })} />
        </main>
      )}

      <footer className="legal muted small">
        Proyecto de fans, open source (MIT). No afiliado a Microsoft, Xbox Game Studios ni World&apos;s Edge.
      </footer>
    </div>
  );
}
