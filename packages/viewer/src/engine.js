// Replay engine: turns the parser JSON into a state that can be queried at any
// time. No DOM here, so it can be tested in Node and reused with other renderers.
//
// A replay only stores player commands, so this is an approximation: units walk
// in a straight line to their target, trained units appear next to the building
// that trained them and head for its gather point, and buildings rise linearly
// over an estimated build time.
// Resources are consumed by villagers told to gather them, at estimated rates;
// when one runs out they move on to the nearest of the same kind, like in-game.
// Orders on animals become hunting or herding, orders on enemies an attack of a
// fixed length (the replay never says who won), and deleted objects disappear.
// Animals only move in the replay through the clicks on them: an order on an
// animal says where it was right then, so it walks there (a boar lured to the
// town center, a sheep pushed home). Animals are food shared by everyone eating
// them; when one is finished its eaters move on to the nearest of the same kind.
// Deaths are guessed: eaten animals vanish when their food runs out; a unit last
// sent to fight (or into enemy ground) and never ordered again is taken as fallen;
// so are units over the population limit (others must have died) and everything
// of a player who resigns.

import {
  AGE_TECHS, ANIMAL_FOOD, DANGEROUS_ANIMALS, DROP_SITE_REACH, DROP_SITES, RESEARCH_TIMES, ATTACK_HOLD_MS, BUILD_TIMES, DEFAULT_ANIMAL_FOOD, DEFAULT_BUILD_TIME, DEFAULT_FOOTPRINT,
  DEFAULT_SPEED, DEFAULT_TRAIN_TIME, FADE_MS, FALLEN_AFTER_MS, FOOTPRINTS, GATHER_RATES, HERDABLE, HIDDEN_OBJECT_TYPES,
  ENEMY_BASE_RADIUS, ENEMY_BUILDING_REACH, MEAT_RATE, MELEE_STOP, RANGED_CLASSES, RANGED_STOP, RESOURCE_AMOUNTS, RETARGET_RADIUS, SPEEDS, TRAIN_TIMES,
} from './palette.js';
import { isSystemMessage, noticeTimes, settleAgeUps } from './notices.js';

const MOVING_COMMANDS = new Set(['MOVE', 'ORDER', 'BUILD', 'WALL', 'GATHER_POINT']);
// Commands that don't tell the selected units to do anything else: a flare, a
// market trade or a building's queue doesn't stop villagers working.
const KEEPS_WORKING = new Set([
  'GAME', 'DE_TRANSFORM', 'DE_QUEUE', 'RESEARCH', 'GATHER_POINT', 'DE_MULTI_GATHERPOINT', 'STANCE', 'FORMATION',
  'FLARE', 'SELL', 'BUY', 'DE_TRIBUTE', 'RESIGN', 'UNGARRISON', 'DE_107_A',
]);
// Commands whose selection is units (not a building being told to train or rally).
const UNIT_COMMANDS = new Set(['MOVE', 'ORDER', 'BUILD', 'WALL', 'PATROL', 'ATTACK_GROUND', 'DE_ATTACK_MOVE']);
// A unit first commanded this long before its estimated training end can still be it:
// the estimate ignores what speeds training up (civ bonuses).
const BIND_SLACK_MS = 30_000;
// Beyond this gap between an ID's creation and a unit's training end, a pair is as bad as it gets.
const BIND_DRIFT_MS = 300_000;
const GATHER_STEP_MS = 1000;
const GRID_CELL = 4; // tiles per spatial-grid cell for resource lookups
const GATHER_REACH = 1.5; // tiles: closer than this to a resource counts as gathering it

// The ANIMAL_FOOD key in an animal's name, if any: "Wild Boar" -> "Boar", "Cow A" -> "Cow".
const ANIMAL_KINDS = Object.keys(ANIMAL_FOOD).map((k) => [k, new RegExp(`\\b${k}\\b`)]);
function animalKind(name) {
  return ANIMAL_KINDS.find(([, re]) => re.test(name))?.[0] ?? null;
}

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
    this.removedAt = Infinity; // deleted by its owner, eaten, or (estimated) fallen
    this.fell = false; // removedAt is an estimated death: fade out
    this.lastOrderT = -Infinity; // last time its player gave it any order
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
  constructor(data, { gameData = null, dry = false } = {}) {
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
    this.gatherers = new Map(); // unit -> resource or animal food being gathered
    this.animalFood = new Map(); // animal unit -> { animal, kind, remaining, depletedAt }
    this.exits = []; // trained units about to leave their building: { unit, t, building }
    this.afterBuild = []; // builders of a drop site, to start gathering when it is done
    this.simT = 0;
    this.ageUps = new Map(); // player -> [{ age, t }] (arrival: exact with the game's notices, else estimated)

    // Object IDs are handed out in creation order: (id, time) pairs that are known
    // place an unknown ID in time, to bind it to the unit trained around then.
    this.idAnchors = [];
    this.trainedByKey = new Map(); // `${event index}:${i}` -> unit trained by that queue command
    this.dry = dry;

    this.#loadInitialObjects();
    // A dry run only trains: when each unit comes out, to match it with its ID.
    this.plannedIds = dry ? new Map() : Replay.#planIds(new Replay(data, { gameData, dry: true }));
    this.#processTimeline();
    if (dry) return;
    this.#settleAgeUps();
    this.#estimateFalls();
    this.#applyResigns();
    this.#enforcePopulationLimit();
  }

  objectName(typeId) {
    return this.legend.objects?.[typeId]?.name ?? `#${typeId}`;
  }

  objectCategory(typeId) {
    return this.legend.objects?.[typeId]?.category ?? 'decoration';
  }

  #anchor(id, t) {
    if (id == null) return;
    const a = this.idAnchors;
    let lo = 0;
    let hi = a.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (a[mid].id < id) lo = mid + 1;
      else hi = mid;
    }
    a.splice(lo, 0, { id, t });
  }

  // Time window in which an unknown ID was created, from its known neighbours.
  #idWindow(id) {
    let from = 0;
    let to = Infinity;
    for (const a of this.idAnchors) {
      if (a.id < id) from = Math.max(from, a.t);
      else if (a.id > id) {
        to = a.t;
        break;
      }
    }
    return [from, Math.max(from, to)];
  }

  #loadInitialObjects() {
    // All at time 0: sorted once rather than inserted one by one.
    this.idAnchors = this.data.initial_objects.map((o) => ({ id: o.id, t: 0 })).sort((a, b) => a.id - b.id);
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
    const planned = this.trainedByKey.get(this.plannedIds.get(id));
    if (planned && planned.id == null && planned.player === player) return this.#bind(planned, id, t);
    // Prefer the unit trained when this ID was created (IDs grow in creation
    // order), then one already out of its building, then the kind the order wants.
    const [from, to] = this.#idWindow(id);
    const gap = (u) => (u.spawnT < from ? from - u.spawnT : u.spawnT > to ? u.spawnT - to : 0);
    const kindMiss = (u) => (want && this.#isVillager(u) !== (want === 'villager') ? 1 : 0);
    const unbound = this.units
      .filter((u) => u.id == null && u.player === player)
      .sort((a, b) => Math.round((gap(a) - gap(b)) / 5000) || (a.spawnT > t) - (b.spawnT > t)
        || kindMiss(a) - kindMiss(b) || a.spawnT - b.spawnT);
    if (unbound[0]) return this.#bind(unbound[0], id, t);
    const start = this.playerByNumber.get(player)?.start ?? { x: 0, y: 0 };
    return this.#addUnit(new Unit({ id, player, typeId: null, x: start.x + 2, y: start.y + 2, t, approx: true }));
  }

  #bind(unit, id, t) {
    unit.id = id;
    unit.lastOrderT = t; // this is its player's order: it no longer walks to the gather point
    this.#anchor(id, Math.min(unit.spawnT, t));
    if (unit.spawnT > t) {
      unit.spawnT = t;
      unit.path[0].t0 = t;
    }
    this.unitById.set(id, unit);
    return unit;
  }

  /**
   * IDs are handed out in creation order, so a player's unknown IDs sorted by
   * number are their trained units in the order they came out. Matches the two
   * lists keeping that order (most pairs; a unit may never be commanded, and an
   * ID can't be a unit that came out well after its first command, nor a
   * villager if the order was an attack). Returns id -> trained unit key.
   */
  static #planIds(dry) {
    const seen = new Map(); // unknown id -> { t, player, want }
    for (const e of dry.data.timeline) {
      if (!UNIT_COMMANDS.has(e.type)) continue;
      for (const id of e.object_ids ?? []) {
        if (seen.has(id) || dry.unitById.has(id) || dry.buildingById.has(id)) continue;
        seen.set(id, { id, t: e.t, player: e.player, want: dry.#orderWants(e) });
      }
    }
    // When each ID was created, roughly: no later than the first order to any
    // higher ID (of any player), and new units usually get an order soon.
    const all = [...seen.values()].sort((a, b) => b.id - a.id);
    let soonest = Infinity;
    for (const x of all) x.created = soonest = Math.min(soonest, x.t);

    const plan = new Map();
    for (const p of dry.players) {
      const ids = all.filter((x) => x.player === p.number).reverse();
      const units = dry.units.filter((u) => u.key && u.player === p.number).sort((a, b) => a.spawnT - b.spawnT);
      const n = ids.length;
      const m = units.length;
      if (!n || !m) continue;
      // A pair is worth 1 to 2: as many pairs as possible, then the ones whose
      // creation time agrees with the unit's training end.
      const gain = (i, j) => {
        const id = ids[i];
        const u = units[j];
        if (u.spawnT > id.t + BIND_SLACK_MS) return 0;
        if (id.want && dry.#isVillager(u) !== (id.want === 'villager')) return 0;
        return 2 - Math.min(Math.abs(id.created - u.spawnT), BIND_DRIFT_MS) / BIND_DRIFT_MS;
      };
      // Best order-keeping matching: score[i][j] over the first i ids and j units.
      const score = new Float32Array((n + 1) * (m + 1));
      const w = m + 1;
      for (let i = 1; i <= n; i++) {
        for (let j = 1; j <= m; j++) {
          const skip = Math.max(score[(i - 1) * w + j], score[i * w + j - 1]);
          const g = gain(i - 1, j - 1);
          score[i * w + j] = g > 0 ? Math.max(skip, score[(i - 1) * w + j - 1] + g) : skip;
        }
      }
      for (let i = n, j = m; i > 0 && j > 0;) {
        const here = score[i * w + j];
        const g = gain(i - 1, j - 1);
        if (g > 0 && here === Math.fround(score[(i - 1) * w + j - 1] + g)) {
          plan.set(ids[i - 1].id, units[j - 1].key);
          i--;
          j--;
        } else if (here === score[(i - 1) * w + j]) i--;
        else j--;
      }
    }
    return plan;
  }

  #processTimeline() {
    const selection = new Map();
    for (const [index, e] of this.data.timeline.entries()) {
      if (!this.dry) this.#advanceGathering(e.t);
      let ids = e.object_ids ?? [];
      if (ids.length) selection.set(e.player, ids);
      else ids = selection.get(e.player) ?? [];
      if (this.dry) {
        if (e.type === 'DE_QUEUE') this.#queue(e, ids, index);
        else if (e.type === 'BUILD') this.#build(e);
        else if (e.type === 'WALL') this.#wall(e);
        else if (e.type === 'RESEARCH') this.#occupy(e, ids);
        continue;
      }

      // Any new order for a unit interrupts what it was gathering.
      for (const id of KEEPS_WORKING.has(e.type) ? [] : ids) {
        const unit = this.unitById.get(id);
        if (unit) {
          this.#stopGathering(unit, e.t);
          unit.lastOrderT = e.t;
        }
      }
      if (e.type === 'GATHER_POINT') {
        for (const id of ids) {
          const building = this.buildingById.get(id);
          if (!building) continue;
          if (e.x == null) continue;
          building.rally = { targetId: e.target_id, x: e.x, y: e.y };
          (building.rallyPoints ??= []).push({ t: e.t, x: e.x, y: e.y });
        }
      }

      let built = null;
      if (e.type === 'DE_QUEUE') this.#queue(e, ids, index);
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
        this.#occupy(e, ids);
        const age = AGE_TECHS[e.technology_id];
        if (age) {
          const list = this.ageUps.get(e.player) ?? [];
          if (!list.some((a) => a.age === age[0])) list.push({ age: age[0], clickedAt: e.t, seconds: age[1] });
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
            if (built) this.#buildThen(unit, built, e.t);
          });
      }
    }
    this.#advanceGathering(this.duration);
    this.#dropUncommanded();
    for (const c of this.data.chat ?? []) {
      if (!isSystemMessage(c)) this.log.push({ t: c.t, player: c.player, kind: 'chat', text: c.message });
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
    let other = this.unitById.get(e.target_id);
    if (other && other !== unit && (other.removedAt > t || this.animalFood.has(other))) {
      const herdable = HERDABLE.test(this.objectName(other.typeId));
      // Wild animals, and the player's own sheep (herdables belong to whoever found them).
      const animal = other.player === 0 || (herdable && villager && other.player === unit.player);
      if (!animal && !this.#enemies(unit.player, other.player)) return false;
      if (animal) this.#placeAnimal(other, t, e.x, e.y);
      if (animal && villager) {
        let food = this.#foodOf(other);
        // Already eaten (several sent to one sheep): the nearest like it, as in the game.
        if (food.remaining <= 0) food = this.#nextAnimal(food, unit, t);
        if (!food) return false;
        other = food.animal;
        this.#approach(unit, t, other.positionAt(t), MELEE_STOP, i);
        unit.startActivity(t, food.kind);
        this.gatherers.set(unit, food);
        return true;
      }
      this.#approach(unit, t, other.positionAt(t), reach, i);
      unit.startActivity(t, 'attack', t + ATTACK_HOLD_MS);
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
    this.#buildThen(unit, place, t);
    return true;
  }

  // The click of an order on an animal is where the animal was: it walks there,
  // arriving at the time of the click (or as soon as it can from where it was).
  #placeAnimal(animal, t, x, y) {
    if (x == null || y == null || x < 0) return;
    const from = animal.positionAt(t);
    const d = Math.hypot(from.x - x, from.y - y);
    if (d <= GATHER_REACH) return;
    const start = Math.max(animal.placedAt ?? animal.spawnT, t - (d / Math.max(0.1, animal.speed)) * 1000);
    animal.moveTo(start, x, y);
    animal.placedAt = t;
  }

  #foodOf(animal) {
    let food = this.animalFood.get(animal);
    if (!food) {
      const name = this.objectName(animal.typeId);
      const known = animalKind(name);
      food = {
        animal,
        kind: HERDABLE.test(name) ? 'shepherd' : 'hunt',
        // Boars and the like must be lured one by one: eaters never move on to the next.
        retarget: !DANGEROUS_ANIMALS.test(name),
        name: known ?? name,
        remaining: known ? ANIMAL_FOOD[known] : DEFAULT_ANIMAL_FOOD,
        depletedAt: Infinity,
      };
      this.animalFood.set(animal, food);
    }
    return food;
  }

  /** Nearest animal like `food`'s (any herdable for sheep) that `unit` can eat at `now`. */
  #nextAnimal(food, unit, now) {
    if (!food.retarget) return null;
    const from = food.animal.positionAt(now);
    let best = null;
    let bestD = RETARGET_RADIUS;
    for (const other of this.units) {
      if (other === food.animal || other.spawnT > now || other.removedAt <= now) continue;
      if (other.player !== 0 && !(food.kind === 'shepherd' && other.player === unit.player)) continue;
      const name = this.objectName(other.typeId);
      if (food.kind === 'shepherd' ? !HERDABLE.test(name) : (animalKind(name) ?? name) !== food.name) continue;
      if ((this.animalFood.get(other)?.remaining ?? 1) <= 0) continue;
      const at = other.positionAt(now);
      const d = Math.hypot(at.x - from.x, at.y - from.y);
      if (d < bestD) {
        best = other;
        bestD = d;
      }
    }
    return best && this.#foodOf(best);
  }

  // Builders work until the building is done (or a new order comes). Then, like
  // in the game, whoever built a farm farms it, and whoever built a drop site
  // (lumber or mining camp, mill) starts gathering what is next to it.
  #buildThen(unit, building, t) {
    const done = building.t + building.buildTime;
    unit.startActivity(t, 'build', done);
    const name = this.objectName(building.typeId);
    if (name === 'Farm') unit.queueActivity(done, 'farm');
    else if (DROP_SITES[name]) this.afterBuild.push({ unit, t: done, orderT: t, building, kinds: DROP_SITES[name] });
  }

  // The research queues in its building like a unit: what is queued after it waits.
  #occupy(e, ids) {
    const seconds = RESEARCH_TIMES[this.legend.technologies?.[e.technology_id]];
    const building = this.buildingById.get(ids[0]);
    if (!seconds || !building) return;
    building.queueEnd = Math.max(e.t, building.queueEnd) + seconds * 1000;
  }

  /** Closest resource of one of `kinds` with something left, within reach of (x, y). */
  #resourceNear(x, y, kinds, radius) {
    const reach = Math.ceil(radius / GRID_CELL);
    const cx = Math.floor(x / GRID_CELL);
    const cy = Math.floor(y / GRID_CELL);
    let best = null;
    let bestD = radius;
    for (let gx = cx - reach; gx <= cx + reach; gx++) {
      for (let gy = cy - reach; gy <= cy + reach; gy++) {
        for (const r of this.resourceGrid.get(`${gx},${gy}`) ?? []) {
          if (!kinds.includes(r.category) || r.remaining <= 0) continue;
          const d = Math.hypot(r.x - x, r.y - y);
          if (d < bestD) {
            best = r;
            bestD = d;
          }
        }
      }
    }
    return best;
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
    this.#anchor(hit.id, hit.t);
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
    this.#anchor(id, building.t);
    return building;
  }

  #queue(e, ids, index) {
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
      unit.key = `${index}:${i}`;
      this.trainedByKey.set(unit.key, unit);
      this.exits.push({ unit, t: building.queueEnd, building });
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
  }

  /** Closest resource of the same kind that still has something left. */
  #nextResource(from) {
    return this.#resourceNear(from.x, from.y, [from.category], RETARGET_RADIUS);
  }

  // Runs the gathering estimate up to time `to`, one game second at a time.
  // Called before each command so retarget walks stay in chronological order.
  #advanceGathering(to) {
    while (this.simT + GATHER_STEP_MS <= to) {
      this.simT += GATHER_STEP_MS;
      const now = this.simT;
      if (this.exits.length && this.exits.some((g) => g.t <= now)) {
        const ready = this.exits.filter((g) => g.t <= now);
        this.exits = this.exits.filter((g) => g.t > now);
        ready.forEach((g, i) => this.#leaveBuilding(g, now, i));
      }
      if (this.afterBuild.length && this.afterBuild.some((g) => g.t <= now)) {
        const ready = this.afterBuild.filter((g) => g.t <= now);
        this.afterBuild = this.afterBuild.filter((g) => g.t > now);
        for (const g of ready) {
          if (g.unit.lastOrderT > g.orderT || g.unit.removedAt <= now) continue; // ordered elsewhere meanwhile
          const r = this.#resourceNear(g.building.x, g.building.y, g.kinds, DROP_SITE_REACH);
          if (!r) continue;
          g.unit.moveTo(now, r.x, r.y);
          this.gatherers.set(g.unit, r);
          g.unit.startActivity(now, r.category);
        }
      }
      for (const [unit, resource] of this.gatherers) {
        const resigned = this.resignedAt.get(unit.player);
        if (resigned != null && resigned <= now) {
          this.gatherers.delete(unit);
          unit.stopActivity(now);
          continue;
        }
        const animal = resource.animal;
        if (resource.remaining <= 0 || (animal && animal.removedAt <= now)) {
          const next = animal ? this.#nextAnimal(resource, unit, now) : this.#nextResource(resource);
          if (next) {
            this.gatherers.set(unit, next);
            const to = next.animal ? next.animal.positionAt(now) : next;
            if (next.animal) this.#approach(unit, now, to, MELEE_STOP, 0);
            else unit.moveTo(now, to.x, to.y);
            unit.startActivity(now, next.kind ?? next.category);
          } else {
            this.gatherers.delete(unit);
            unit.stopActivity(now);
          }
          continue;
        }
        const at = unit.positionAt(now);
        const spot = animal ? animal.positionAt(now) : resource;
        if (Math.hypot(at.x - spot.x, at.y - spot.y) > GATHER_REACH) {
          // Arrived but the animal had moved on (lured or pushed): follow it.
          if (animal && !at.moving) this.#approach(unit, now, spot, MELEE_STOP, 0);
          continue; // still walking
        }
        const rate = animal ? MEAT_RATE : GATHER_RATES[resource.category] ?? 0;
        resource.remaining -= rate * (GATHER_STEP_MS / 1000);
        if (resource.remaining <= 0) {
          resource.depletedAt = now;
          if (animal) animal.removedAt = Math.min(animal.removedAt, now);
        }
      }
    }
  }

  // A trained unit comes out and goes to its building's gather point as it is
  // now, like in the game: gathers a resource, herds or hunts an animal, helps
  // build, or waits on the ground spot. Not if its player already ordered it.
  #leaveBuilding({ unit, building }, now, i) {
    const rally = building.rally;
    if (!rally || unit.lastOrderT > -Infinity || unit.removedAt <= now) return;
    const resource = this.resourceById.get(rally.targetId);
    if (resource && resource.remaining > 0) {
      unit.moveTo(now, resource.x, resource.y);
      this.gatherers.set(unit, resource);
      unit.startActivity(now, resource.category);
      return;
    }
    if (rally.targetId >= 0 && this.#engage(unit, { t: now, target_id: rally.targetId, x: rally.x, y: rally.y }, i)) return;
    const [ox, oy] = formationOffset(i);
    unit.moveTo(now, rally.x + ox, rally.y + oy);
  }

  // Arrival in each age: the game's notices when the replay has them, else estimated.
  #settleAgeUps() {
    const notices = noticeTimes(this.data);
    for (const [player, clicks] of this.ageUps) {
      const settled = settleAgeUps(clicks.sort((a, b) => a.age - b.age), notices && (notices.get(player) ?? []));
      this.ageUps.set(player, settled.filter((a) => a.reachedAt != null).map((a) => ({ age: a.age, t: a.reachedAt })));
    }
  }

  // A trained unit whose ID never shows up in any command of the whole match is
  // doubtful: it may have been dequeued (cancellations are not in a replay) or
  // have died early. It does its first job (gather point) and then leaves, rather
  // than standing idle for the rest of the game.
  #dropUncommanded() {
    for (const u of this.units) {
      if (!u.key || u.id != null || u.removedAt < Infinity) continue;
      const last = u.activities[u.activities.length - 1];
      let idleFrom;
      if (last) idleFrom = last.t1;
      else {
        const seg = u.path[u.path.length - 1];
        idleFrom = seg.t0 + (Math.hypot(seg.x1 - seg.x0, seg.y1 - seg.y0) / Math.max(0.1, seg.speed)) * 1000;
      }
      if (idleFrom >= this.duration) continue;
      u.removedAt = Math.max(u.spawnT, idleFrom);
      u.fell = true; // fades out
    }
  }

  // A unit whose last order sent it to fight, and that its player never ordered
  // again while still playing well after, most likely fell in that fight.
  #estimateFalls() {
    const lastOrderOf = new Map();
    for (const e of this.data.timeline) {
      if (e.type !== 'GAME' && e.type !== 'DE_TRANSFORM') lastOrderOf.set(e.player, e.t);
    }
    for (const u of this.units) {
      if (u.player <= 0 || u.removedAt < Infinity) continue;
      const playedOn = Math.min(lastOrderOf.get(u.player) ?? 0, this.resignedAt.get(u.player) ?? Infinity);
      const last = u.activities[u.activities.length - 1];
      let fellAt = null;
      if (last?.kind === 'attack' && u.lastOrderT <= last.t0) {
        fellAt = last.t1;
      } else if (!last || last.t1 <= u.lastOrderT) {
        // Last sent somewhere enemy (next to their buildings or base) and left there.
        const seg = u.path[u.path.length - 1];
        const moved = Math.hypot(seg.x1 - seg.x0, seg.y1 - seg.y0);
        if (moved > 0 && seg.t0 >= u.lastOrderT && this.#enemyGround(u.player, seg.x1, seg.y1, seg.t0)) {
          fellAt = seg.t0 + (moved / Math.max(0.1, seg.speed)) * 1000 + ATTACK_HOLD_MS;
        }
      }
      if (fellAt == null || playedOn - fellAt < FALLEN_AFTER_MS) continue;
      u.removedAt = fellAt;
      u.fell = true;
    }
  }

  // In the game a player who resigns loses everything: units fall, buildings collapse.
  #applyResigns() {
    for (const [player, t] of this.resignedAt) {
      for (const u of this.units) {
        if (u.player !== player || u.removedAt <= t) continue;
        // Still in a production queue at the resign: never comes out.
        u.removedAt = Math.max(t, u.spawnT);
        u.fell = u.spawnT <= t;
      }
      for (const b of this.buildings) {
        if (b.player === player && b.removedAt > t && b.t <= t) b.removedAt = t;
      }
    }
  }

  // A player can never have more units than the population limit: when training
  // would go over it, units must have died. The one left unordered longest (army
  // first, villagers last) is taken as fallen right then.
  #enforcePopulationLimit() {
    const limit = this.data.game.population_limit;
    if (!limit) return;
    for (const p of this.players) {
      const mine = this.units.filter((u) => u.player === p.number);
      const spawns = [...mine].sort((a, b) => a.spawnT - b.spawnT);
      for (const born of spawns) {
        const t = born.spawnT;
        if (born.removedAt <= t) continue;
        const alive = mine.filter((u) => u.spawnT <= t && u.removedAt > t);
        let over = alive.length - limit;
        if (over <= 0) continue;
        const stale = alive
          .filter((u) => u !== born)
          .sort((a, b) => this.#isVillager(a) - this.#isVillager(b) || a.lastOrderT - b.lastOrderT || a.spawnT - b.spawnT);
        for (const u of stale) {
          if (over-- <= 0) break;
          u.removedAt = t;
          u.fell = true;
        }
      }
    }
  }

  // Next to an enemy building standing at t, or close to an enemy's starting town.
  #enemyGround(player, x, y, t) {
    for (const p of this.players) {
      if (!this.#enemies(player, p.number) || !p.start) continue;
      if (Math.hypot(p.start.x - x, p.start.y - y) < ENEMY_BASE_RADIUS) return true;
    }
    return this.buildings.some((b) => b.t <= t && b.removedAt > t && this.#enemies(player, b.player)
      && Math.hypot(b.x - x, b.y - y) < b.size / 2 + ENEMY_BUILDING_REACH);
  }

  stateAt(t) {
    const units = [];
    for (const u of this.units) {
      if (u.spawnT > t) continue;
      if (u.removedAt <= t) {
        // Fallen units fade out instead of vanishing.
        if (u.fell && t < u.removedAt + FADE_MS) {
          units.push({ unit: u, ...u.positionAt(t), fading: 1 - (t - u.removedAt) / FADE_MS });
        }
        continue;
      }
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

  /** Where a building's gather point (rally flag) is at time t, or null if none was set. Exact. */
  rallyAt(building, t) {
    let found = null;
    for (const r of building.rallyPoints ?? []) {
      if (r.t > t) break;
      found = r;
    }
    return found && { x: found.x, y: found.y };
  }

  /** Age (1 Dark .. 4 Imperial) a player is in at time t (exact with the game's notices, else estimated). */
  ageAt(player, t) {
    let age = 1;
    for (const a of this.ageUps.get(player) ?? []) if (a.t <= t && a.age > age) age = a.age;
    return age;
  }

  /**
   * Every age arrival (2 Feudal .. 4 Imperial), sorted by time: for
   * flags on the timeline. Arrivals after the end of the match or after the
   * player resigned are left out (the research never finished).
   */
  ageMarks() {
    const marks = [];
    for (const [player, list] of this.ageUps) {
      const end = Math.min(this.duration, this.resignedAt.get(player) ?? Infinity);
      for (const a of list) if (a.t <= end) marks.push({ player, age: a.age, t: a.t });
    }
    return marks.sort((a, b) => a.t - b.t || a.player - b.player);
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

  /**
   * Where the action is: the place with the most positioned orders in the last
   * `windowMs` of game time (recent ones weigh more), from players still in the
   * game. Null if nobody gave a positioned order in that window.
   */
  hotspot(t, { windowMs = 20_000, radius = 12 } = {}) {
    const recent = [];
    for (const f of this.focusPoints) {
      if (f.t > t) break;
      if (f.t < t - windowMs) continue;
      const resigned = this.resignedAt.get(f.player);
      if (resigned == null || resigned > t) recent.push(f);
    }
    if (!recent.length) return null;
    const weight = (f) => 0.3 + 0.7 * (1 - (t - f.t) / windowMs);
    let best = null;
    for (const f of recent) {
      let score = 0;
      let x = 0;
      let y = 0;
      for (const g of recent) {
        if (Math.abs(g.x - f.x) > radius || Math.abs(g.y - f.y) > radius) continue;
        const w = weight(g);
        score += w;
        x += g.x * w;
        y += g.y * w;
      }
      if (!best || score > best.score) best = { score, x: x / score, y: y / score };
    }
    return { x: best.x, y: best.y, score: best.score };
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
