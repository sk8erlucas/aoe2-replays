// Paths around obstacles on the map's tile grid, for the engine (no DOM).
//
// Land units can't walk on water and avoid forests (they can go into one, at a
// cost: lumberjacks walk up to their tree); ships stay on water. This is an
// estimate: buildings, cliffs and trees that were cut down are not taken into
// account, and the game's own pathing is more elaborate.

// What a terrain is for walking, from its legend entry. "Water, Shallow" (the
// river of Highland) is water a unit can't cross; "Shallows" can be walked.
export function terrainKind(entry) {
  const name = entry?.name ?? '';
  const category = entry?.category ?? '';
  if (/Shallows|Bridge/i.test(name)) return 'shallows'; // "Water, Bridge" can be walked too
  if (category === 'water' || category === 'deep_water' || /^Water|Deep Water/i.test(name)) return 'water';
  if (category === 'shallows') return 'shallows';
  if (category === 'forest') return 'forest';
  return 'land';
}

// Cost of a step into a forest tile, against 1 for open ground. Estimated: high
// enough that units go around a wood when the way round isn't much longer.
export const FOREST_COST = 6;
// Paths that would explore more tiles than this give up (straight line).
const MAX_EXPANDED = 60_000;
const SQRT2 = Math.SQRT2;
// Weighted A*: paths up to this much longer than the best, found far faster
// around woods (several times fewer tiles explored).
const HEURISTIC_WEIGHT = 2;
const CACHE_SIZE = 4000;

/** Costs per tile (0: blocked) for one kind of mover over a square map. */
export class NavGrid {
  constructor(size, cost) {
    this.size = size;
    this.cost = cost; // Uint8Array, size * size
    this.cache = new Map();
    const n = size * size;
    this.g = new Float32Array(n);
    this.from = new Int32Array(n);
    this.seen = new Uint32Array(n); // search stamp: tiles touched in the current search
    this.closed = new Uint32Array(n);
    this.stamp = 0;
    this.heap = new MinHeap();
  }

  /** Grids for land units and ships from a replay's map, or null without terrain. */
  static fromMap(map, legend) {
    const size = map?.size;
    const terrain = map?.terrain;
    if (!size || !terrain || terrain.length !== size * size) return null;
    const kinds = new Map();
    const land = new Uint8Array(size * size);
    const water = new Uint8Array(size * size);
    for (let i = 0; i < terrain.length; i++) {
      let kind = kinds.get(terrain[i]);
      if (!kind) kinds.set(terrain[i], (kind = terrainKind(legend?.[terrain[i]])));
      land[i] = kind === 'water' ? 0 : kind === 'forest' ? FOREST_COST : 1;
      water[i] = kind === 'water' ? 1 : 0;
    }
    return { land: new NavGrid(size, land), water: new NavGrid(size, water) };
  }

  costAt(x, y) {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    if (cx < 0 || cy < 0 || cx >= this.size || cy >= this.size) return 0;
    return this.cost[cy * this.size + cx];
  }

  // True when the segment only crosses tiles at most `limit` costly (and none
  // blocked). The tiles it starts and ends in don't count: a lumberjack walks up
  // to a tree at the edge of the wood.
  #clear(x0, y0, x1, y1, limit) {
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 3);
    const a = Math.floor(y0) * this.size + Math.floor(x0);
    const b = Math.floor(y1) * this.size + Math.floor(x1);
    for (let i = 1; i < steps; i++) {
      const k = i / steps;
      const x = x0 + (x1 - x0) * k;
      const y = y0 + (y1 - y0) * k;
      const tile = Math.floor(y) * this.size + Math.floor(x);
      if (tile === a || tile === b) continue;
      const c = this.costAt(x, y);
      if (c === 0 || c > limit) return false;
    }
    return true;
  }

  /**
   * Waypoints from (x0, y0) to (x1, y1), the last one the target (or the nearest
   * reachable tile when the target can't be reached, like a unit sent into the
   * water stopping on the shore). A straight line when nothing is in the way.
   */
  path(x0, y0, x1, y1) {
    const startCost = this.costAt(x0, y0);
    const endCost = this.costAt(x1, y1);
    // Nothing worse than where it starts or ends: straight there.
    if (endCost > 0 && this.#clear(x0, y0, x1, y1, Math.max(1, Math.min(startCost || 1, endCost)))) return [{ x: x1, y: y1 }];
    const n = this.size;
    const sx = Math.min(n - 1, Math.max(0, Math.floor(x0)));
    const sy = Math.min(n - 1, Math.max(0, Math.floor(y0)));
    let goal = this.#nearestOpen(Math.floor(x1), Math.floor(y1));
    if (goal < 0) return [{ x: x1, y: y1 }];
    const start = sy * n + sx;
    if (goal === start) return [endCost > 0 ? { x: x1, y: y1 } : center(goal, n)];
    const key = start * n * n + goal;
    let cells = this.cache.get(key);
    if (cells === undefined) {
      cells = this.#search(start, goal);
      if (this.cache.size >= CACHE_SIZE) this.cache.delete(this.cache.keys().next().value);
      this.cache.set(key, cells);
    }
    if (!cells) return [{ x: x1, y: y1 }];
    const points = this.#smooth(x0, y0, cells);
    // The target itself if it can be stood on, else the middle of the last tile.
    if (endCost > 0 && cells[cells.length - 1] === Math.floor(y1) * n + Math.floor(x1)) points[points.length - 1] = { x: x1, y: y1 };
    return points;
  }

  // The tile itself if passable, else the closest passable one nearby (or -1).
  #nearestOpen(cx, cy) {
    const n = this.size;
    cx = Math.min(n - 1, Math.max(0, cx));
    cy = Math.min(n - 1, Math.max(0, cy));
    if (this.cost[cy * n + cx] > 0) return cy * n + cx;
    for (let r = 1; r <= 12; r++) {
      let best = -1;
      let bestD = Infinity;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = cx + dx;
          const y = cy + dy;
          if (x < 0 || y < 0 || x >= n || y >= n || this.cost[y * n + x] === 0) continue;
          const d = dx * dx + dy * dy;
          if (d < bestD) {
            bestD = d;
            best = y * n + x;
          }
        }
      }
      if (best >= 0) return best;
    }
    return -1;
  }

  // A* over 8 neighbours (no corner cutting past a blocked tile). Tile indexes
  // from start to goal, or null if there is no way (or it is too far to look).
  #search(start, goal) {
    const n = this.size;
    const { g, from, seen, closed, heap, cost } = this;
    const stamp = ++this.stamp;
    const gx = goal % n;
    const gy = (goal / n) | 0;
    const h = (i) => {
      const dx = Math.abs((i % n) - gx);
      const dy = Math.abs(((i / n) | 0) - gy);
      return HEURISTIC_WEIGHT * (Math.max(dx, dy) + (SQRT2 - 1) * Math.min(dx, dy));
    };
    heap.clear();
    seen[start] = stamp;
    g[start] = 0;
    from[start] = -1;
    heap.push(start, h(start));
    let expanded = 0;
    while (heap.size) {
      const i = heap.pop();
      if (closed[i] === stamp) continue;
      closed[i] = stamp;
      if (i === goal) break;
      if (++expanded > MAX_EXPANDED) return null;
      const x = i % n;
      const y = (i / n) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= n) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx;
          if (nx < 0 || nx >= n) continue;
          const j = ny * n + nx;
          const c = cost[j];
          if (c === 0 || closed[j] === stamp) continue;
          if (dx && dy && (cost[y * n + nx] === 0 || cost[ny * n + x] === 0)) continue;
          const ng = g[i] + c * (dx && dy ? SQRT2 : 1);
          if (seen[j] === stamp && ng >= g[j]) continue;
          seen[j] = stamp;
          g[j] = ng;
          from[j] = i;
          heap.push(j, ng + h(j));
        }
      }
    }
    if (closed[goal] !== stamp) return null;
    const cells = [];
    for (let i = goal; i !== -1; i = from[i]) cells.push(i);
    return cells.reverse();
  }

  // Keeps only the turns: skips ahead to the farthest tile in a straight line
  // that crosses nothing costlier than the path itself does there.
  #smooth(x0, y0, cells) {
    const n = this.size;
    const points = [];
    let at = { x: x0, y: y0 };
    let i = 0;
    while (i < cells.length - 1) {
      let limit = 1;
      let next = i + 1;
      for (let j = i + 1; j < cells.length; j++) {
        limit = Math.max(limit, this.cost[cells[j]]);
        const p = center(cells[j], n);
        if (this.#clear(at.x, at.y, p.x, p.y, limit)) next = j;
        else if (j - next > 8) break;
      }
      at = center(cells[next], n);
      points.push(at);
      i = next;
    }
    if (!points.length) points.push(center(cells[cells.length - 1], n));
    return points;
  }
}

function center(i, n) {
  return { x: (i % n) + 0.5, y: Math.floor(i / n) + 0.5 };
}

class MinHeap {
  constructor() {
    this.items = new Int32Array(1024);
    this.keys = new Float64Array(1024);
    this.size = 0;
  }

  clear() {
    this.size = 0;
  }

  push(item, key) {
    if (this.size === this.items.length) {
      const items = new Int32Array(this.size * 2);
      const keys = new Float64Array(this.size * 2);
      items.set(this.items);
      keys.set(this.keys);
      this.items = items;
      this.keys = keys;
    }
    let i = this.size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p] <= key) break;
      this.items[i] = this.items[p];
      this.keys[i] = this.keys[p];
      i = p;
    }
    this.items[i] = item;
    this.keys[i] = key;
  }

  pop() {
    const top = this.items[0];
    const item = this.items[--this.size];
    const key = this.keys[this.size];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= this.size) break;
      if (c + 1 < this.size && this.keys[c + 1] < this.keys[c]) c++;
      if (this.keys[c] >= key) break;
      this.items[i] = this.items[c];
      this.keys[i] = this.keys[c];
      i = c;
    }
    this.items[i] = item;
    this.keys[i] = key;
    return top;
  }
}
