"use client";

import { useState } from "react";
import { useFavorites } from "@/components/useFavorites";
import { useI18n } from "@/i18n/I18nProvider";
import type { FavoriteKind } from "@/lib/localFavorites";

type Props = { kind: FavoriteKind; targetId: string; title: string; onNotice: (text: string) => void };

/** Star on a match or replay page: adds it to (or takes it out of) the favorites. */
export function FavoriteButton({ kind, targetId, title, onNotice }: Props) {
  const { t } = useI18n();
  const { list, loggedIn, save, remove } = useFavorites();
  const [busy, setBusy] = useState(false);
  const starred = list?.find((f) => f.kind === kind && f.targetId === targetId && f.second === 0);

  async function toggle() {
    setBusy(true);
    try {
      if (starred) {
        if (await remove(starred.id)) onNotice(t.favorites.removed);
        else onNotice(t.favorites.failed);
      } else {
        const result = await save({ kind, targetId, title });
        onNotice(result.ok ? (loggedIn ? t.favorites.added : t.favorites.addedLocal) : result.message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className="favorite-button"
      aria-pressed={Boolean(starred)}
      disabled={busy || list === null}
      title={starred ? t.favorites.unstarTitle : t.favorites.starTitle}
      onClick={toggle}
    >
      <span aria-hidden="true">{starred ? "★" : "☆"}</span> {starred ? t.favorites.starred : t.favorites.star}
    </button>
  );
}
