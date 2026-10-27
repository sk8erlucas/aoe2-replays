// Replay engine: turns the parser JSON into a state that can be queried at any
// time. No DOM here, so it can be tested in Node and reused with other renderers.
//
// A replay only stores player commands, so this is an approximation: units walk
// in a straight line to their target, trained units appear next to the building
// that trained them, and buildings rise linearly over an estimated build time.

import {
  BUILD_TIMES, DEFAULT_BUILD_TIME, DEFAULT_FOOTPRINT, DEFAULT_SPEED, DEFAULT_TRAIN_TIME,
  FOOTPRINTS, HIDDEN_OBJECT_TYPES, SPEEDS, TRAIN_TIMES,
} from './palette.js';

const MOVING_COMMANDS = new Set(['MOVE', 'ORDER', 'BUILD', 'WALL', 'GATHER_POINT']);

export function formatTime(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

// Spread a group around its target so units don't stack on one point.
export function formationOffset(index) {
  if (index === 0) return [0, 0];
  const ring = Math.ceil((Math.sqrt(index + 1) - 1) / 2);
  const angle = index * 2.399963; // golden angle
  const r = 0.6 * ring + 0.3;
  return [Math.cos(angle) * r, Math.sin(angle) * r];
}

export class Unit {
  constructor({ id, player, typeId, x, y, t = 0, approx = false }) {
    this.id = id;
    this.player = player;
    this.typeId = typeId;
    this.spawnT = t;
    this.approx = approx;
    // Each segment starts at t0 in (x0, y0) and walks to (x1, y1).
    this.path = [{ t0: t, x0: x, y0: y, x1: x, y1: y, speed: DEFAULT_SPEED }];
    this.speed = DEFAULT_SPEED;
  }

  segmentAt(t) {
    let seg = this.path[0];
    for (const s of this.path) {
      if (s.t0 > t) break;
      seg = s;
    }
    return seg;
  }

  positionAt(t) {
    const seg = this.segmentAt(t);
    const dx = seg.x1 - seg.x0;
    const dy = seg.y1 - seg.y0;
    const dist = Math.hypot(dx, dy);
    if (dist === 0) return { x: seg.x0, y: seg.y0, moving: false, target: null };
    const walked = (seg.speed * Math.max(0, t - seg.t0)) / 1000;
    if (walked >= dist) return { x: seg.x1, y: seg.y1, moving: false, target: null };
    const k = walked / dist;
    return { x: seg.x0 + dx * k, y: seg.y0 + dy * k, moving: true, target: { x: seg.x1, y: seg.y1 } };
  }

  moveTo(t, x, y) {
    const from = this.positionAt(t);
    // Commands at the same time replace each other.
    while (this.path.length > 1 && this.path[this.path.length - 1].t0 >= t) this.path.pop();
    this.path.push({ t0: t, x0: from.x, y0: from.y, x1: x, y1: y, speed: this.speed });
  }
}

export class Replay {
  constructor(data) {
    this.data = data;
    this.legend = data.legend ?? { objects: {}, terrain: {}, technologies: {} };
    this.duration = data.game.duration_ms;
    this.players = data.game.players;
    this.playerByNumber = new Map(this.players.map((p) => [p.number, p]));
    this.units = [];
    this.unitById = new Map();
    this.buildings = [];
    this.buildingById = new Map();
    this.resources = [];
    this.resignedAt = new Map();
    this.log = [];
    // Where each command with a map position was given: drives the camera.
    this.focusPoints = [];

    this.#loadInitialObjects();
    this.#processTimeline();
  }

  objectName(typeId) {
    return this.legend.objects?.[typeId]?.name ?? `#${typeId}`;
  }

  objectCategory(typeId) {
    return this.legend.objects?.[typeId]?.category ?? 'decoration';
  }

  #loadInitialObjects() {
    for (const o of this.data.initial_objects) {
      if (HIDDEN_OBJECT_TYPES.has(o.type_id)) continue;
      const category = this.objectCategory(o.type_id);
      if (category === 'unit' || category === 'animal') {
        this.#addUnit(new Unit({ id: o.id, player: o.player, typeId: o.type_id, x: o.x, y: o.y }));
      } else if (category === 'building') {
        this.#addBuilding({ id: o.id, player: o.player, typeId: o.type_id, x: o.x, y: o.y, t: 0, buildTime: 0 });
      } else if (category !== 'decoration') {
        this.resources.push({ ...o, category });
      }
    }
  }

  #addUnit(unit) {
    unit.speed = SPEEDS[this.objectName(unit.typeId)] ?? DEFAULT_SPEED;
    unit.path[0].speed = unit.speed;
    this.units.push(unit);
    if (unit.id != null) this.unitById.set(unit.id, unit);
    return unit;
  }

  #addBuilding({ id = null, player, typeId, x, y, t, buildTime }) {
    const name = this.objectName(typeId);
    const b = {
      id, player, typeId, x, y, t,
      size: FOOTPRINTS[name] ?? DEFAULT_FOOTPRINT,
      buildTime: buildTime ?? (BUILD_TIMES[name] ?? DEFAULT_BUILD_TIME) * 1000,
      queueEnd: 0,
    };
    this.buildings.push(b);
    if (id != null) this.buildingById.set(id, b);
    return b;
  }

  // Units trained during the game have IDs the header never mentions. The first
  // time a player commands an unknown ID, bind it to the oldest unit that player
  // trained and that is still unbound; if there is none, spawn it at their start.
  #resolveUnit(id, player, t) {
    const known = this.unitById.get(id);
    if (known) return known;
    if (this.buildingById.has(id)) return null;
    const pending = this.units
      .filter((u) => u.id == null && u.player === player)
      .sort((a, b) => a.spawnT - b.spawnT)[0];
    if (pending) {
      pending.id = id;
      if (pending.spawnT > t) {
        pending.spawnT = t;
        pending.path[0].t0 = t;
      }
      this.unitById.set(id, pending);
      return pending;
    }
    const start = this.playerByNumber.get(player)?.start ?? { x: 0, y: 0 };
    return this.#addUnit(new Unit({ id, player, typeId: null, x: start.x + 2, y: start.y + 2, t, approx: true }));
  }

  #processTimeline() {
    const selection = new Map();
    for (const e of this.data.timeline) {
      let ids = e.object_ids ?? [];
      if (ids.length) selection.set(e.player, ids);
      else ids = selection.get(e.player) ?? [];

      if (e.type === 'DE_QUEUE') this.#queue(e, ids);
      else if (e.type === 'BUILD') this.#build(e);
      else if (e.type === 'WALL') this.#wall(e);
      else if (e.type === 'RESIGN') {
        if (!this.resignedAt.has(e.player)) {
          this.resignedAt.set(e.player, e.t);
          this.log.push({ t: e.t, player: e.player, kind: 'resign', text: 'abandona' });
        }
        continue;
      } else if (e.type === 'RESEARCH') {
        const tech = this.legend.technologies?.[e.technology_id] ?? `tech #${e.technology_id}`;
        this.log.push({ t: e.t, player: e.player, kind: 'research', text: `investiga ${tech}` });
      }

      if (MOVING_COMMANDS.has(e.type) && e.x != null) {
        this.focusPoints.push({ t: e.t, player: e.player, x: e.x, y: e.y });
      }

      if (MOVING_COMMANDS.has(e.type) && e.x != null && e.type !== 'GATHER_POINT') {
        ids.map((id) => this.#resolveUnit(id, e.player, e.t))
          .filter(Boolean)
          .forEach((unit, i) => {
            const [ox, oy] = formationOffset(i);
            unit.moveTo(e.t, e.x + ox, e.y + oy);
          });
      }
    }
    for (const c of this.data.chat ?? []) {
      this.log.push({ t: c.t, player: c.player, kind: 'chat', text: c.message });
    }
    this.log.sort((a, b) => a.t - b.t);
  }

  #queue(e, ids) {
    const building = this.buildingById.get(ids[0]);
    const name = this.objectName(e.unit_id);
    this.log.push({ t: e.t, player: e.player, kind: 'queue', text: `entrena ${e.amount}× ${name}` });
    if (!building) return;
    const trainTime = (TRAIN_TIMES[name] ?? DEFAULT_TRAIN_TIME) * 1000;
    for (let i = 0; i < e.amount; i++) {
      const start = Math.max(e.t, building.queueEnd);
      building.queueEnd = start + trainTime;
      const [ox, oy] = formationOffset(this.units.length % 12);
      this.#addUnit(new Unit({
        id: null, player: e.player, typeId: e.unit_id,
        x: building.x + building.size / 2 + 0.5 + ox, y: building.y + building.size / 2 + 0.5 + oy,
        t: building.queueEnd, approx: true,
      }));
    }
  }

  #build(e) {
    this.#addBuilding({ player: e.player, typeId: e.building_id, x: e.x, y: e.y, t: e.t });
    this.log.push({ t: e.t, player: e.player, kind: 'build', text: `construye ${this.objectName(e.building_id)}` });
  }

  #wall(e) {
    const steps = Math.max(Math.abs(e.x_end - e.x), Math.abs(e.y_end - e.y));
    for (let i = 0; i <= steps; i++) {
      const k = steps === 0 ? 0 : i / steps;
      this.#addBuilding({
        player: e.player, typeId: e.building_id,
        x: Math.round(e.x + (e.x_end - e.x) * k), y: Math.round(e.y + (e.y_end - e.y) * k),
        t: e.t,
      });
    }
    this.log.push({ t: e.t, player: e.player, kind: 'build', text: `construye ${this.objectName(e.building_id)} (${steps + 1} tramos)` });
  }

  stateAt(t) {
    const units = [];
    for (const u of this.units) {
      if (u.spawnT > t) continue;
      units.push({ unit: u, ...u.positionAt(t) });
    }
    const buildings = [];
    for (const b of this.buildings) {
      if (b.t > t) continue;
      const progress = b.buildTime > 0 ? Math.min(1, (t - b.t) / b.buildTime) : 1;
      buildings.push({ building: b, progress });
    }
    const resigned = new Set([...this.resignedAt].filter(([, rt]) => rt <= t).map(([p]) => p));
    return { t, units, buildings, resigned };
  }

  /** Last place a player gave an order at or before t, else their start. */
  focusOf(player, t) {
    let found = null;
    for (const f of this.focusPoints) {
      if (f.t > t) break;
      if (f.player === player) found = f;
    }
    return found ?? { t: 0, player, ...(this.playerByNumber.get(player)?.start ?? { x: 0, y: 0 }) };
  }

  /** Most recent positioned order by a player still in the game. */
  latestFocus(t) {
    let found = null;
    for (const f of this.focusPoints) {
      if (f.t > t) break;
      const resigned = this.resignedAt.get(f.player);
      if (resigned == null || resigned > t) found = f;
    }
    return found;
  }

  logUntil(t) {
    let end = 0;
    while (end < this.log.length && this.log[end].t <= t) end++;
    return this.log.slice(0, end);
  }
}
