// Favorites without an account: kept in this browser, like the uploaded
// replays in owned.ts. Every access is guarded: storage can be unavailable.

export type FavoriteKind = "match" | "replay";

export type Favorite = {
  /** Server id, or `local:<kind>:<target>:<second>` in this browser. */
  id: string;
  kind: FavoriteKind;
  targetId: string;
  /** Seconds into the match; 0 is the whole match. */
  second: number;
  note: string | null;
  title: string;
  createdAt: string;
};

const KEY = "aoe2-replays:favorites";
export const LOCAL_MAX = 100;

export const localId = (kind: FavoriteKind, targetId: string, second: number) => `local:${kind}:${targetId}:${second}`;

export function listLocal(): Favorite[] {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((f) => f && typeof f.id === "string" && typeof f.targetId === "string") : [];
  } catch {
    return [];
  }
}

function save(list: Favorite[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, LOCAL_MAX)));
  } catch {
    // Storage unavailable: favorites last this visit only.
  }
}

/** Adds or replaces one (same match and second). False when the list is full. */
export function addLocal(f: Omit<Favorite, "id" | "createdAt">): Favorite | null {
  const id = localId(f.kind, f.targetId, f.second);
  const list = listLocal();
  const rest = list.filter((x) => x.id !== id);
  if (rest.length >= LOCAL_MAX) return null;
  const item = { ...f, id, createdAt: new Date().toISOString() };
  save([item, ...rest]);
  return item;
}

export function removeLocal(id: string) {
  save(listLocal().filter((f) => f.id !== id));
}

/** Replaces the whole list (after moving favorites to an account). */
export function replaceLocal(list: Favorite[]) {
  save(list);
}
