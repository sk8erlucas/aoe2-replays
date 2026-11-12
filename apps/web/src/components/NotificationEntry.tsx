"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/I18nProvider";

/** One match of a linked or followed player, as `GET /api/notifications` returns it. */
export type NotificationItem = {
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

export type NotificationState = { unread: number; items: NotificationItem[]; watching: boolean };

export function postRead(body: { matchId: string } | { all: true }) {
  // keepalive: the read mark must survive the navigation to the match.
  return fetch("/api/notifications/read", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => null);
}

/**
 * One row: the player's name opens their match history, anywhere else on the row opens the match.
 * Links can't nest, so the match link stretches over the row (CSS) and the name sits above it.
 */
export function NotificationEntry({
  item,
  onOpen,
  onPlayer,
}: {
  item: NotificationItem;
  onOpen: () => void;
  onPlayer?: () => void;
}) {
  const { t } = useI18n();
  const map = item.mapName ?? t.common.unknownMap;
  const when = new Date(item.finishedAt).toLocaleString(t.common.dateLocale, { dateStyle: "short", timeStyle: "short" });
  const match = (
    <Link className="bell-match" href={`/m/${item.matchId}?p=${item.profileId}`} onClick={onOpen}>
      {map}
    </Link>
  );
  return (
    <li className={item.read ? "bell-item" : "bell-item unread"}>
      <span className="bell-title">
        {!item.read && <span className="bell-dot" role="img" aria-label={t.notifications.unread} />}
        {item.mine ? (
          <span>
            {t.notifications.mineOn} {match}
          </span>
        ) : (
          <span>
            <Link
              className="bell-player"
              href={`/p/${item.profileId}`}
              title={t.notifications.history(item.playerName)}
              onClick={onPlayer}
            >
              {item.playerName}
            </Link>{" "}
            {t.notifications.playedOn} {match}
          </span>
        )}
      </span>
      <span className="bell-meta">
        <span>{[item.leaderboardName, when].filter(Boolean).join(" · ")}</span>
        {item.won != null && (
          <span className={`result ${item.won ? "win" : "loss"}`}>{item.won ? t.profile.win : t.profile.loss}</span>
        )}
      </span>
    </li>
  );
}
