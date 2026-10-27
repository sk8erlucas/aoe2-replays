"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ReplayData } from "@aoe2-replays/shared";
import { ReplayViewer } from "@/components/ReplayViewer";
import { forgetOwned, rememberOwned, tokenFor } from "@/lib/owned";

type Meta = {
  id: string;
  isPublic: boolean;
  canManage: boolean;
  fileName: string | null;
  createdAt: string;
  expiresAt: string | null;
  mapName: string | null;
  durationMs: number;
};

type Load =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "error"; message: string }
  | { kind: "ready"; meta: Meta; data: ReplayData; token: string | null };

// The management link carries the token in the fragment (#k=...), which
// browsers never send to the server, so it stays out of logs.
function takeTokenFromHash(): string | null {
  const match = location.hash.match(/[#&]k=([\w-]+)/);
  if (!match) return null;
  history.replaceState(null, "", location.pathname + location.search);
  return match[1] ?? null;
}

export default function ReplayPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = takeTokenFromHash() ?? tokenFor(id);
      const headers: HeadersInit = token ? { "x-manage-token": token } : {};
      try {
        const metaRes = await fetch(`/api/replays/${id}`, { headers });
        if (metaRes.status === 404) {
          if (!cancelled) setLoad({ kind: "missing" });
          return;
        }
        if (!metaRes.ok) throw new Error(`HTTP ${metaRes.status}`);
        const meta: Meta = await metaRes.json();
        const dataRes = await fetch(`/api/replays/${id}/data`, { headers });
        if (!dataRes.ok) throw new Error(`HTTP ${dataRes.status}`);
        const data: ReplayData = await dataRes.json();
        if (meta.canManage && token) {
          rememberOwned({
            id,
            token,
            fileName: meta.fileName ?? "replay",
            mapName: meta.mapName,
            durationMs: meta.durationMs,
            createdAt: meta.createdAt,
          });
        }
        if (!cancelled) setLoad({ kind: "ready", meta, data, token: meta.canManage ? token : null });
      } catch (err) {
        if (!cancelled) setLoad({ kind: "error", message: err instanceof Error ? err.message : String(err) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (load.kind === "loading") return <main className="message-page muted">Cargando replay…</main>;
  if (load.kind === "missing") {
    return (
      <main className="message-page">
        <h1>No encontramos este replay</h1>
        <p className="muted">Puede que no exista, que haya expirado o que sea privado.</p>
        <Link href="/">Subir un replay</Link>
      </main>
    );
  }
  if (load.kind === "error") {
    return (
      <main className="message-page">
        <h1>No se pudo cargar el replay</h1>
        <p className="muted">{load.message}</p>
      </main>
    );
  }

  const { meta, data, token } = load;

  async function copy(text: string, done: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice(done);
    } catch {
      window.prompt("Copiá el enlace:", text);
    }
  }

  async function setPublic(isPublic: boolean) {
    const res = await fetch(`/api/replays/${meta.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", "x-manage-token": token ?? "" },
      body: JSON.stringify({ isPublic }),
    });
    if (!res.ok) {
      setNotice("No se pudo cambiar la visibilidad.");
      return;
    }
    setLoad({ ...load, meta: { ...meta, isPublic } } as Load);
    setNotice(isPublic ? "Ahora cualquiera con el enlace puede verlo." : "Ahora es privado.");
  }

  async function remove() {
    if (!window.confirm("¿Eliminar este replay? No se puede deshacer.")) return;
    const res = await fetch(`/api/replays/${meta.id}`, {
      method: "DELETE",
      headers: { "x-manage-token": token ?? "" },
    });
    if (!res.ok) {
      setNotice("No se pudo eliminar.");
      return;
    }
    forgetOwned(meta.id);
    router.push("/");
  }

  const shareUrl = `${location.origin}/r/${meta.id}`;
  const actions = meta.canManage ? (
    <div className="replay-actions">
      <span className={`badge${meta.isPublic ? " public" : ""}`}>{meta.isPublic ? "Público" : "Privado"}</span>
      <button type="button" onClick={() => setPublic(!meta.isPublic)}>
        {meta.isPublic ? "Hacer privado" : "Hacer público"}
      </button>
      {meta.isPublic && (
        <button type="button" onClick={() => copy(shareUrl, "Enlace para compartir copiado.")}>
          Copiar enlace
        </button>
      )}
      <button
        type="button"
        title="Quien tenga este enlace puede ver, cambiar y borrar el replay"
        onClick={() => copy(`${shareUrl}#k=${token}`, "Enlace de gestión copiado. Guardalo: no se puede recuperar.")}
      >
        Enlace de gestión
      </button>
      <button type="button" onClick={remove}>
        Eliminar
      </button>
      {meta.expiresAt && (
        <span className="muted small">Se borra el {new Date(meta.expiresAt).toLocaleDateString("es")}</span>
      )}
      {notice && <p className="notice">{notice}</p>}
    </div>
  ) : null;

  return <ReplayViewer data={data} actions={actions} />;
}
