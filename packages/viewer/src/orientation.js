// The game's map orientation, for the renderer. No DOM.
//
// In the game, tile (0, 0) is the west (left) corner of the map, x grows toward
// the north (top) corner and y toward the south (bottom) corner (Zetnus' RMS
// guide: "land_position 0 0 is the west corner ... 99 0 is the north corner").
// The renderer's projection puts (0, 0) at the top corner (u = x - y,
// v = (x + y) / 2), which shows the map turned 90° clockwise. Rather than
// rewrite every drawing routine, the replay is turned once before the engine
// sees it: (x, y) -> (y, n - x). Gate sprites confirm it: in the game the gate
// on a wall along x is drawn "/", and after the turn it is.
//
// Only the copy given to the engine is turned: analysis and the AI context keep
// the game's coordinates.

const NO_POSITION = -1; // commands without a map position (ungarrison, special) carry -1

function turnPoint(n, x, y) {
  if (x == null || y == null || x <= NO_POSITION || y <= NO_POSITION) return [x, y];
  return [y, n - x];
}

// Per-tile arrays are indexed y * n + x; tile (x, y) becomes tile (y, n - 1 - x).
function turnTiles(n, tiles) {
  if (!Array.isArray(tiles) || tiles.length !== n * n) return tiles;
  const out = new Array(n * n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) out[(n - 1 - x) * n + y] = tiles[y * n + x];
  }
  return out;
}

/** A copy of the replay with every map position turned to the game's orientation (see above). */
export function toGameOrientation(data) {
  const n = data.map?.size;
  if (!n) return data;
  const point = (o) => {
    if (o?.x == null) return o;
    const [x, y] = turnPoint(n, o.x, o.y);
    return { ...o, x, y };
  };
  return {
    ...data,
    game: { ...data.game, players: data.game.players.map((p) => (p.start ? { ...p, start: point(p.start) } : p)) },
    map: { ...data.map, terrain: turnTiles(n, data.map.terrain), elevation: turnTiles(n, data.map.elevation) },
    initial_objects: data.initial_objects.map(point),
    timeline: data.timeline.map((e) => {
      if (e.x == null) return e;
      const out = point(e);
      if (e.x_end != null) [out.x_end, out.y_end] = turnPoint(n, e.x_end, e.y_end);
      return out;
    }),
  };
}

