"use client";

import { useEffect, useState } from "react";
import { refreshNotifications, useAccount } from "@/components/AccountProvider";
import { NotificationEntry, postRead, type NotificationItem } from "@/components/NotificationEntry";
import { useI18n } from "@/i18n/I18nProvider";

const SHOWN = 6;

/** Home: the latest matches of the linked and followed players, from the same list as the bell. */
export function WatchedMatches() {
  const { t } = useI18n();
  const account = useAccount();
  const [items, setItems] = useState<NotificationItem[]>([]);

  useEffect(() => {
    if (!account) return;
    let alive = true;
    void fetch("/api/notifications")
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null)
      .then((data: { items?: NotificationItem[] } | null) => {
        if (alive && data?.items) setItems(data.items.slice(0, SHOWN));
      });
    return () => {
      alive = false;
    };
  }, [account]);

  // Nothing to show without an account or before the first match: no empty section on the home page.
  if (!account || items.length === 0) return null;

  function open(item: NotificationItem) {
    if (item.read) return;
    void postRead({ matchId: item.matchId }).then(refreshNotifications);
  }

  return (
    <section className="section container narrow watched">
      <h2 className="section-title">{t.home.watchedTitle}</h2>
      <div className="ornament" aria-hidden="true">
        ◆
      </div>
      <ul className="bell-list frame">
        {items.map((n) => (
          <NotificationEntry key={n.matchId} item={n} onOpen={() => open(n)} />
        ))}
      </ul>
    </section>
  );
}
