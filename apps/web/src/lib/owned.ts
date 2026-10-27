// Replays uploaded from this browser and their management tokens.
// localStorage can be unavailable (private mode, blocked storage), so every
// access is guarded and the app keeps working without it.

export type OwnedReplay = {
  id: string;
  token: string;
  fileName: string;
  mapName: string | null;
  durationMs: number;
  createdAt: string;
};

const KEY = "aoe2-replays:owned";

export function listOwned(): OwnedReplay[] {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function save(list: OwnedReplay[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 100)));
  } catch {
    // Storage unavailable: the management link is the fallback.
  }
}

export function rememberOwned(replay: OwnedReplay) {
  save([replay, ...listOwned().filter((r) => r.id !== replay.id)]);
}

export function forgetOwned(id: string) {
  save(listOwned().filter((r) => r.id !== id));
}

export function tokenFor(id: string): string | null {
  return listOwned().find((r) => r.id === id)?.token ?? null;
}
