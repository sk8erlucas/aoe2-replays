"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { refreshNotifications, useAccount } from "@/components/AccountProvider";
import { PlayerSearch } from "@/components/PlayerSearch";
import { errorText, useI18n } from "@/i18n/I18nProvider";
import { PASSWORD_MAX, PASSWORD_MIN } from "@/lib/validate";

type Follow = { profileId: string; name: string };

export function AccountSettings() {
  const account = useAccount();
  const { t } = useI18n();
  const router = useRouter();
  const [changing, setChanging] = useState(false);
  const [follows, setFollows] = useState<Follow[] | null>(null);
  const [max, setMax] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [deletePassword, setDeletePassword] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/follows")
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { follows: Follow[]; max: number } | null) => {
        if (cancelled || !json) return;
        setFollows(json.follows);
        setMax(json.max);
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, []);

  /** Sends a change; returns its JSON, or null after showing the error. */
  async function send(url: string, method: string, body?: object) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(errorText(t, json?.error?.code, res.status));
        return null;
      }
      return json ?? {};
    } catch {
      setError(t.errors.network);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function link(profileId: number | null) {
    if (!(await send("/api/account", "PATCH", { profileId: profileId === null ? null : String(profileId) }))) return;
    setChanging(false);
    router.refresh();
    refreshNotifications();
  }

  async function follow(profileId: number) {
    const json = await send("/api/follows", "POST", { profileId: String(profileId) });
    if (!json) return;
    setFollows(json.follows);
    refreshNotifications();
  }

  async function unfollow(profileId: string) {
    if (!(await send(`/api/follows/${profileId}`, "DELETE"))) return;
    setFollows((list) => list?.filter((f) => f.profileId !== profileId) ?? null);
    refreshNotifications();
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!(await send("/api/account/password", "POST", { current, next }))) return;
    setCurrent("");
    setNext("");
    setNotice(t.account.passwordSaved);
  }

  async function deleteAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!window.confirm(t.account.deleteConfirm)) return;
    if (!(await send("/api/account", "DELETE", { password: deletePassword }))) return;
    router.push("/");
    router.refresh();
  }

  if (!account) return null;
  const full = follows !== null && follows.length >= max;

  return (
    <main className="page">
      <div className="account-page">
        <h1>{t.account.title}</h1>
        <p className="muted">{t.account.signedInAs(account.email)}</p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="form-notice" role="status">
            {notice}
          </p>
        )}

        <section>
          <h2>{t.account.playerTitle}</h2>
          <p className="muted">{t.account.playerHelp}</p>
          {account.profileId && !changing ? (
            <div className="linked-player">
              <span>
                {t.account.linkedAs} <Link href={`/p/${account.profileId}`}>{account.profileName}</Link>
              </span>
              <button type="button" disabled={busy} onClick={() => setChanging(true)}>
                {t.account.change}
              </button>
              <button type="button" disabled={busy} onClick={() => link(null)}>
                {t.account.unlink}
              </button>
            </div>
          ) : (
            <PlayerSearch size="large" placeholder={t.account.searchPlayer} onPick={(hit) => link(hit.profileId)} />
          )}
        </section>

        <section>
          <div className="follow-head">
            <h2>{t.account.followsTitle}</h2>
            {follows && <span className="muted small">{t.account.followsCount(follows.length, max)}</span>}
          </div>
          <p className="muted">{t.account.followsHelp}</p>
          {full ? (
            <p className="muted">{t.account.followsFull}</p>
          ) : (
            <PlayerSearch size="large" placeholder={t.account.searchFollow} onPick={(hit) => follow(hit.profileId)} />
          )}
          {follows && follows.length === 0 && <p className="muted">{t.account.followsEmpty}</p>}
          {follows && follows.length > 0 && (
            <ul className="follow-list">
              {follows.map((f) => (
                <li key={f.profileId}>
                  <Link href={`/p/${f.profileId}`}>{f.name}</Link>
                  <button type="button" disabled={busy} onClick={() => unfollow(f.profileId)}>
                    {t.account.unfollow}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2>{t.account.passwordTitle}</h2>
          <form className="form-grid" onSubmit={changePassword}>
            <label className="field">
              {t.account.currentPassword}
              <input type="password" required autoComplete="current-password" maxLength={PASSWORD_MAX} value={current} onChange={(e) => setCurrent(e.target.value)} />
            </label>
            <label className="field">
              {t.account.newPassword}
              <input type="password" required autoComplete="new-password" minLength={PASSWORD_MIN} maxLength={PASSWORD_MAX} value={next} onChange={(e) => setNext(e.target.value)} />
              <span className="field-hint">{t.auth.passwordHint(PASSWORD_MIN)}</span>
            </label>
            <div className="form-actions">
              <button type="submit" disabled={busy}>
                {t.account.savePassword}
              </button>
            </div>
          </form>
        </section>

        <section>
          <h2>{t.account.deleteTitle}</h2>
          <p className="muted">{t.account.deleteHelp}</p>
          <form className="form-grid" onSubmit={deleteAccount}>
            <label className="field">
              {t.account.currentPassword}
              <input type="password" required autoComplete="current-password" maxLength={PASSWORD_MAX} value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} />
            </label>
            <div className="form-actions">
              <button type="submit" className="danger" disabled={busy}>
                {t.account.deleteSubmit}
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
