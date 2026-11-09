"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePopup } from "@/components/usePopup";
import { useI18n } from "@/i18n/I18nProvider";

type Item = {
  matchId: string;
  profileId: string;
  playerName: string;
  mine: boolean;
  won: boolean | null;
  mapName: string | null;
  leaderboardName: string | null;
  finishedAt: string;
  read: boolean;
};

type State = { unread: number; items: Item[]; watching: boolean };

const REFRESH_MS = 5 * 60_000;

function postRead(body: object) {
  // keepalive: the read mark must survive the navigation to the match.
  return fetch("/api/notifications/read", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => null);
}

export function NotificationBell() {
  const { t } = useI18n();
  const { open, setOpen, box } = usePopup();
  const [state, setState] = useState<State | null>(null);
  const loadedAt = useRef(0);

  const load = useCallback(async () => {
    loadedAt.current = Date.now();
    const res = await fetch("/api/notifications").catch(() => null);
    if (res?.ok) setState(await res.json());
  }, []);

  useEffect(() => {
    void load();
    // Only while someone is looking: a forgotten tab shouldn't keep asking.
    const refreshIfStale = () => {
      if (document.visibilityState === "visible" && Date.now() - loadedAt.current >= REFRESH_MS) void load();
    };
    const timer = setInterval(refreshIfStale, REFRESH_MS);
    const refreshNow = () => void load();
    document.addEventListener("visibilitychange", refreshIfStale);
    window.addEventListener("aoe2:notifications", refreshNow);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshIfStale);
      window.removeEventListener("aoe2:notifications", refreshNow);
    };
  }, [load]);

  function markRead(item: Item) {
    setOpen(false);
    if (item.read) return;
    setState((s) =>
      s && { ...s, unread: Math.max(0, s.unread - 1), items: s.items.map((i) => (i.matchId === item.matchId ? { ...i, read: true } : i)) },
    );
    void postRead({ matchId: item.matchId });
  }

  function markAll() {
    setState((s) => s && { ...s, unread: 0, items: s.items.map((i) => ({ ...i, read: true })) });
    void postRead({ all: true });
  }

  const unread = state?.unread ?? 0;

  return (
    <div className="topbar-popup" ref={box}>
      <button
        type="button"
        className="topbar-button bell-button"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={t.notifications.open(unread)}
        onClick={() => setOpen(!open)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 8 2.5 8h-17S6 15 6 9" />
          <path d="M10 20.5a2.2 2.2 0 0 0 4 0" />
        </svg>
        {unread > 0 && <span className="bell-count">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div className="topbar-panel bell-panel" role="dialog" aria-label={t.notifications.title}>
          <div className="bell-head">
            <strong>{t.notifications.title}</strong>
            {unread > 0 && (
              <button type="button" className="link" onClick={markAll}>
                {t.notifications.markAll}
              </button>
            )}
          </div>
          {!state && <p className="bell-note">{t.common.loading}</p>}
          {state && state.items.length === 0 && !state.watching && (
            <p className="bell-note">
              {t.notifications.setup}{" "}
              <Link href="/account" onClick={() => setOpen(false)}>
                {t.notifications.setupLink}
              </Link>
            </p>
          )}
          {state && state.items.length === 0 && state.watching && <p className="bell-note">{t.notifications.empty}</p>}
          {state && state.items.length > 0 && (
            <ul className="bell-list">
              {state.items.map((n) => {
                const map = n.mapName ?? t.common.unknownMap;
                return (
                  <li key={n.matchId} className={n.read ? "" : "unread"}>
                    <Link href={`/m/${n.matchId}?p=${n.profileId}`} onClick={() => markRead(n)}>
                      <span className="bell-title">
                        {!n.read && (
                          <span className="bell-dot" role="img" aria-label={t.notifications.unread} />
                        )}
                        <span>{n.mine ? t.notifications.mine(map) : t.notifications.theirs(n.playerName, map)}</span>
                      </span>
                      <span className="bell-meta">
                        <span>
                          {[n.leaderboardName, new Date(n.finishedAt).toLocaleString(t.common.dateLocale, { dateStyle: "short", timeStyle: "short" })]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                        {n.won != null && (
                          <span className={`result ${n.won ? "win" : "loss"}`}>{n.won ? t.profile.win : t.profile.loss}</span>
                        )}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
