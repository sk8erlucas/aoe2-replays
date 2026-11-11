"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount } from "@/components/AccountProvider";
import { errorText, useI18n } from "@/i18n/I18nProvider";
import { addLocal, listLocal, removeLocal, type Favorite, type FavoriteKind } from "@/lib/localFavorites";

// Pages that show favorites hear about changes made elsewhere on the page.
const EVENT = "aoe2:favorites";
const changed = () => window.dispatchEvent(new Event(EVENT));

export type SaveInput = { kind: FavoriteKind; targetId: string; second?: number; note?: string | null; title: string };
export type SaveResult = { ok: true; favorite: Favorite } | { ok: false; message: string };

/** Favorites of the account when logged in, of this browser otherwise. */
export function useFavorites() {
  const account = useAccount();
  const loggedIn = account !== null;
  const { t } = useI18n();
  // null while loading
  const [list, setList] = useState<Favorite[] | null>(null);

  const reload = useCallback(async () => {
    if (!loggedIn) {
      setList(listLocal());
      return;
    }
    const json = await fetch("/api/favorites")
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null);
    setList(json ? (json.favorites as Favorite[]) : []);
  }, [loggedIn]);

  useEffect(() => {
    void reload();
    const onChange = () => void reload();
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, [reload]);

  const save = useCallback(
    async (input: SaveInput): Promise<SaveResult> => {
      const body = { kind: input.kind, targetId: input.targetId, second: input.second ?? 0, note: input.note ?? null };
      if (!loggedIn) {
        const favorite = addLocal({ ...body, title: input.title });
        if (!favorite) return { ok: false, message: t.errors.favorites_full };
        changed();
        return { ok: true, favorite };
      }
      try {
        const res = await fetch("/api/favorites", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) return { ok: false, message: errorText(t, json?.error?.code, res.status) };
        changed();
        return { ok: true, favorite: json.favorite as Favorite };
      } catch {
        return { ok: false, message: t.errors.network };
      }
    },
    [loggedIn, t],
  );

  const remove = useCallback(
    async (id: string): Promise<boolean> => {
      if (id.startsWith("local:")) {
        removeLocal(id);
        changed();
        return true;
      }
      const res = await fetch(`/api/favorites/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);
      if (!res?.ok) return false;
      changed();
      return true;
    },
    [],
  );

  return { list, loggedIn, save, remove, reload };
}
