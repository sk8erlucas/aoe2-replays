"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ReplayData } from "@aoe2-replays/shared";
import { useAccount } from "@/components/AccountProvider";
import { ReplayViewer } from "@/components/ReplayViewer";
import { FavoriteButton } from "@/components/FavoriteButton";
import { ShareMenu } from "@/components/ShareMenu";
import { errorText, useI18n } from "@/i18n/I18nProvider";
import { forgetOwned, rememberOwned, tokenFor } from "@/lib/owned";

type Meta = {
  id: string;
  isPublic: boolean;
  canManage: boolean;
  /** The management token sent is right (false when managing through the account). */
  tokenValid: boolean;
  /** It belongs to the logged-in account. */
  inAccount: boolean;
  fileName: string | null;
  /** Name given by the owner; only sent to whoever can manage it. */
  title: string | null;
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
  const account = useAccount();
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
        if (meta.tokenValid && token) {
          rememberOwned({
            id,
            token,
            fileName: meta.fileName ?? "replay",
            mapName: meta.mapName,
            durationMs: meta.durationMs,
            createdAt: meta.createdAt,
          });
        }
        if (!cancelled) setLoad({ kind: "ready", meta, data, token: meta.tokenValid ? token : null });
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

  async function saveToAccount() {
    const res = await fetch(`/api/replays/${meta.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", "x-manage-token": token ?? "" },
      body: JSON.stringify({ saveToAccount: true }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => null);
      setNotice(errorText(t, json?.error?.code, res.status));
      return;
    }
    setLoad({ ...load, meta: { ...meta, inAccount: true, expiresAt: null } } as Load);
    setNotice(t.replay.savedToAccount);
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

  async function rename() {
    const value = window.prompt(t.replay.renamePrompt, meta.title ?? "");
    if (value === null) return;
    const res = await fetch(`/api/replays/${meta.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", "x-manage-token": token ?? "" },
      body: JSON.stringify({ title: value.trim().slice(0, 80) }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      setNotice(errorText(t, json?.error?.code, res.status));
      return;
    }
    setLoad({ ...load, meta: { ...meta, title: json?.title ?? null } } as Load);
    setNotice(t.replay.renamed);
  }

  const shareUrl = `${location.origin}/r/${meta.id}`;
  const title = t.share.matchTitle(data.map.name ?? t.common.mapNumber(data.map.id), data.game.players.map((p) => p.name).join(", "));
  const share = meta.isPublic && <ShareMenu url={shareUrl} title={title} onCopied={() => setNotice(t.replay.shareCopied)} />;
  // A private replay only goes to the account's favorites if it's in that account; without
  // an account it goes to this browser, which already holds its management token.
  const canStar = meta.isPublic || meta.inAccount || !account;
  const star = canStar && (
    <FavoriteButton kind="replay" targetId={meta.id} title={meta.title ?? title} onNotice={setNotice} />
  );
  const actions = meta.canManage ? (
    <div className="replay-actions">
      {meta.title && <strong className="replay-title">{meta.title}</strong>}
      <span className={`badge${meta.isPublic ? " public" : ""}`}>{meta.isPublic ? t.replay.public : t.replay.private}</span>
      {meta.inAccount && <span className="badge">{t.replay.inAccount}</span>}
      <button type="button" onClick={() => setPublic(!meta.isPublic)}>
        {meta.isPublic ? t.replay.makePrivate : t.replay.makePublic}
      </button>
      <button type="button" onClick={rename} title={t.replay.renameTitle}>
        {t.replay.rename}
      </button>
      {star}
      {share}
      {token && (
        <button
          type="button"
          title={t.replay.manageTitle}
          onClick={() => copy(`${shareUrl}#k=${token}`, t.replay.manageCopied)}
        >
          {t.replay.manageLink}
        </button>
      )}
      {account && token && !meta.inAccount && (
        <button type="button" title={t.replay.saveToAccountTitle} onClick={saveToAccount}>
          {t.replay.saveToAccount}
        </button>
      )}
      <button type="button" onClick={remove}>
        {t.replay.remove}
      </button>
      {meta.expiresAt && (
        <span className="muted small">{t.replay.expires(new Date(meta.expiresAt).toLocaleDateString(t.common.dateLocale))}</span>
      )}
      {notice && <p className="notice">{notice}</p>}
    </div>
  ) : share ? (
    <div className="replay-actions">
      {star}
      {share}
      {notice && <p className="notice">{notice}</p>}
    </div>
  ) : null;

  return (
    <ReplayViewer
      data={data}
      actions={actions}
      moment={canStar ? { kind: "replay", targetId: meta.id, title: meta.title ?? title } : undefined}
    />
  );
}
