"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { refreshNotifications, useAccount } from "@/components/AccountProvider";
import { errorText, useI18n } from "@/i18n/I18nProvider";

const JSON_HEADERS = { "content-type": "application/json" };

/** On a player's page: follow them, or say that this player is you. */
export function FollowControls({ profileId }: { profileId: string }) {
  const account = useAccount();
  const { t } = useI18n();
  const router = useRouter();
  const [following, setFollowing] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loggedIn = account !== null;

  useEffect(() => {
    if (!loggedIn) return;
    let cancelled = false;
    fetch("/api/follows")
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { follows: Array<{ profileId: string }> } | null) => {
        if (!cancelled && json) setFollowing(json.follows.some((f) => f.profileId === profileId));
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [loggedIn, profileId]);

  if (!account) {
    return (
      <Link className="small" href={`/login?next=${encodeURIComponent(`/p/${profileId}`)}`}>
        {t.follow.loginToFollow}
      </Link>
    );
  }
  if (account.profileId === profileId) return <span className="badge public">{t.follow.itsYou}</span>;

  async function send(url: string, init: RequestInit, done: () => void) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, init);
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        setError(errorText(t, json?.error?.code, res.status));
        return;
      }
      done();
      refreshNotifications();
    } catch {
      setError(t.errors.network);
    } finally {
      setBusy(false);
    }
  }

  const toggleFollow = () =>
    following
      ? send(`/api/follows/${profileId}`, { method: "DELETE" }, () => setFollowing(false))
      : send("/api/follows", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ profileId }) }, () => setFollowing(true));

  const linkAsMe = () =>
    send("/api/account", { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify({ profileId }) }, () => router.refresh());

  return (
    <div className="profile-actions">
      {error && <p className="form-error small">{error}</p>}
      {!account.profileId && (
        <button type="button" disabled={busy} onClick={linkAsMe}>
          {t.follow.thisIsMe}
        </button>
      )}
      {following !== null && (
        <button type="button" disabled={busy} aria-pressed={following} title={following ? t.follow.unfollowTitle : undefined} onClick={toggleFollow}>
          {following ? t.follow.following : t.follow.follow}
        </button>
      )}
    </div>
  );
}
