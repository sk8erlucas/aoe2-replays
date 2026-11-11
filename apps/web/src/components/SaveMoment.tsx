"use client";

import { useState } from "react";
import { formatTime } from "@aoe2-replays/viewer";
import { usePopup } from "@/components/usePopup";
import { useFavorites } from "@/components/useFavorites";
import { useI18n } from "@/i18n/I18nProvider";
import type { FavoriteKind } from "@/lib/localFavorites";

export type MomentTarget = { kind: FavoriteKind; targetId: string; title: string };

const NOTE_MAX = 140;

type Props = MomentTarget & {
  /** Current playback time in ms, read when the panel opens. */
  now: () => number;
  onNotice: (text: string) => void;
};

/** "Save moment" in the playback bar: the current second plus a short note, into the favorites. */
export function SaveMoment({ kind, targetId, title, now, onNotice }: Props) {
  const { t } = useI18n();
  const { save, loggedIn } = useFavorites();
  const { open, setOpen, box } = usePopup();
  const [second, setSecond] = useState(0);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  function toggle() {
    if (!open) {
      setSecond(Math.max(1, Math.floor(now() / 1000)));
      setNote("");
    }
    setOpen(!open);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const result = await save({ kind, targetId, title, second, note: note.trim() || null });
      if (result.ok) {
        setOpen(false);
        onNotice(loggedIn ? t.favorites.momentSaved(formatTime(second * 1000)) : t.favorites.momentSavedLocal(formatTime(second * 1000)));
      } else {
        onNotice(result.message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="topbar-popup save-moment" ref={box}>
      <button type="button" aria-expanded={open} aria-haspopup="dialog" title={t.favorites.momentHint} onClick={toggle}>
        {t.favorites.saveMoment}
      </button>
      {open && (
        <form className="topbar-panel moment-panel" role="dialog" aria-label={t.favorites.saveMoment} onSubmit={submit}>
          <label className="field">
            {t.favorites.momentAt(formatTime(second * 1000))}
            <input
              type="text"
              value={note}
              maxLength={NOTE_MAX}
              placeholder={t.favorites.notePlaceholder}
              onChange={(e) => setNote(e.target.value)}
              autoFocus
            />
          </label>
          <button type="submit" className="primary" disabled={busy}>
            {t.favorites.save}
          </button>
        </form>
      )}
    </div>
  );
}
