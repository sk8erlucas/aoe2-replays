// Game notices that the replay stores as chat. No DOM.
//
// Besides what players type, DE records its own announcements in the chat
// stream, written in the recording player's language with a placeholder for the
// player: "<player_id,5,0> advanced to the Feudal Age." / "... ha avanzado a la
// Edad Feudal.". They are not chat, but they are exact: the time of each one is
// when the game announced the age-up.

const NOTICE = /<player_id,(\d+),\d+>/;

/** True for a game announcement stored as chat (not typed by a player). */
export function isSystemMessage(message) {
  return NOTICE.test(message?.message ?? '');
}

/** Only what players wrote. */
export function playerChat(data) {
  return (data.chat ?? []).filter((c) => !isSystemMessage(c));
}

/**
 * Times of the game's notices per player, sorted, or null when the replay has
 * none (older versions, or a game that ended before anyone advanced).
 */
export function noticeTimes(data) {
  const byPlayer = new Map();
  let any = false;
  for (const c of data.chat ?? []) {
    const m = NOTICE.exec(c.message ?? '');
    if (!m) continue;
    any = true;
    const player = Number(m[1]);
    if (!byPlayer.has(player)) byPlayer.set(player, []);
    byPlayer.get(player).push(c.t);
  }
  if (!any) return null;
  for (const list of byPlayer.values()) list.sort((a, b) => a - b);
  return byPlayer;
}

/**
 * Arrival in each age. `clicks` are a player's first click on each age research,
 * in age order: { clickedAt, seconds, ... }. With notices (`times`, that player's
 * notice times, from noticeTimes), arrival is the next notice after the click
 * (exact), and a click with no notice after it was cancelled or the game ended
 * first (reachedAt null). Without them it is click + research time (estimated).
 */
export function settleAgeUps(clicks, times) {
  if (!times) return clicks.map((c) => ({ ...c, reachedAt: c.clickedAt + c.seconds * 1000, exact: false }));
  let i = 0;
  return clicks.map((c) => {
    while (i < times.length && times[i] < c.clickedAt) i++;
    return { ...c, reachedAt: i < times.length ? times[i++] : null, exact: true };
  });
}
