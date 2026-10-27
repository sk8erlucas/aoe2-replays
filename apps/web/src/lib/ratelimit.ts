// Fixed-window limits kept in memory: enough for a single web instance.
const windows = new Map<string, { start: number; count: number }>();

/** Returns false when `key` already used `limit` hits in the current window. */
export function allow(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const w = windows.get(key);
  if (!w || now - w.start >= windowMs) {
    if (windows.size > 10_000) windows.clear();
    windows.set(key, { start: now, count: 1 });
    return true;
  }
  if (w.count >= limit) return false;
  w.count++;
  return true;
}
