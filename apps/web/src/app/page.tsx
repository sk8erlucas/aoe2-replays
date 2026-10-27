"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatTime } from "@aoe2-replays/viewer";
import { Uploader } from "@/components/Uploader";
import { listOwned, rememberOwned, type OwnedReplay } from "@/lib/owned";

export default function Home() {
  const router = useRouter();
  const [owned, setOwned] = useState<OwnedReplay[]>([]);

  // localStorage only exists in the browser, so read it after mount.
  useEffect(() => setOwned(listOwned()), []);

  return (
    <main className="home">
      <h1>Mirá y analizá tus partidas de Age of Empires II</h1>
      <div className="ornament" aria-hidden="true">
        ◆
      </div>
      <p className="muted">
        Subí un replay y miralo reproducido en el mapa: edificios, unidades, eventos y chat. Prototipo en desarrollo.
      </p>
      <Uploader
        onUploaded={(r) => {
          rememberOwned({ ...r, createdAt: new Date().toISOString() });
          router.push(`/r/${r.id}`);
        }}
      />

      {owned.length > 0 && (
        <section className="owned">
          <h2>Tus replays en este navegador</h2>
          <ul>
            {owned.map((r) => (
              <li key={r.id}>
                <Link href={`/r/${r.id}`}>{r.mapName ?? "Mapa desconocido"}</Link>
                <span className="muted">
                  {" "}
                  · {formatTime(r.durationMs)} · {new Date(r.createdAt).toLocaleDateString("es")} · {r.fileName}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
