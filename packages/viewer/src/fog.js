// Fog of war: what a player (and their team, as in a team game) sees. No DOM.
//
// Each unit and building of the team sees a circle around it the size of its
// line of sight (the game's data). The map is a grid of tiles: 2 seen now,
// 1 seen before (explored), 0 never seen. Explored is approximate: the union of
// what was seen every EXPLORE_STEP_MS, so it never needs replaying every frame.
// Positions are the engine's estimates, and line of sight upgrades (Town
// Watch, Treadmill...) and civilization bonuses are not counted.

export const SEEN = 2;
export const EXPLORED = 1;
const EXPLORE_STEP_MS = 30_000;
const DEFAULT_UNIT_LOS = 4;
const DEFAULT_BUILDING_LOS = 4;
const TOWN_CENTER_LOS = 8;

export class Fog {
  constructor(replay, player) {
    this.replay = replay;
    this.size = replay.data.map.size;
    const me = replay.playerByNumber.get(player);
    const team = me?.team_id ?? 0;
    // Players without a team (1 or less) see alone.
    this.viewers = new Set(team > 1 ? replay.players.filter((p) => p.team_id === team).map((p) => p.number) : [player]);
    this.explored = []; // explored[k]: union of what was seen up to k * EXPLORE_STEP_MS
  }

  /** The grid at t (Uint8Array, index y * size + x). */
  at(t) {
    const grid = this.#seen(t);
    const ever = this.#exploredUntil(t);
    for (let i = 0; i < grid.length; i++) if (!grid[i] && ever[i]) grid[i] = EXPLORED;
    return grid;
  }

  /** True if (x, y) is seen now in `grid`. */
  sees(grid, x, y) {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= this.size || ty >= this.size) return false;
    return grid[ty * this.size + tx] === SEEN;
  }

  #seen(t) {
    const n = this.size;
    const grid = new Uint8Array(n * n);
    const game = this.replay.game;
    const stamp = (x, y, r) => {
      const r2 = r * r;
      for (let dy = -Math.ceil(r); dy <= r; dy++) {
        const ty = Math.floor(y + dy);
        if (ty < 0 || ty >= n) continue;
        const half = Math.sqrt(Math.max(0, r2 - dy * dy));
        const x0 = Math.max(0, Math.floor(x - half));
        const x1 = Math.min(n - 1, Math.floor(x + half));
        grid.fill(SEEN, ty * n + x0, ty * n + x1 + 1);
      }
    };
    for (const u of this.replay.units) {
      if (!this.viewers.has(u.player) || u.spawnT > t || u.removedAt <= t) continue;
      if (u.hidden.length && u.hiddenAt(t)) continue;
      const at = u.positionAt(t);
      stamp(at.x, at.y, game?.units?.[u.typeAt(t)]?.los ?? DEFAULT_UNIT_LOS);
    }
    for (const b of this.replay.buildings) {
      if (!this.viewers.has(b.player) || b.t > t || b.removedAt <= t) continue;
      const known = game?.buildings?.[b.typeId]?.los;
      const los = known ?? (/^Town Center/.test(this.replay.objectName(b.typeId)) ? TOWN_CENTER_LOS : DEFAULT_BUILDING_LOS);
      stamp(b.x, b.y, los + b.size / 2);
    }
    return grid;
  }

  #exploredUntil(t) {
    const k = Math.max(0, Math.floor(t / EXPLORE_STEP_MS));
    for (let i = this.explored.length; i <= k; i++) {
      const now = this.#seen(i * EXPLORE_STEP_MS);
      const before = this.explored[i - 1];
      if (before) for (let j = 0; j < now.length; j++) now[j] = now[j] || before[j];
      this.explored.push(now);
    }
    return this.explored[k];
  }
}
