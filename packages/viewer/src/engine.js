// Replay engine: turns the parser JSON into a state that can be queried at any
// time. No DOM here, so it can be tested in Node and reused with other renderers.
//
// A replay only stores player commands, so this is an approximation: units walk
// in a straight line to their target, trained units appear next to the building
// that trained them, and buildings rise linearly over an estimated build time.
// Resources are consumed by villagers told to gather them, at estimated rates;
// when one runs out they move on to the nearest of the same kind, like in-game.
// Orders on animals become hunting or herding, orders on enemies an attack of a
// fixed length (the replay never says who won), and deleted objects disappear.

import {
  AGE_TECHS, ATTACK_HOLD_MS, BUILD_TIMES, DEFAULT_BUILD_TIME, DEFAULT_FOOTPRINT, DEFAULT_SPEED, DEFAULT_TRAIN_TIME,
  FOOTPRINTS, GATHER_RATES, HERDABLE, HIDDEN_OBJECT_TYPES, MELEE_STOP, RANGED_CLASSES, RANGED_STOP,
  RESOURCE_AMOUNTS, RETARGET_RADIUS, SPEEDS, TRAIN_TIMES,
} from './palette.js';

const MOVING_COMMANDS = new Set(['MOVE', 'ORDER', 'BUILD', 'WALL', 'GATHER_POINT']);
const GATHER_STEP_MS = 1000;
const GRID_CELL = 4; // tiles per spatial-grid cell for resource lookups
const GATHER_REACH = 1.5; // tiles: closer than this to a resource counts as gathering it

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
    this.removedAt = Infinity; // deleted by its owner
    this.approx = approx;
    // Each segment starts at t0 in (x0, y0) and walks to (x1, y1).
    this.path = [{ t0: t, x0: x, y0: y, x1: x, y1: y, speed: DEFAULT_SPEED }];
    this.speed = DEFAULT_SPEED;
    // What the unit is doing over time: { t0, t1, kind } with kind a resource
    // category (tree, gold, stone, berries) or 'build'. Chronological.
    this.activities = [];
  }

  startActivity(t, kind, until = Infinity) {
    this.stopActivity(t);
    this.activities.push({ t0: t, t1: until, kind });
  }

  /** Activity after the current one, e.g. farming once the farm is built. */
  queueActivity(t0, kind, until = Infinity) {
    this.activities.push({ t0, t1: until, kind });
  }

  // Ends whatever runs at t and drops anything queued to start later.
  stopActivity(t) {
    while (this.activities.length && this.activities[this.activities.length - 1].t0 >= t) this.activities.pop();
    const last = this.activities[this.activities.length - 1];
    if (last && last.t1 > t) last.t1 = t;
  }

  activityAt(t) {
    for (let i = this.activities.length - 1; i >= 0; i--) {
      const a = this.activities[i];
      if (a.t0 <= t) return a.t1 > t ? a.kind : null;
    }
    return null;
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

// Town centers built during the game use another id than the starting one.
const SAME_BUILDING = { 621: 109, 109: 621 };

export class Replay {
  /**
   * `gameData` (optional, from tools/sprites game-data.json) replaces guessed
   * speeds, train and build times, and says where each unit is trained.
   */
  constructor(data, { gameData = null } = {}) {
    this.data = data;
    this.game = gameData;
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
    this.resourceById = new Map();
    this.resourceGrid = new Map();
    this.gatherers = new Map(); // unit -> resource being gathered
    this.pendingGatherers = []; // trained units sent to a resource by a gather point
    this.simT = 0;
    this.ageUps = new Map(); // player -> [{ age, t }] (estimated arrival)

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
        const r = { ...o, category, remaining: RESOURCE_AMOUNTS[category] ?? Infinity, depletedAt: Infinity };
        this.resources.push(r);
        this.resourceById.set(o.id, r);
        const key = this.#cellKey(o.x, o.y);
        if (!this.resourceGrid.has(key)) this.resourceGrid.set(key, []);
        this.resourceGrid.get(key).push(r);
      }
    }
  }

  #addUnit(unit) {
    unit.speed = this.game?.units?.[unit.typeId]?.speed ?? SPEEDS[this.objectName(unit.typeId)] ?? DEFAULT_SPEED;
    unit.path[0].speed = unit.speed;
    this.units.push(unit);
    if (unit.id != null) this.unitById.set(unit.id, unit);
    return unit;
  }

  #addBuilding({ id = null, player, typeId, x, y, t, buildTime }) {
    const name = this.objectName(typeId);
    const known = this.game?.buildings?.[typeId];
    const b = {
      id, player, typeId, x, y, t,
      size: known?.size || FOOTPRINTS[name] || DEFAULT_FOOTPRINT,
      buildTime: buildTime ?? (known?.buildTime ?? BUILD_TIMES[name] ?? DEFAULT_BUILD_TIME) * 1000,
      queueEnd: 0,
      removedAt: Infinity, // deleted by its owner: leaves rubble
    };
    this.buildings.push(b);
    if (id != null) this.buildingById.set(id, b);
    return b;
  }

  // Units trained during the game have IDs the header never mentions. The first
  // time a player commands an unknown ID, bind it to the oldest unit that player
  // trained and that is still unbound; if there is none, spawn it at their start.
  // `want` ('villager' or 'military', from the kind of order) picks among them
  // first, so an army sent to attack does not take over the newest villagers.
  #resolveUnit(id, player, t, want = null) {
    const known = this.unitById.get(id);
    if (known) return known;
    if (this.buildingById.has(id)) return null;
    // Prefer units already out of their building; IDs grow in creation order.
    const unbound = this.units
      .filter((u) => u.id == null && u.player === player)
      .sort((a, b) => (a.spawnT > t) - (b.spawnT > t) || a.spawnT - b.spawnT);
    const fits = want && unbound.find((u) => u.spawnT <= t && this.#isVillager(u) === (want === 'villager'));
    const pending = fits ?? unbound[0];
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
      this.#advanceGathering(e.t);
      let ids = e.object_ids ?? [];
      if (ids.length) selection.set(e.player, ids);
      else ids = selection.get(e.player) ?? [];

      // Any new command for a unit interrupts what it was gathering.
      for (const id of ids) {
        const unit = this.unitById.get(id);
        if (unit) this.#stopGathering(unit, e.t);
      }
      if (e.type === 'GATHER_POINT') {
        const building = this.buildingById.get(ids[0]);
        if (building) building.rally = this.resourceById.get(e.target_id) ?? null;
      }

      let built = null;
      if (e.type === 'DE_QUEUE') this.#queue(e, ids);
      else if (e.type === 'BUILD') built = this.#build(e);
      else if (e.type === 'WALL') built = this.#wall(e);
      else if (e.type === 'RESIGN') {
        if (!this.resignedAt.has(e.player)) {
          this.resignedAt.set(e.player, e.t);
          this.log.push({ t: e.t, player: e.player, kind: 'resign' });
        }
        continue;
      } else if (e.type === 'DELETE') {
        for (const id of ids) {
          const gone = this.buildingById.get(id) ?? this.unitById.get(id);
          if (gone && gone.player === e.player) gone.removedAt = Math.min(gone.removedAt, e.t);
        }
        continue;
      } else if (e.type === 'RESEARCH') {
        const age = AGE_TECHS[e.technology_id];
        if (age) {
          const list = this.ageUps.get(e.player) ?? [];
          if (!list.some((a) => a.age === age[0])) list.push({ age: age[0], t: e.t + age[1] * 1000 });
          this.ageUps.set(e.player, list);
        }
        const tech = this.legend.technologies?.[e.technology_id] ?? `tech #${e.technology_id}`;
        this.log.push({ t: e.t, player: e.player, kind: 'research', name: tech });
      }

      if (MOVING_COMMANDS.has(e.type) && e.x != null) {
        this.focusPoints.push({ t: e.t, player: e.player, x: e.x, y: e.y });
      }

      if (MOVING_COMMANDS.has(e.type) && e.x != null && e.type !== 'GATHER_POINT') {
        const want = this.#orderWants(e);
        ids.map((id) => this.#resolveUnit(id, e.player, e.t, want))
          .filter(Boolean)
          .forEach((unit, i) => {
            const target = e.type === 'ORDER' ? this.resourceById.get(e.target_id) : null;
            if (target) {
              unit.moveTo(e.t, target.x, target.y);
              this.#stopGathering(unit, e.t);
              this.gatherers.set(unit, target);
              unit.startActivity(e.t, target.category);
              return;
            }
            if (e.type === 'ORDER' && this.#engage(unit, e, i)) return;
            const [ox, oy] = formationOffset(i);
            unit.moveTo(e.t, e.x + ox, e.y + oy);
            // Builders work until the building is done (or a new order comes);
            // whoever builds a farm then farms it, like in the game.
            if (built) {
              const done = built.t + built.buildTime;
              unit.startActivity(e.t, 'build', done);
              if (this.objectName(built.typeId) === 'Farm') unit.queueActivity(done, 'farm');
            }
          });
      }
    }
    this.#advanceGathering(this.duration);
    for (const c of this.data.chat ?? []) {
      this.log.push({ t: c.t, player: c.player, kind: 'chat', text: c.message });
    }
    this.log.sort((a, b) => a.t - b.t);
  }

  // What kind of unit an order is most likely for, to bind unknown IDs.
  #orderWants(e) {
    if (e.type === 'BUILD' || e.type === 'WALL') return 'villager';
    if (e.type !== 'ORDER' || e.target_id == null) return null;
    if (this.resourceById.has(e.target_id)) return 'villager';
    const other = this.unitById.get(e.target_id);
    if (other) return other.player === 0 ? null : this.#enemies(e.player, other.player) ? 'military' : null;
    const place = this.buildingById.get(e.target_id);
    if (place) return this.#enemies(e.player, place.player) ? 'military' : 'villager';
    return null;
  }

  #isVillager(unit) {
    if (unit.typeId == null) return true; // unknown trained units are almost always villagers
    return this.game?.units?.[unit.typeId]?.class === 4 || this.objectName(unit.typeId) === 'Villager';
  }

  // Players without a team (team 1 or less) fight everyone.
  #enemies(a, b) {
    if (a === b || b <= 0) return false;
    const ta = this.playerByNumber.get(a)?.team_id ?? 0;
    const tb = this.playerByNumber.get(b)?.team_id ?? 0;
    return ta <= 1 || tb <= 1 || ta !== tb;
  }

  // Walk toward a point and stop `stop` tiles short of it.
  #approach(unit, t, at, stop, i) {
    const from = unit.positionAt(t);
    const dx = from.x - at.x;
    const dy = from.y - at.y;
    const d = Math.hypot(dx, dy);
    if (d <= stop) {
      unit.moveTo(t, from.x, from.y);
      return;
    }
    const k = stop / d;
    const [ox, oy] = formationOffset(i);
    unit.moveTo(t, at.x + dx * k + ox * 0.4, at.y + dy * k + oy * 0.4);
  }

  /**
   * An ORDER on a unit or building: hunt or herd an animal, attack an enemy,
   * or help build an unfinished building of one's own side. False if it is
   * none of these (the unit then just walks to the clicked point).
   */
  #engage(unit, e, i) {
    const t = e.t;
    if (unit.player <= 0) return false; // herded animals move with their herder's orders, they never fight
    // Fishing, trade and transport: their orders on fish, markets or docks are not attacks.
    if (/Fishing|Trade|Transport/.test(this.objectName(unit.typeId))) return false;
    const villager = this.#isVillager(unit);
    const reach = RANGED_CLASSES.has(this.game?.units?.[unit.typeId]?.class) ? RANGED_STOP : MELEE_STOP;
    const other = this.unitById.get(e.target_id);
    if (other && other !== unit && other.removedAt > t) {
      const animal = other.player === 0;
      if (!animal && !this.#enemies(unit.player, other.player)) return false;
      const herd = animal && villager && HERDABLE.test(this.objectName(other.typeId));
      const kind = animal && villager ? (herd ? 'shepherd' : 'hunt') : 'attack';
      this.#approach(unit, t, other.positionAt(t), villager ? MELEE_STOP : reach, i);
      unit.startActivity(t, kind, kind === 'attack' ? t + ATTACK_HOLD_MS : Infinity);
      return true;
    }
    const place = this.buildingById.get(e.target_id) ?? this.#bindClicked(e);
    if (!place || place.removedAt <= t) return false;
    if (this.#enemies(unit.player, place.player)) {
      this.#approach(unit, t, place, place.size / 2 + (villager ? MELEE_STOP : reach), i);
      unit.startActivity(t, 'attack', t + ATTACK_HOLD_MS);
      return true;
    }
    const done = place.t + place.buildTime;
    if (!villager || place.player !== unit.player || t >= done) return false;
    this.#approach(unit, t, place, place.size / 2 + MELEE_STOP, i);
    unit.startActivity(t, 'build', done);
    if (this.objectName(place.typeId) === 'Farm') unit.queueActivity(done, 'farm');
    return true;
  }

  // An order on a building placed during the game (no known ID yet): the clicked
  // point falls inside its footprint, so that building gets the ID.
  #bindClicked(e) {
    if (e.target_id == null || e.x == null || this.unitById.has(e.target_id)) return null;
    const hit = this.buildings.find((b) => b.id == null && b.t <= e.t && b.removedAt > e.t
      && Math.abs(b.x - e.x) <= b.size / 2 + 0.5 && Math.abs(b.y - e.y) <= b.size / 2 + 0.5);
    if (!hit) return null;
    hit.id = e.target_id;
    this.buildingById.set(hit.id, hit);
    return hit;
  }

  // A building built during the game has no known ID until a command uses it.
  // Bind it to the oldest unbound building of that player that can train the unit.
  #bindBuilding(id, player, unitId, t) {
    const trainedAt = this.game?.units?.[unitId]?.train?.map(([buildingId]) => buildingId);
    if (id == null || !trainedAt) return null;
    const fits = (typeId) => trainedAt.includes(typeId) || trainedAt.includes(SAME_BUILDING[typeId]);
    const building = this.buildings.find((b) => b.id == null && b.player === player && b.t <= t && fits(b.typeId));
    if (!building) return null;
    building.id = id;
    this.buildingById.set(id, building);
    return building;
  }

  #queue(e, ids) {
    const building = this.buildingById.get(ids[0]) ?? this.#bindBuilding(ids[0], e.player, e.unit_id, e.t);
    const name = this.objectName(e.unit_id);
    this.log.push({ t: e.t, player: e.player, kind: 'queue', name, amount: e.amount });
    if (!building) return;
    const trains = this.game?.units?.[e.unit_id]?.train;
    const gameTime = trains?.find(([at]) => at === building.typeId || at === SAME_BUILDING[building.typeId])?.[1];
    const trainTime = (gameTime ?? TRAIN_TIMES[name] ?? DEFAULT_TRAIN_TIME) * 1000;
    for (let i = 0; i < e.amount; i++) {
      const start = Math.max(e.t, building.queueEnd);
      building.queueEnd = start + trainTime;
      const [ox, oy] = formationOffset(this.units.length % 12);
      const unit = this.#addUnit(new Unit({
        id: null, player: e.player, typeId: e.unit_id,
        x: building.x + building.size / 2 + 0.5 + ox, y: building.y + building.size / 2 + 0.5 + oy,
        t: building.queueEnd, approx: true,
      }));
      if (building.rally) this.pendingGatherers.push({ unit, t: building.queueEnd, resource: building.rally });
    }
  }

  #build(e) {
    const building = this.#addBuilding({ player: e.player, typeId: e.building_id, x: e.x, y: e.y, t: e.t });
    // A gate goes on top of the player's wall and replaces those segments (no rubble).
    if (/Gate/.test(this.objectName(e.building_id))) {
      const reach = building.size / 2;
      for (const w of this.buildings) {
        if (w === building || w.player !== e.player || w.size > 1 || w.removedAt <= e.t) continue;
        if (!/Wall/.test(this.objectName(w.typeId))) continue;
        if (Math.abs(w.x - e.x) <= reach && Math.abs(w.y - e.y) <= reach) {
          w.removedAt = e.t;
          w.replaced = true;
        }
      }
    }
    this.log.push({ t: e.t, player: e.player, kind: 'build', name: this.objectName(e.building_id) });
    return building;
  }

  #wall(e) {
    const steps = Math.max(Math.abs(e.x_end - e.x), Math.abs(e.y_end - e.y));
    let last = null;
    for (let i = 0; i <= steps; i++) {
      const k = steps === 0 ? 0 : i / steps;
      last = this.#addBuilding({
        player: e.player, typeId: e.building_id,
        x: Math.round(e.x + (e.x_end - e.x) * k), y: Math.round(e.y + (e.y_end - e.y) * k),
        t: e.t,
      });
    }
    this.log.push({ t: e.t, player: e.player, kind: 'build', name: this.objectName(e.building_id), segments: steps + 1 });
    return last;
  }

  #cellKey(x, y) {
    return `${Math.floor(x / GRID_CELL)},${Math.floor(y / GRID_CELL)}`;
  }

  #stopGathering(unit, t) {
    if (t != null) unit.stopActivity(t);
    this.gatherers.delete(unit);
    this.pendingGatherers = this.pendingGatherers.filter((g) => g.unit !== unit);
  }

  /** Closest resource of the same kind that still has something left. */
  #nextResource(from) {
    const reach = Math.ceil(RETARGET_RADIUS / GRID_CELL);
    const cx = Math.floor(from.x / GRID_CELL);
    const cy = Math.floor(from.y / GRID_CELL);
    let best = null;
    let bestD = RETARGET_RADIUS;
    for (let gx = cx - reach; gx <= cx + reach; gx++) {
      for (let gy = cy - reach; gy <= cy + reach; gy++) {
        for (const r of this.resourceGrid.get(`${gx},${gy}`) ?? []) {
          if (r.category !== from.category || r.remaining <= 0) continue;
          const d = Math.hypot(r.x - from.x, r.y - from.y);
          if (d < bestD) {
            best = r;
            bestD = d;
          }
        }
      }
    }
    return best;
  }

  // Runs the gathering estimate up to time `to`, one game second at a time.
  // Called before each command so retarget walks stay in chronological order.
  #advanceGathering(to) {
    while (this.simT + GATHER_STEP_MS <= to) {
      this.simT += GATHER_STEP_MS;
      const now = this.simT;
      if (this.pendingGatherers.length) {
        const ready = this.pendingGatherers.filter((g) => g.t <= now);
        this.pendingGatherers = this.pendingGatherers.filter((g) => g.t > now);
        for (const g of ready) {
          g.unit.moveTo(now, g.resource.x, g.resource.y);
          this.gatherers.set(g.unit, g.resource);
          g.unit.startActivity(now, g.resource.category);
        }
      }
      for (const [unit, resource] of this.gatherers) {
        const resigned = this.resignedAt.get(unit.player);
        if (resigned != null && resigned <= now) {
          this.gatherers.delete(unit);
          unit.stopActivity(now);
          continue;
        }
        if (resource.remaining <= 0) {
          const next = this.#nextResource(resource);
          if (next) {
            this.gatherers.set(unit, next);
            unit.moveTo(now, next.x, next.y);
            unit.startActivity(now, next.category);
          } else {
            this.gatherers.delete(unit);
            unit.stopActivity(now);
          }
          continue;
        }
        const at = unit.positionAt(now);
        if (Math.hypot(at.x - resource.x, at.y - resource.y) > GATHER_REACH) continue; // still walking
        resource.remaining -= (GATHER_RATES[resource.category] ?? 0) * (GATHER_STEP_MS / 1000);
        if (resource.remaining <= 0) resource.depletedAt = now;
      }
    }
  }

  stateAt(t) {
    const units = [];
    for (const u of this.units) {
      if (u.spawnT > t || u.removedAt <= t) continue;
      units.push({ unit: u, ...u.positionAt(t) });
    }
    const buildings = [];
    const ruins = [];
    for (const b of this.buildings) {
      if (b.t > t) continue;
      if (b.removedAt <= t) {
        if (!b.replaced) ruins.push(b);
        continue;
      }
      const progress = b.buildTime > 0 ? Math.min(1, (t - b.t) / b.buildTime) : 1;
      buildings.push({ building: b, progress });
    }
    const resigned = new Set([...this.resignedAt].filter(([, rt]) => rt <= t).map(([p]) => p));
    return { t, units, buildings, ruins, resigned };
  }

  /** Age (1 Dark .. 4 Imperial) a player is in at time t, estimated from age research. */
  ageAt(player, t) {
    let age = 1;
    for (const a of this.ageUps.get(player) ?? []) if (a.t <= t && a.age > age) age = a.age;
    return age;
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
