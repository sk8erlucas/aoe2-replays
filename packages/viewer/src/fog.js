// Fog of war: what a player (and their team, as in a team game) sees. No DOM.
//
// Each unit and building of the team sees a circle around it the size of its
// line of sight (the game's data). The map is a grid of tiles: 2 seen now,
// 1 seen before (explored), 0 never seen. Explored is approximate: the union of
// what was seen every EXPLORE_STEP_MS, so it never needs replaying every frame.
// Positions are the engine's estimates. Line of sight upgrades (Town Watch,
// Town Patrol, the ages for scouts) and civilization bonuses count, from the
// game's effects (Replay.attributeAt).
//
// As in the game, whoever attacks the team shows where it is, even from
// outside its sight: an enemy unit fighting one of the team's (by order or on
// its own) and a castle or tower with the team's units in range are seen
// while it lasts.
//
// Exploring is not the fog: what was explored keeps showing (terrain,
// buildings as last seen) but enemy units only show where the team sees now.
// The lobby's "reveal map" changes where it starts (game.reveal_map): explored,
// the whole map starts explored; all visible, everything is seen; no fog,
// whatever was explored stays seen.

import { BUILDING_FIRE, RANGED_STOP } from './palette.js';

export const SEEN = 2;
export const EXPLORED = 1;
const EXPLORE_STEP_MS = 30_000;
const DEFAULT_UNIT_LOS = 4;
const DEFAULT_BUILDING_LOS = 4;
const TOWN_CENTER_LOS = 8;
const ATTACKER_REVEAL = 1.5; // tiles seen around an attacker out of sight
const ATTACK_REACH = RANGED_STOP + 2; // farther from its target it isn't attacking yet

export class Fog {
  constructor(replay, player) {
    this.replay = replay;
    this.size = replay.data.map.size;
    const me = replay.playerByNumber.get(player);
    const team = me?.team_id ?? 0;
    // Players without a team (1 or less) see alone.
    this.viewers = new Set(team > 1 ? replay.players.filter((p) => p.team_id === team).map((p) => p.number) : [player]);
    this.explored = []; // explored[k]: union of what was seen up to k * EXPLORE_STEP_MS
    this.reveal = replay.data.game.reveal_map ?? 'normal';
  }

  /** False when the match was played with everything visible: the fog hides nothing. */
  get hides() {
    return this.reveal !== 'all_visible';
  }

  /** The grid at t (Uint8Array, index y * size + x). */
  at(t) {
    if (!this.hides) return new Uint8Array(this.size * this.size).fill(SEEN);
    const grid = this.#seen(t);
    if (this.reveal === 'explored') {
      for (let i = 0; i < grid.length; i++) if (!grid[i]) grid[i] = EXPLORED;
      return grid;
    }
    const ever = this.#exploredUntil(t);
    const left = this.reveal === 'no_fog' ? SEEN : EXPLORED;
    for (let i = 0; i < grid.length; i++) if (!grid[i] && ever[i]) grid[i] = left;
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
    const ours = [];
    for (const u of this.replay.units) {
      if (u.player <= 0 || u.spawnT > t || u.removedAt <= t) continue;
      if (u.hidden.length && u.hiddenAt(t)) continue;
      if (!this.viewers.has(u.player)) {
        // An enemy attacking one of the team's shows itself.
        if (!u.targets || u.activityAt(t) !== 'attack') continue;
        let target = null;
        for (const o of u.targets) if (o.t <= t) target = o.target;
        if (!target || !this.viewers.has(target.player) || target.removedAt <= t) continue;
        const at = u.positionAt(t);
        const to = target.positionAt ? target.positionAt(t) : target;
        if (Math.hypot(to.x - at.x, to.y - at.y) <= ATTACK_REACH + (target.size ?? 0) / 2) stamp(at.x, at.y, ATTACKER_REVEAL);
        continue;
      }
      const at = u.positionAt(t);
      ours.push(at);
      stamp(at.x, at.y, this.replay.attributeAt(u.player, u.typeAt(t), 'los', t) ?? DEFAULT_UNIT_LOS);
    }
    for (const b of this.replay.buildings) {
      if (b.t > t || b.removedAt <= t) continue;
      if (!this.viewers.has(b.player)) {
        // An enemy castle or tower shooting at the team's units.
        const fire = b.player > 0 && BUILDING_FIRE[this.replay.objectName(b.typeId)];
        if (!fire || t < b.startT + b.buildTime) continue;
        const reach = fire.range + b.size / 2;
        if (ours.some((at) => Math.abs(at.x - b.x) <= reach && Math.abs(at.y - b.y) <= reach && Math.hypot(at.x - b.x, at.y - b.y) <= reach)) {
          stamp(b.x, b.y, b.size / 2 + ATTACKER_REVEAL);
        }
        continue;
      }
      const known = this.replay.attributeAt(b.player, b.typeId, 'los', t, { building: true });
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
