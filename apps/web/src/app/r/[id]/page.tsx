"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ReplayData } from "@aoe2-replays/shared";
import { ReplayViewer } from "@/components/ReplayViewer";
import { useI18n } from "@/i18n/I18nProvider";
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
  const { t } = useI18n();
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

  if (load.kind === "loading") return <main className="page message-page muted">{t.replay.loading}</main>;
  if (load.kind === "missing") {
    return (
      <main className="page message-page">
        <h1>{t.replay.missingTitle}</h1>
        <p className="muted">{t.replay.missingText}</p>
        <Link href="/#upload">{t.home.uploadCta}</Link>
      </main>
    );
  }
  if (load.kind === "error") {
    return (
      <main className="page message-page">
        <h1>{t.replay.errorTitle}</h1>
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
      window.prompt(t.common.copyPrompt, text);
    }
  }

  async function setPublic(isPublic: boolean) {
    const res = await fetch(`/api/replays/${meta.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", "x-manage-token": token ?? "" },
      body: JSON.stringify({ isPublic }),
    });
    if (!res.ok) {
      setNotice(t.replay.visibilityFailed);
      return;
    }
    setLoad({ ...load, meta: { ...meta, isPublic } } as Load);
    setNotice(isPublic ? t.replay.nowPublic : t.replay.nowPrivate);
  }

  async function remove() {
    if (!window.confirm(t.replay.confirmRemove)) return;
    const res = await fetch(`/api/replays/${meta.id}`, {
      method: "DELETE",
      headers: { "x-manage-token": token ?? "" },
    });
    if (!res.ok) {
      setNotice(t.replay.removeFailed);
      return;
    }
    forgetOwned(meta.id);
    router.push("/");
  }

  const shareUrl = `${location.origin}/r/${meta.id}`;
  const actions = meta.canManage ? (
    <div className="replay-actions">
      <span className={`badge${meta.isPublic ? " public" : ""}`}>{meta.isPublic ? t.replay.public : t.replay.private}</span>
      <button type="button" onClick={() => setPublic(!meta.isPublic)}>
        {meta.isPublic ? t.replay.makePrivate : t.replay.makePublic}
      </button>
      {meta.isPublic && (
        <button type="button" onClick={() => copy(shareUrl, t.replay.shareCopied)}>
          {t.common.copyLink}
        </button>
      )}
      <button
        type="button"
        title={t.replay.manageTitle}
        onClick={() => copy(`${shareUrl}#k=${token}`, t.replay.manageCopied)}
      >
        {t.replay.manageLink}
      </button>
      <button type="button" onClick={remove}>
        {t.replay.remove}
      </button>
      {meta.expiresAt && (
        <span className="muted small">{t.replay.expires(new Date(meta.expiresAt).toLocaleDateString(t.common.dateLocale))}</span>
      )}
      {notice && <p className="notice">{notice}</p>}
    </div>
  ) : null;

  return <ReplayViewer data={data} actions={actions} />;
}
