// Replay engine: turns the parser JSON into a state that can be queried at any
// time. No DOM here, so it can be tested in Node and reused with other renderers.
//
// A replay only stores player commands, so this is an approximation: units walk
// to their target around water and woods (ships keep to the water; see
// pathing.js), trained units appear next to the building
// that trained them and head for its gather point, and buildings rise linearly
// over an estimated build time.
// Resources are consumed by villagers told to gather them, at estimated rates
// (what each tree, mine, bush or animal holds is the game's, from game-data.json);
// when one runs out they move on to the nearest of the same kind, like in-game.
// Gatherers are drawn walking their loads to the nearest drop site and back.
// Orders on animals become hunting or herding, orders on enemies an attack of a
// fixed length (the replay never says who won), and deleted objects disappear.
// Animals only move in the replay through the clicks on them: an order on an
// animal says where it was right then, so it walks there (a boar lured to the
// town center, a sheep pushed home). Animals are food shared by everyone eating
// them; when one is finished its eaters move on to the nearest of the same kind.
// Deaths are guessed: eaten animals vanish when their food runs out; a unit last
// sent to fight (or into enemy ground) and never ordered again is taken as fallen;
// so are units over the population limit (others must have died). What a player
// who resigns leaves stays where it was, idle. A building under a real assault (siege or several
// soldiers) that its owner never uses again is taken as razed, and one with a
// new foundation over it as gone by then.
// Garrisoned units are inside their building (not drawn) until let out; back
// to work sends them to what they were doing. A builder that is done goes on to
// the nearest unfinished building of its player.
// Researches queue in their building and take the game's time; when one ends,
// the units it upgrades (Knight -> Cavalier) change, since queue orders always
// name the base unit. Units and researches taken out of a queue are in the
// replay (SPECIAL order 4): they never happen and the queue moves up.

import {
  AGE_TECHS, ANIMAL_FOOD, CARCASS_ROT_MS, DANGEROUS_ANIMALS, DROP_SITE_REACH, DROP_SITES, RESEARCH_TIMES, ATTACK_HOLD_MS, BUILD_TIMES, DEFAULT_ANIMAL_FOOD, DEFAULT_BUILD_TIME, DEFAULT_FOOTPRINT,
  DEFAULT_SPEED, DEFAULT_TRAIN_TIME, FADE_MS, FALLEN_AFTER_MS, FOOTPRINTS, GATHER_RATES, HERDABLE, HIDDEN_OBJECT_TYPES,
  ENEMY_BASE_RADIUS, ENEMY_BUILDING_REACH, FARM_RATE, HUNTED_REACH, MEAT_RATE, MELEE_STOP, RANGED_CLASSES, RANGED_STOP, RESOURCE_AMOUNTS, RETARGET_RADIUS, SPEEDS, TRAIN_TIMES,
} from './palette.js';
import { isSystemMessage, noticeTimes, settleAgeUps } from './notices.js';
import { NavGrid } from './pathing.js';
import { stockTimeline } from './economy.js';

// How far a villager sent to a taken farm looks for a free one (tiles). Estimated.
const FARM_SEARCH = 10;
// Longest a foundation waits for its first builder; beyond, that builder isn't
// taken as the first one (see #joinCrew). Estimated.
const FOUNDATION_WAIT_MS = 90_000;
// How far a builder that is done looks for another building to put up (tiles). Estimated.
const BUILD_SEARCH = 10;
// Build orders from the same group this close together are one shift-queue.
const BUILD_QUEUE_GAP_MS = 3000;
// Attack-move and patrol walk to the clicked point too (a patrol then goes back and forth; not modelled).
const MOVING_COMMANDS = new Set(['MOVE', 'ORDER', 'BUILD', 'WALL', 'GATHER_POINT', 'DE_ATTACK_MOVE', 'PATROL']);
// Commands that don't tell the selected units to do anything else: a flare, a
// market trade or a building's queue doesn't stop villagers working.
const KEEPS_WORKING = new Set([
  'GAME', 'DE_TRANSFORM', 'DE_QUEUE', 'RESEARCH', 'GATHER_POINT', 'DE_MULTI_GATHERPOINT', 'STANCE', 'FORMATION',
  'FLARE', 'SELL', 'BUY', 'DE_TRIBUTE', 'RESIGN', 'UNGARRISON', 'DE_107_A',
  // Its other orders are unknown; garrisoning (order 5) is handled on its own.
  'SPECIAL', 'TOWN_BELL', 'BACK_TO_WORK',
]);
// SPECIAL with this order_id and an own building as target: garrison in it.
const GARRISON_ORDER = 5;
// SPECIAL with this order_id on a building: take one out of its production
// queue (slot_id: which icon, counting from the one in production). Measured
// with the replay's resource totals: the cost comes back.
const DEQUEUE_ORDER = 4;
// A building's production queue holds this many (units and researches), like in the game.
const QUEUE_LIMIT = 15;
// The town bell sends this many villagers (the town center holds 15) from this
// far (tiles) into the town center. Estimated.
const BELL_CAPACITY = 15;
const BELL_RADIUS = 20;
// Commands whose selection is units (not a building being told to train or rally).
const UNIT_COMMANDS = new Set(['MOVE', 'ORDER', 'BUILD', 'WALL', 'PATROL', 'ATTACK_GROUND', 'DE_ATTACK_MOVE']);
// A unit first commanded this long before its estimated training end can still be it:
// the estimate ignores what speeds training up (civ bonuses).
const BIND_SLACK_MS = 30_000;
// Beyond this gap between an ID's creation and a unit's training end, a pair is as bad as it gets.
const BIND_DRIFT_MS = 300_000;
// Commands given to buildings: a later unit order without IDs is for the units
// selected before (a MOVE can't be for a barracks; its gather point is GATHER_POINT).
const BUILDING_COMMANDS = new Set(['DE_QUEUE', 'RESEARCH', 'GATHER_POINT', 'DE_MULTI_GATHERPOINT', 'BUY', 'SELL', 'DE_TRANSFORM']);
const GATHER_STEP_MS = 1000;
const GRID_CELL = 4; // tiles per spatial-grid cell for resource lookups
const GATHER_REACH = 1.5; // tiles: closer than this to a resource counts as gathering it

// The ANIMAL_FOOD key in an animal's name, if any: "Wild Boar" -> "Boar", "Cow A" -> "Cow".
const ANIMAL_KINDS = Object.keys(ANIMAL_FOOD).map((k) => [k, new RegExp(`\\b${k}\\b`)]);
function animalKind(name) {
  return ANIMAL_KINDS.find(([, re]) => re.test(name))?.[0] ?? null;
}

/**
 * Commands without object IDs reuse the player's previous selection. Returns a
 * function giving each command's IDs in timeline order. Unit orders take the
 * last selection that was not a building's.
 */
export function selectionTracker() {
  const any = new Map();
  const units = new Map();
  return (e) => {
    const ids = e.object_ids ?? [];
    if (ids.length) {
      any.set(e.player, ids);
      if (!BUILDING_COMMANDS.has(e.type)) units.set(e.player, ids);
      return ids;
    }
    return (BUILDING_COMMANDS.has(e.type) ? any : units).get(e.player) ?? [];
  };
}

// The parser read SPECIAL and UNGARRISON actions one byte off before November
// 2026 (28824 came out as 7378944); replays stored then still carry those IDs.
// Real IDs stay far below 2^20.
function fixShiftedIds(timeline) {
  for (const e of timeline) {
    if ((e.type !== 'SPECIAL' && e.type !== 'UNGARRISON') || !e.object_ids?.length) continue;
    if (e.object_ids.every((id) => id >= 1 << 20)) e.object_ids = e.object_ids.map((id) => id >> 8);
  }
}

// Objects the parser didn't know before November 2026 (aocref lacks them):
// replays stored then have them nameless, and the bushes as decoration.
const LEGEND_FIXES = {
  2650: { name: 'Pineapple Bush', category: 'berries' },
  2084: { name: 'Wild Chicken A', category: 'animal' },
  2086: { name: 'Wild Chicken B', category: 'animal' },
  2088: { name: 'Wild Chicken C', category: 'animal' },
};
function withLegendFixes(legend) {
  const missing = Object.keys(LEGEND_FIXES).filter((id) => legend.objects?.[id] && legend.objects[id].name == null);
  if (!missing.length) return legend;
  const objects = { ...legend.objects };
  for (const id of missing) objects[id] = LEGEND_FIXES[id];
  return { ...legend, objects };
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
    // Upgrades researched while it lives (Knight -> Cavalier): [{ t, typeId }], chronological.
    this.upgrades = [];
    // Times inside a building (garrisoned): [{ t0, t1 }], not drawn then.
    this.hidden = [];
  }

  hiddenAt(t) {
    for (const h of this.hidden) if (h.t0 <= t && t < h.t1) return true;
    return false;
  }

  /** Its type at t: the trained one, or the last upgrade done by then. */
  typeAt(t) {
    let type = this.typeId;
    for (const u of this.upgrades) {
      if (u.t > t) break;
      type = u.typeId;
    }
    return type;
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
    // Commands at the same time replace each other (and what was left of the way there).
    while (this.path.length > 1 && this.path[this.path.length - 1].t0 >= t) this.path.pop();
    // Around obstacles: one segment per leg, each starting when the last one ends.
    const points = this.nav && (from.x !== x || from.y !== y) ? this.nav.path(from.x, from.y, x, y) : [{ x, y }];
    let t0 = t;
    let at = from;
    for (const p of points) {
      this.path.push({ t0, x0: at.x, y0: at.y, x1: p.x, y1: p.y, speed: this.speed });
      t0 += (Math.hypot(p.x - at.x, p.y - at.y) / Math.max(0.1, this.speed)) * 1000;
      at = p;
    }
  }

  /** When it gets to the end of its last order's way (its path is all straight legs). */
  arrivalT() {
    const seg = this.path[this.path.length - 1];
    return seg.t0 + (Math.hypot(seg.x1 - seg.x0, seg.y1 - seg.y0) / Math.max(0.1, seg.speed)) * 1000;
  }
}

// Town centers built during the game use another id than the starting one.
const SAME_BUILDING = { 621: 109, 109: 621 };
const TC_FOUNDATION = 621;
const TOWN_CENTER = 109;
// Population room of a town center (the game's data; 109 is not among the buildings villagers place).
const TOWN_CENTER_POP = 5;
// How close a unit told to follow or guard stays to its target (tiles). Estimated.
const FOLLOW_STOP = 1.5;
// Siege (rams, mangonels, bombards, scorpions; trebuchets by name): one is enough to raze.
const SIEGE_CLASSES = new Set([13, 51, 54, 55]);
const SIEGE_NAME = /Trebuchet|Ram|Mangonel|Onager|Bombard|Cannon|Scorpion/;
// Without siege, this many soldiers sent against a building is taken as an assault. Estimated.
const RAZE_MIN_ATTACKERS = 3;
// Footprints that overlap by more than this (tiles) can't both stand.
const OVERLAP_SLACK = 0.25;
const CASTLE = 82;
// The stone gates a player builds, by the axis they run along on the map the
// renderer gets (turned by toGameOrientation; in the game's own coordinates it is
// the other way around). See #mapGates.
const GATE_ALONG_X = 490;
const GATE_ALONG_Y = 487;
// Engine activity -> villager job for the panels.
// Gathering -> the drop sites that take it (a town center takes everything).
const DROP_OFF = {
  tree: ['Lumber Camp'], gold: ['Mining Camp'], stone: ['Mining Camp'],
  berries: ['Mill'], farm: ['Mill'], hunt: ['Mill'], shepherd: ['Mill'],
};
const DROP_ANYTHING = /^Town Center/;
// What a villager carries before walking to drop it off, and how much faster it
// gathers than the estimated rates (those include the walks). Estimated, for the
// look of it: the gathering totals don't depend on these.
const CARRY = 10;
const RAW_RATE = 1.4;
// Farther than this from any drop site (tiles), no trips are drawn.
const TRIP_MAX = 15;
const VILLAGER_JOB = {
  tree: 'wood', gold: 'gold', stone: 'stone', berries: 'food', farm: 'food', hunt: 'food', shepherd: 'food',
  build: 'build', attack: 'other',
};
// Unit classes (game data) -> army kind for the panels. Civilian classes are no army:
// villager, trade cog, trade cart, transport, fishing ship, king, herdable livestock.
const ARMY_CLASSES = {
  6: 'infantry', 35: 'infantry',
  0: 'archers', 36: 'archers', 44: 'archers',
  12: 'cavalry', 23: 'cavalry', 47: 'cavalry',
  13: 'siege', 51: 'siege', 54: 'siege', 55: 'siege',
  22: 'ships', 53: 'ships',
  18: 'monks',
};
const CIVILIAN_CLASSES = new Set([2, 4, 19, 20, 21, 58, 59]);
// Unit classes (game data) that move on water: trade cog, transport, fishing ship, warships.
const SHIP_CLASSES = new Set([2, 20, 21, 22, 53]);
const SHIP_NAME = /Ship|Boat|Galley|Galleon|Cog|Longboat|Caravel|Dromon|Junk|Canoe|Raft|Carrack|Lou Chuan|Catamaran/;

export class Replay {
  /**
   * `gameData` (optional, from tools/sprites game-data.json) replaces guessed
   * speeds, train and build times, and says where each unit is trained.
   */
  constructor(data, { gameData = null, dry = false } = {}) {
    this.data = data;
    this.game = gameData;
    this.legend = withLegendFixes(data.legend ?? { objects: {}, terrain: {}, technologies: {} });
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
    this.wallLines = []; // one per wall command: its pieces, builders and log entry
    this.wallBuilder = new Map(); // villager id -> the wall line it is building
    this.farmers = new Map(); // farm -> the villager last sent to farm it
    this.simT = 0;
    this.ageUps = new Map(); // player -> [{ age, t }] (arrival: exact with the game's notices, else estimated)
    // Each research once per player: { player, techId, name, building, t0, t1 } (t1 estimated).
    this.researches = [];
    // Taken out of a queue: { player, t, at (when queued), unitId | techId }. Paid, then given back.
    this.cancelled = [];

    // Object IDs are handed out in creation order: (id, time) pairs that are known
    // place an unknown ID in time, to bind it to the unit trained around then.
    this.idAnchors = [];
    this.trainedByKey = new Map(); // `${event index}:${i}` -> unit trained by that queue command
    this.dry = dry;

    if (!dry) fixShiftedIds(data.timeline);
    this.nav = dry ? null : NavGrid.fromMap(data.map, this.legend.terrain);
    this.#loadInitialObjects();
    // A dry run only trains: when each unit comes out, to match it with its ID.
    this.plannedIds = dry ? new Map() : Replay.#planIds(new Replay(data, { gameData, dry: true }));
    this.#processTimeline();
    if (dry) return;
    this.#applyUpgrades();
    this.#settleWalls();
    this.#settleAgeUps();
    this.#estimateFalls();
    this.#estimateRazed();
    this.#clearBuiltOver();
    this.#applyResigns();
    this.#enforcePopulationLimit();
  }

  objectName(typeId) {
    // Upgraded units (Cavalier) are in no command, so not in the legend: the game data names them.
    return this.legend.objects?.[typeId]?.name ?? this.game?.names?.[typeId] ?? `#${typeId}`;
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

  // Gates a map starts with (Arena, fortresses) are in the header as the game
  // keeps them: a middle piece ("Gate (up.)", "Gate (down.)"...) and two side
  // posts ("Gate"), each its own object. A gate a player builds is one object
  // whose sprite already has the posts: the middle piece is drawn as the built
  // gate along the same axis, and the posts are left out.
  #mapGates() {
    const name = (o) => this.objectName(o.type_id);
    const middles = this.data.initial_objects.filter((o) => /^Gate \(.+\)$/.test(name(o)));
    const posts = new Set();
    const drawAs = new Map();
    for (const m of middles) {
      const mine = this.data.initial_objects.filter((o) => o !== m && o.player === m.player && name(o) === 'Gate'
        && Math.hypot(o.x - m.x, o.y - m.y) <= 2);
      for (const o of mine) posts.add(o);
      const alongX = mine.length ? Math.abs(mine[0].x - m.x) > Math.abs(mine[0].y - m.y) : m.y % 1 !== 0;
      drawAs.set(m, alongX ? GATE_ALONG_X : GATE_ALONG_Y);
    }
    return { posts, drawAs };
  }

  #loadInitialObjects() {
    // All at time 0: sorted once rather than inserted one by one.
    this.idAnchors = this.data.initial_objects.map((o) => ({ id: o.id, t: 0 })).sort((a, b) => a.id - b.id);
    const gates = this.#mapGates();
    for (const o of this.data.initial_objects) {
      if (HIDDEN_OBJECT_TYPES.has(o.type_id) || gates.posts.has(o)) continue;
      const category = this.objectCategory(o.type_id);
      if (category === 'unit' || category === 'animal') {
        this.#addUnit(new Unit({ id: o.id, player: o.player, typeId: o.type_id, x: o.x, y: o.y }));
      } else if (category === 'building') {
        const look = gates.drawAs.get(o);
        const b = this.#addBuilding({ id: o.id, player: o.player, typeId: o.type_id, x: o.x, y: o.y, t: 0, buildTime: 0 });
        if (look) {
          b.drawAs = look;
          b.size = this.game?.buildings?.[look]?.size || b.size;
        }
      } else if (category !== 'decoration') {
        const r = { ...o, category, remaining: this.game?.gaia?.[o.type_id] ?? RESOURCE_AMOUNTS[category] ?? Infinity, depletedAt: Infinity };
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
    // Units and animals walk on land, ships sail on water. Anything else that
    // starts on water (fish) goes straight wherever it is clicked.
    if (this.nav) {
      const ship = unit.typeId != null
        && (SHIP_CLASSES.has(this.game?.units?.[unit.typeId]?.class) || SHIP_NAME.test(this.objectName(unit.typeId)));
      if (ship) unit.nav = this.nav.water;
      else if (this.nav.land.costAt(unit.path[0].x0, unit.path[0].y0) > 0) unit.nav = this.nav.land;
    }
    unit.path[0].speed = unit.speed;
    this.units.push(unit);
    if (unit.id != null) this.unitById.set(unit.id, unit);
    return unit;
  }

  #buildSeconds(typeId) {
    return this.game?.buildings?.[typeId]?.buildTime ?? BUILD_TIMES[this.objectName(typeId)] ?? DEFAULT_BUILD_TIME;
  }

  #addBuilding({ id = null, player, typeId, x, y, t, buildTime }) {
    const name = this.objectName(typeId);
    const known = this.game?.buildings?.[typeId];
    const b = {
      id, player, typeId, x, y, t,
      size: known?.size || FOOTPRINTS[name] || DEFAULT_FOOTPRINT,
      buildTime: buildTime ?? this.#buildSeconds(typeId) * 1000,
      // Placed at t (a foundation); construction starts at startT. Only walls
      // differ: their pieces go up one after another (see #wall).
      startT: t,
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
    unit.boundAt = t; // its first order: it was out by then
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
    const selected = selectionTracker();
    for (const [index, e] of this.data.timeline.entries()) {
      if (!this.dry) this.#advanceGathering(e.t);
      let ids = selected(e);
      if (e.type === 'SPECIAL' && e.order_id === DEQUEUE_ORDER) {
        for (const id of ids) {
          const b = this.buildingById.get(id);
          if (b && b.player === e.player) this.#dequeue(b, e.slot_id ?? 0, e.t);
        }
        continue;
      }
      if (this.dry) {
        if (e.type === 'DE_QUEUE') this.#queue(e, ids, index);
        else if (e.type === 'BUILD') this.#build(e, this.#samePlace(e));
        else if (e.type === 'WALL') this.#wall(e, ids);
        else if (e.type === 'RESEARCH') this.#occupy(e, ids);
        continue;
      }

      // Shift-queued foundations: the group shares them out, one villager each
      // (the first gets everyone, each later one takes the next villager). The
      // same spot clicked again places nothing new.
      let builders = ids;
      let samePlace = null;
      if (e.type === 'BUILD') {
        samePlace = this.#samePlace(e);
        const k = this.#queuedBuild(e, ids, samePlace);
        if (k > 0) builders = k < ids.length ? [ids[k]] : [];
        if (samePlace && k !== 0) builders = [];
      }
      ids = builders;

      if (e.type === 'SPECIAL' && e.order_id === GARRISON_ORDER) {
        const building = this.buildingById.get(e.target_id);
        if (building && building.player === e.player) {
          this.#garrison(ids.map((id) => this.unitById.get(id)), building, e.t);
          continue;
        }
      } else if (e.type === 'TOWN_BELL') {
        const tc = this.buildingById.get(e.building_id);
        if (tc && tc.player === e.player) {
          if (e.mode === 1) this.#garrison(this.#bellVillagers(tc, e.t), tc, e.t);
          else this.#ungarrison(tc, e.t, true);
        }
        continue;
      } else if (e.type === 'BACK_TO_WORK' || e.type === 'UNGARRISON') {
        for (const id of ids) {
          const b = this.buildingById.get(id);
          if (b && b.player === e.player) this.#ungarrison(b, e.t, e.type === 'BACK_TO_WORK');
        }
        continue;
      }

      // Any new order for a unit interrupts what it was gathering (or the wall it was building).
      for (const id of KEEPS_WORKING.has(e.type) ? [] : ids) {
        this.#leaveWall(id, e.t);
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
      else if (e.type === 'BUILD') built = this.#build(e, samePlace);
      else if (e.type === 'WALL') built = this.#wall(e, ids);
      else if (e.type === 'RESIGN') {
        if (!this.resignedAt.has(e.player)) {
          this.resignedAt.set(e.player, e.t);
          this.log.push({ t: e.t, player: e.player, kind: 'resign' });
        }
        continue;
      } else if (e.type === 'DELETE') {
        const unknown = ids.some((id) => !this.buildingById.has(id) && !this.unitById.has(id));
        if (unknown) this.#bindDeletedWall(this.#deleteBurst(index), e);
        // Pieces deleted one by one come about a second apart.
        const burst = unknown ? this.#deleteBurst(index, 5000) : null;
        const deleted = [];
        for (const id of ids) {
          const gone = this.buildingById.get(id) ?? this.unitById.get(id) ?? this.#bindDeleted(id, e.player, e.t, burst);
          if (!gone || gone.player !== e.player || gone.removedAt <= e.t) continue;
          gone.removedAt = e.t;
          if (gone instanceof Unit) gone.deleted = true; // fades out
          deleted.push(gone);
        }
        if (deleted.length) {
          this.log.push({ t: e.t, player: e.player, kind: 'delete', name: this.objectName(deleted[0].typeAt?.(e.t) ?? deleted[0].typeId), amount: deleted.length });
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

      // A click on an animal says where it is, whoever gives it: after a lure the
      // town center's arrows and gather point on the boar are often the only clicks
      // that show it arrived.
      const clicked = e.target_id != null && e.x != null ? this.unitById.get(e.target_id) : null;
      if (clicked && (clicked.player === 0 || HERDABLE.test(this.objectName(clicked.typeId)))) {
        this.#placeAnimal(clicked, e.t, e.x, e.y);
      }

      // Stop: stand where it is. Follow and guard: walk up to the target (where it
      // is right then; following it afterwards isn't modelled).
      if (e.type === 'STOP') {
        for (const id of ids) {
          const unit = this.unitById.get(id);
          if (!unit) continue;
          const at = unit.positionAt(e.t);
          unit.moveTo(e.t, at.x, at.y);
        }
      } else if ((e.type === 'FOLLOW' || e.type === 'GUARD') && e.target_id != null) {
        const other = this.unitById.get(e.target_id);
        const target = other ? other.positionAt(e.t) : this.buildingById.get(e.target_id);
        const stop = other ? FOLLOW_STOP : (target?.size ?? 0) / 2 + FOLLOW_STOP;
        if (target) {
          ids.map((id) => this.unitById.get(id))
            .filter((u) => u && u !== other && u.player === e.player)
            .forEach((unit, i) => this.#approach(unit, e.t, target, stop, i));
        }
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
  // How many others eat this: each new eater takes the next place around it.
  #eatersOf(food, unit) {
    let n = 0;
    for (const [other, f] of this.gatherers) if (f === food && other !== unit) n++;
    return n;
  }

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
    if (!villager || place.player !== unit.player) return false;
    if (t >= place.startT + place.buildTime) {
      if (this.objectName(place.typeId) !== 'Farm') return false;
      // One farmer per farm: if it's taken, the nearest free one, like in the game.
      const farm = this.#freeFarm(place, unit, t);
      this.#approach(unit, t, farm, MELEE_STOP, 0);
      this.#farm(unit, farm, t);
      return true;
    }
    this.#approach(unit, t, place, place.size / 2 + MELEE_STOP, i);
    // A wall piece nobody had reached yet: this villager starts it on arrival.
    if (place.line) {
      const at = unit.positionAt(t);
      const arrive = t + (Math.hypot(place.x - at.x, place.y - at.y) / Math.max(0.1, unit.speed)) * 1000;
      place.helpStart = Math.min(place.helpStart ?? Infinity, arrive);
    }
    this.#buildThen(unit, place, t);
    return true;
  }

  // Units walk into a building and stay inside (out of sight) until let out,
  // remembering what they were doing for "back to work".
  #garrison(units, building, t) {
    let i = 0;
    for (const unit of units) {
      if (!unit || unit.player !== building.player || unit.removedAt <= t || unit.garrison) continue;
      const resume = { resource: this.gatherers.get(unit) ?? null, kind: unit.activityAt(t), farm: unit.farm ?? null };
      if (unit.id != null) this.#leaveWall(unit.id, t);
      this.#stopGathering(unit, t);
      unit.lastOrderT = t;
      this.#approach(unit, t, building, building.size / 2, i++);
      unit.hidden.push({ t0: unit.arrivalT(), t1: Infinity });
      unit.garrison = { building, resume };
      (building.garrisoned ??= new Set()).add(unit);
    }
  }

  // Everyone inside comes out: back to their work (gathering, farming), or to the
  // building's gather point when just ungarrisoned.
  #ungarrison(building, t, backToWork) {
    if (!building.garrisoned?.size) return;
    let i = 0;
    for (const unit of building.garrisoned) {
      const inside = unit.hidden[unit.hidden.length - 1];
      if (inside) inside.t1 = Math.max(inside.t0, t);
      const { resource, kind, farm } = unit.garrison.resume;
      unit.garrison = null;
      unit.lastOrderT = t;
      if (unit.removedAt <= t) continue;
      const out = Math.max(t, inside?.t0 ?? t);
      if (backToWork && resource && (resource.remaining ?? 1) > 0 && !(resource.animal && resource.animal.removedAt <= out)) {
        const to = resource.animal ? resource.animal.positionAt(out) : resource;
        unit.moveTo(out, to.x, to.y);
        this.gatherers.set(unit, resource);
        unit.startActivity(out, kind ?? resource.category);
      } else if (backToWork && kind === 'farm' && farm && farm.removedAt > out) {
        this.#approach(unit, out, farm, MELEE_STOP, 0);
        this.#farm(unit, farm, out);
      } else {
        const rally = this.rallyAt(building, t);
        if (rally) {
          const [ox, oy] = formationOffset(i++);
          unit.moveTo(out, rally.x + ox, rally.y + oy);
        }
      }
    }
    building.garrisoned.clear();
  }

  // The villagers a town bell sends inside: the nearest ones of its player.
  #bellVillagers(tc, t) {
    return this.units
      .filter((u) => u.player === tc.player && u.spawnT <= t && u.removedAt > t && !u.garrison && this.#isVillager(u))
      .map((u) => {
        const at = u.positionAt(t);
        return { u, d: Math.hypot(at.x - tc.x, at.y - tc.y) };
      })
      .filter((x) => x.d <= BELL_RADIUS)
      .sort((a, b) => a.d - b.d)
      .slice(0, BELL_CAPACITY)
      .map((x) => x.u);
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
        // Boars and the like must be lured one by one: eaters don't walk to a live one
        // (only to one already hunted, see #huntedNear).
        retarget: !DANGEROUS_ANIMALS.test(name),
        name: known ?? name,
        remaining: this.game?.gaia?.[animal.typeId] ?? (known ? ANIMAL_FOOD[known] : DEFAULT_ANIMAL_FOOD),
        depletedAt: Infinity,
      };
      this.animalFood.set(animal, food);
    }
    return food;
  }

  /**
   * Nearest animal like `food`'s (any herdable for sheep) that `unit` can eat at
   * `now`; failing that, like in the game, the nearest animal already being
   * hunted (a boar lured to the town center), whatever its kind.
   */
  #nextAnimal(food, unit, now) {
    return (food.retarget && this.#sameAnimal(food, unit, now)) || this.#huntedNear(food, unit, now);
  }

  #huntedNear(food, unit, now) {
    const from = unit.positionAt(now);
    let best = null;
    let bestD = HUNTED_REACH;
    for (const [animal, other] of this.animalFood) {
      if (other === food || other.remaining <= 0 || animal.spawnT > now || animal.removedAt <= now) continue;
      if (animal.player !== 0 && animal.player !== unit.player) continue; // someone else's sheep
      const at = animal.positionAt(now);
      const d = Math.hypot(at.x - from.x, at.y - from.y);
      if (d < bestD) {
        best = other;
        bestD = d;
      }
    }
    return best;
  }

  #sameAnimal(food, unit, now) {
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
    this.#joinCrew(unit, building, t);
    const done = building.startT + building.buildTime;
    unit.startActivity(t, 'build', done);
    const name = this.objectName(building.typeId);
    let after = null;
    // Several built the farm: one farms it, the rest look for a free one (see #advanceGathering).
    if (name === 'Farm') after = { unit, t: done, orderT: t, building, farm: true };
    else if (!building.line) after = { unit, t: done, orderT: t, building, kinds: DROP_SITES[name] ?? null };
    if (after) this.afterBuild.push(after);
    building.crew.get(unit).push({ activity: unit.activities.at(-1), after });
  }

  // The nearest building of the unit's player still going up within reach (walls
  // keep their own builders).
  #foundationNear(unit, done, now) {
    const at = unit.positionAt(now);
    let best = null;
    let bestD = BUILD_SEARCH;
    for (const b of this.buildings) {
      if (b === done || b.line || b.player !== unit.player || b.t > now || b.removedAt <= now) continue;
      if (b.startT + b.buildTime <= now + GATHER_STEP_MS) continue;
      const d = Math.hypot(b.x - at.x, b.y - at.y) - b.size / 2;
      if (d < bestD) {
        best = b;
        bestD = d;
      }
    }
    return best;
  }

  // More builders, faster: like in the game, n villagers build at (n + 2) / 3 the
  // speed of one, so each newcomer cuts what is left from when it arrives. Builders that leave aren't
  // tracked. Wall pieces keep their own schedule (see #wall).
  #joinCrew(unit, building, t) {
    building.crew ??= new Map(); // unit -> [{ activity, after }] to move when the end changes
    if (building.crew.has(unit)) return;
    building.crew.set(unit, []);
    // Work starts when the first builder gets there: until then it is a foundation.
    // One nobody is ever sent to, or whose first known builder only gets there much
    // later, rises from its placement, as before: someone the replay doesn't show
    // (an unbound villager) must have built it.
    const arrival = Math.max(t, unit.arrivalT());
    if (!building.line && building.crew.size === 1 && !building.begun && arrival > building.startT
      && arrival - building.startT <= FOUNDATION_WAIT_MS) {
      building.startT = arrival;
    }
    building.begun = true;
    const done = building.startT + building.buildTime;
    const from = Math.max(arrival, building.startT);
    if (building.line || building.crew.size < 2 || from >= done) return;
    const n = building.crew.size;
    const end = from + ((done - from) * (n + 1)) / (n + 2);
    building.buildTime = end - building.startT;
    for (const jobs of building.crew.values()) {
      for (const { activity, after } of jobs) {
        if (activity.t1 === done) activity.t1 = end;
        if (after && after.t === done) after.t = end;
      }
    }
  }

  #farm(unit, farm, t) {
    unit.startActivity(t, 'farm');
    this.farmers.set(farm, unit);
    unit.farm = farm;
  }

  #freeFarm(farm, unit, t) {
    const taken = (f) => {
      const u = this.farmers.get(f);
      return u && u !== unit && u.farm === f && u.removedAt > t && u.activityAt(t) === 'farm';
    };
    if (!taken(farm)) return farm;
    let best = farm;
    let bestD = FARM_SEARCH;
    for (const f of this.buildings) {
      if (f === farm || f.player !== unit.player || f.removedAt <= t || f.startT + f.buildTime > t) continue;
      if (this.objectName(f.typeId) !== 'Farm' || taken(f)) continue;
      const d = Math.hypot(f.x - farm.x, f.y - farm.y);
      if (d < bestD) {
        best = f;
        bestD = d;
      }
    }
    return best;
  }

  // The research queues in its building like a unit: what is queued after it waits.
  // A second click on a tech already researched or under way is ignored, like in
  // the game (one cancelled from the queue can be clicked again, see #dequeue).
  #occupy(e, ids) {
    if (this.researches.some((r) => r.player === e.player && r.techId === e.technology_id)) return null;
    const places = this.game?.techs?.[e.technology_id]?.at;
    const building = this.buildingById.get(ids[0]) ?? this.#bindBuilding(ids[0], e.player, places?.map(([at]) => at), e.t);
    const name = this.legend.technologies?.[e.technology_id] ?? `tech #${e.technology_id}`;
    const seconds = places?.find(([at]) => at === building?.typeId || at === SAME_BUILDING[building?.typeId])?.[1]
      ?? places?.[0]?.[1] ?? RESEARCH_TIMES[name];
    const t0 = Math.max(e.t, building?.queueEnd ?? 0);
    const r = { player: e.player, techId: e.technology_id, name, building: building ?? null, clickedAt: e.t, t0, t1: t0 + (seconds ?? 0) * 1000 };
    this.researches.push(r);
    if (building && seconds) {
      building.queueEnd = r.t1;
      (building.queue ??= []).push({ kind: `t${e.technology_id}`, t0, t1: r.t1, research: r });
    }
    return r;
  }

  // The game shows a queue as icons: the one in production, then one per run of
  // the same unit (or research) waiting, with a count; a click on one takes its
  // last item out. Measured: slot 1 three times after queuing 4 villagers gives
  // back 150 food (only slots 0 and 1 show up in real matches). The rest of the queue
  // moves up by the time that item would have taken, its cost comes back (see
  // economy.js) and the unit never comes out.
  #dequeue(building, slot, t) {
    const groups = [];
    for (const q of building.queue ?? []) {
      if (q.t1 <= t) continue;
      const g = groups[groups.length - 1];
      // The first icon is the one in production, on its own.
      if (g && g.kind === q.kind && groups.length > 1) g.items.push(q);
      else groups.push({ kind: q.kind, items: [q] });
    }
    const item = groups[slot]?.items.at(-1);
    if (!item) return;
    const shift = item.t1 - Math.max(item.t0, t);
    building.queue.splice(building.queue.indexOf(item), 1);
    for (const q of building.queue) {
      if (q.t0 < item.t1 - 1) continue;
      q.t0 -= shift;
      q.t1 -= shift;
      if (q.unit) {
        q.unit.spawnT = q.unit.path[0].t0 = q.t1;
        const exit = this.exits.find((x) => x.unit === q.unit);
        if (exit) exit.t = q.t1;
      } else {
        q.research.t0 = q.t0;
        q.research.t1 = q.t1;
      }
    }
    if (building.queueEnd >= item.t1 - 1) building.queueEnd -= shift;
    if (item.unit) {
      const u = item.unit;
      this.units.splice(this.units.indexOf(u), 1);
      this.trainedByKey.delete(u.key);
      if (u.id != null) this.unitById.delete(u.id);
      this.exits = this.exits.filter((x) => x.unit !== u);
      this.cancelled.push({ player: building.player, t, at: u.queuedAt, unitId: u.queuedType });
      this.log.push({ t, player: building.player, kind: 'dequeue', name: this.objectName(u.typeId) });
    } else {
      this.researches.splice(this.researches.indexOf(item.research), 1);
      this.cancelled.push({ player: building.player, t, at: item.research.clickedAt, techId: item.research.techId });
      this.log.push({ t, player: building.player, kind: 'dequeue', name: item.research.name });
    }
  }

  // Upgrades take effect when their research is done: every unit of that player
  // of the old type becomes the new one, and later ones come out upgraded (the
  // queue orders always name the base unit). A player who resigned before never
  // got it.
  #applyUpgrades() {
    const ups = [];
    for (const r of this.researches) {
      const changes = this.game?.techs?.[r.techId]?.up;
      if (!changes || r.t1 > Math.min(this.duration, this.resignedAt.get(r.player) ?? Infinity)) continue;
      for (const [from, to] of changes) ups.push({ player: r.player, t: r.t1, from, to });
    }
    if (!ups.length) return;
    ups.sort((a, b) => a.t - b.t);
    for (const u of this.units) {
      if (u.player <= 0 || u.typeId == null) continue;
      let type = u.typeId;
      for (const up of ups) {
        if (up.player !== u.player || up.from !== type) continue;
        type = up.to;
        if (up.t <= u.spawnT) u.typeId = type;
        else u.upgrades.push({ t: up.t, typeId: type });
      }
    }
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

  /**
   * A deleted ID the engine never saw: the player's building placed when that ID
   * was created (placement times are exact), else a trained unit nobody bound yet
   * that came out then, villagers first (the ones deleted most). Null if nothing
   * fits: better to leave something on the map than delete the wrong thing.
   */
  #bindDeleted(id, player, t, burst) {
    const [from, to] = this.#idWindow(id);
    const building = this.buildings.find((b) => b.id == null && !b.line && b.player === player
      && b.t >= from && b.t <= to && b.removedAt > t);
    if (building) {
      building.id = id;
      this.buildingById.set(id, building);
      this.#anchor(id, building.t);
      return building;
    }
    // Consecutive IDs deleted together are wall pieces, not units.
    if (burst.has(id - 1) || burst.has(id + 1)) return null;
    const gap = (u) => (u.spawnT < from ? from - u.spawnT : u.spawnT > to ? u.spawnT - to : 0);
    const unit = this.units
      .filter((u) => u.key && u.id == null && u.player === player && u.spawnT <= t && u.removedAt > t && gap(u) <= BIND_SLACK_MS)
      .sort((a, b) => !this.#isVillager(a) - !this.#isVillager(b) || gap(a) - gap(b) || a.spawnT - b.spawnT)[0];
    if (!unit) return null;
    unit.id = id;
    this.unitById.set(id, unit);
    this.#anchor(id, unit.spawnT);
    return unit;
  }

  // An order on a building placed during the game (no known ID yet): the clicked
  // point falls inside its footprint, so that building gets the ID.
  #bindClicked(e) {
    if (e.target_id == null || e.x == null || this.unitById.has(e.target_id)) return null;
    const hit = this.buildings.find((b) => b.id == null && b.t <= e.t && b.removedAt > e.t
      && Math.abs(b.x - e.x) <= b.size / 2 + 0.5 && Math.abs(b.y - e.y) <= b.size / 2 + 0.5);
    if (!hit) return null;
    if (hit.line) {
      // A wall piece: its line has consecutive IDs, so the click binds them all.
      this.#bindLine(hit.line, e.target_id - hit.line.placed.indexOf(hit));
      return hit;
    }
    hit.id = e.target_id;
    this.buildingById.set(hit.id, hit);
    this.#anchor(hit.id, hit.t);
    return hit;
  }

  // Where a unit can be trained: [[building type, seconds]]. A castle unit also
  // trained elsewhere (the Goths' Huskarl at the barracks, the Huns' Tarkan at
  // the stable) is a separate type in the game data, but the game may queue the
  // castle one there: its twins (same class, speed and castle training) count too.
  #trainSites(unitId) {
    this.trainCache ??= new Map();
    if (this.trainCache.has(unitId)) return this.trainCache.get(unitId);
    const units = this.game?.units ?? {};
    const own = units[unitId];
    let sites = own?.train ?? null;
    const castle = sites?.length === 1 && sites[0][0] === CASTLE ? sites[0] : null;
    if (castle) {
      const more = new Map();
      for (const u of Object.values(units)) {
        if (u === own || u.class !== own.class || u.speed !== own.speed) continue;
        if (!u.train?.some(([at, s]) => at === CASTLE && s === castle[1])) continue;
        for (const [at, s] of u.train) if (at !== CASTLE && !more.has(at)) more.set(at, s);
      }
      sites = [castle, ...more];
    }
    this.trainCache.set(unitId, sites);
    return sites;
  }

  // A building built during the game has no known ID until a command uses it.
  // Bind it to the oldest unbound building of that player of one of `trainedAt` (types that train the unit or research the tech).
  // A finished town center gets a new ID (its foundation is another object): a
  // town center known by its foundation's ID takes the new one too.
  #bindBuilding(id, player, trainedAt, t) {
    if (id == null || !trainedAt?.length || this.unitById.has(id)) return null;
    const fits = (typeId) => trainedAt.includes(typeId) || trainedAt.includes(SAME_BUILDING[typeId]);
    const mine = (b) => b.player === player && b.t <= t && b.removedAt > t && fits(b.typeId);
    let building = this.buildings.find((b) => b.id == null && mine(b));
    if (building) building.id = id;
    else {
      building = this.buildings.find((b) => b.typeId === TC_FOUNDATION && b.id != null && b.doneId == null && mine(b));
      if (!building) return null;
      building.doneId = id;
    }
    this.buildingById.set(id, building);
    this.#anchor(id, building.id === id ? building.t : Math.min(t, building.startT + building.buildTime));
    return building;
  }

  // With several buildings selected, each unit goes to the one whose queue ends
  // first, like in the game.
  #queue(e, ids, index) {
    const sites = new Set();
    for (const id of ids) {
      const b = this.buildingById.get(id)
        ?? this.#bindBuilding(id, e.player, this.#trainSites(e.unit_id)?.map(([at]) => at), e.t);
      if (b && b.player === e.player) sites.add(b);
    }
    const name = this.objectName(e.unit_id);
    this.log.push({ t: e.t, player: e.player, kind: 'queue', name, amount: e.amount });
    if (!sites.size) return;
    const trains = this.#trainSites(e.unit_id);
    // What already came out is no longer in the queue (keeps it short).
    for (const b of sites) if (b.queue) b.queue = b.queue.filter((q) => q.t1 > e.t);
    const waiting = (b) => b.queue?.length ?? 0;
    for (let i = 0; i < e.amount; i++) {
      let building = null;
      for (const b of sites) {
        if (waiting(b) >= QUEUE_LIMIT) continue; // full: the game refuses the click (and charges nothing)
        if (!building || Math.max(e.t, b.queueEnd) < Math.max(e.t, building.queueEnd)) building = b;
      }
      if (!building) break;
      const gameTime = trains?.find(([at]) => at === building.typeId || at === SAME_BUILDING[building.typeId])?.[1];
      const trainTime = (gameTime ?? TRAIN_TIMES[name] ?? DEFAULT_TRAIN_TIME) * 1000;
      const start = Math.max(e.t, building.queueEnd);
      building.queueEnd = start + trainTime;
      const [ox, oy] = formationOffset(this.units.length % 12);
      const unit = this.#addUnit(new Unit({
        id: null, player: e.player, typeId: e.unit_id,
        x: building.x + building.size / 2 + 0.5 + ox, y: building.y + building.size / 2 + 0.5 + oy,
        t: building.queueEnd, approx: true,
      }));
      unit.key = `${index}:${i}`;
      unit.queuedAt = e.t;
      unit.queuedType = e.unit_id;
      this.trainedByKey.set(unit.key, unit);
      this.exits.push({ unit, t: building.queueEnd, building });
      (building.queue ??= []).push({ kind: `u${e.unit_id}`, t0: start, t1: building.queueEnd, unit });
    }
  }

  // A foundation of the same type the player already has right there.
  #samePlace(e) {
    return this.buildings.find((b) => b.player === e.player && b.typeId === e.building_id
      && b.removedAt > e.t && b.x === e.x && b.y === e.y) ?? null;
  }

  // Position of this BUILD in a shift-queue by the same group: 0 for the first
  // (or a lone order), then 1, 2... Clicks on an existing foundation don't count.
  #queuedBuild(e, ids, samePlace) {
    const key = `${e.player}:${[...ids].sort((a, b) => a - b).join(',')}`;
    const last = this.lastBuild;
    if (last && last.key === key && e.t - last.t <= BUILD_QUEUE_GAP_MS) {
      last.t = e.t;
      return samePlace ? -1 : ++last.k;
    }
    this.lastBuild = { key, t: e.t, k: 0 };
    return 0;
  }

  #build(e, samePlace = null) {
    if (samePlace) return samePlace;
    const building = this.#addBuilding({ player: e.player, typeId: e.building_id, x: e.x, y: e.y, t: e.t });
    // A gate goes on top of the player's wall and replaces those segments (no rubble).
    if (/Gate/.test(this.objectName(e.building_id))) {
      const reach = building.size / 2;
      for (const w of this.buildings) {
        if (w === building || w.player !== e.player || w.removedAt <= e.t) continue;
        // A gate where one stood (the map's, or one razed before) means the old one was gone.
        const oldGate = /Gate/.test(this.objectName(w.typeId)) && Math.hypot(w.x - e.x, w.y - e.y) < 1;
        if (!oldGate && (w.size > 1 || !/Wall/.test(this.objectName(w.typeId)))) continue;
        if (Math.abs(w.x - e.x) <= reach && Math.abs(w.y - e.y) <= reach) {
          w.removedAt = e.t;
          w.replaced = true;
        }
      }
    }
    this.log.push({ t: e.t, player: e.player, kind: 'build', name: this.objectName(e.building_id) });
    return building;
  }

  // The game creates one foundation per wall piece, with consecutive IDs from
  // the first clicked end. The builders walk to the nearer end and raise the
  // pieces one after another; extra builders speed each piece up (+1/3 each,
  // as for any building). What is left when they get other orders stays a
  // foundation (see #settleWalls).
  #wall(e, ids) {
    const steps = Math.max(Math.abs(e.x_end - e.x), Math.abs(e.y_end - e.y));
    const builders = ids
      .map((id) => (this.dry ? this.unitById.get(id) : this.#resolveUnit(id, e.player, e.t, 'villager')))
      .filter((u) => u && u.removedAt > e.t);
    const pieceTime = (this.#buildSeconds(e.building_id) * 1000 * 3) / (Math.max(1, builders.length) + 2);
    const placed = [];
    for (let i = 0; i <= steps; i++) {
      const k = steps === 0 ? 0 : i / steps;
      placed.push(this.#addBuilding({
        player: e.player, typeId: e.building_id,
        x: Math.round(e.x + (e.x_end - e.x) * k), y: Math.round(e.y + (e.y_end - e.y) * k),
        t: e.t, buildTime: pieceTime,
      }));
    }
    const from = builders[0]?.positionAt(e.t);
    const near = (b) => (from ? Math.hypot(b.x - from.x, b.y - from.y) : 0);
    const order = from && near(placed[placed.length - 1]) < near(placed[0]) ? [...placed].reverse() : placed;
    const walk = from ? (near(order[0]) / Math.max(0.1, builders[0].speed)) * 1000 : 0;
    order.forEach((b, i) => {
      b.startT = e.t + walk + i * pieceTime;
    });
    const entry = { t: e.t, player: e.player, kind: 'build', name: this.objectName(e.building_id), segments: steps + 1 };
    this.log.push(entry);
    const line = { player: e.player, t: e.t, placed, order, entry, builders: new Set(), stoppedAt: Infinity };
    for (const b of placed) b.line = line;
    for (const u of builders) {
      if (u.id == null) continue;
      line.builders.add(u.id);
      this.wallBuilder.set(u.id, line);
    }
    this.wallLines.push(line);
    return order[order.length - 1];
  }

  #leaveWall(id, t) {
    const line = this.wallBuilder.get(id);
    if (!line) return;
    this.wallBuilder.delete(id);
    line.builders.delete(id);
    if (line.builders.size === 0) line.stoppedAt = Math.min(line.stoppedAt, t);
  }

  #bindLine(line, firstId) {
    line.placed.forEach((b, i) => {
      const id = firstId + i;
      if (b.id != null || this.buildingById.has(id) || this.unitById.has(id)) return;
      b.id = id;
      this.buildingById.set(id, b);
    });
    this.#anchor(firstId, line.t);
  }

  // Unknown IDs the player deleted within `ms` of this DELETE.
  #deleteBurst(index, ms = 1000) {
    const timeline = this.data.timeline;
    const e = timeline[index];
    // Other players' commands can fall in between: scan by time, not by position.
    let first = index;
    while (first > 0 && e.t - timeline[first - 1].t <= ms) first--;
    const unknown = new Set();
    for (let i = first; i < timeline.length && timeline[i].t - e.t <= ms; i++) {
      const o = timeline[i];
      if (o.type !== 'DELETE' || o.player !== e.player) continue;
      for (const id of o.object_ids ?? []) {
        if (!this.buildingById.has(id) && !this.unitById.has(id)) unknown.add(id);
      }
    }
    return unknown;
  }

  // Deleting a wall's foundations sends one DELETE per piece, with IDs the
  // engine never saw. The ones sent together (same player, within a second,
  // consecutive IDs) go to that player's latest wall with exactly that many
  // pieces, none of them bound yet.
  #bindDeletedWall(unknown, e) {
    const sorted = [...unknown].sort((a, b) => a - b);
    if (sorted.length < 2 || sorted[sorted.length - 1] - sorted[0] !== sorted.length - 1) return;
    const line = this.wallLines.findLast((l) => l.player === e.player && l.t <= e.t
      && l.placed.length === sorted.length && l.placed.every((b) => b.id == null && b.removedAt > e.t));
    if (line) this.#bindLine(line, sorted[0]);
  }

  // Wall pieces the builders never reached stay foundations, unless a villager
  // was sent to one of them later (helpStart). One half built when they left
  // stays half built.
  #settleWalls() {
    for (const line of this.wallLines) {
      for (const b of line.order) {
        const scheduled = b.startT;
        // Deleting a piece also ends the work on it.
        if (scheduled >= Math.min(line.stoppedAt, b.removedAt)) b.startT = b.helpStart ?? Infinity;
        else {
          b.startT = Math.min(scheduled, b.helpStart ?? Infinity);
          if (scheduled + b.buildTime > line.stoppedAt && b.helpStart == null) b.pausedAt = line.stoppedAt;
        }
      }
      // Every piece deleted before it was started: the wall was only planned.
      if (line.placed.every((b) => b.removedAt < Infinity && b.removedAt <= b.startT)) line.entry.cancelled = true;
    }
    // A building deleted before it was finished (a foundation) leaves no rubble.
    for (const b of this.buildings) {
      const finished = b.pausedAt != null ? Infinity : b.startT + b.buildTime;
      if (b.removedAt < finished) b.replaced = true;
    }
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
          if (g.farm) {
            const farm = this.#freeFarm(g.building, g.unit, now);
            if (farm !== g.building) this.#approach(g.unit, now, farm, MELEE_STOP, 0);
            this.#farm(g.unit, farm, now);
            continue;
          }
          const r = g.kinds && this.#resourceNear(g.building.x, g.building.y, g.kinds, DROP_SITE_REACH);
          if (r) {
            g.unit.moveTo(now, r.x, r.y);
            this.gatherers.set(g.unit, r);
            g.unit.startActivity(now, r.category);
            continue;
          }
          // Like in the game, a builder with nothing to gather there goes on to
          // the nearest unfinished building of its player.
          const next = this.#foundationNear(g.unit, g.building, now);
          if (next) {
            this.#approach(g.unit, now, next, next.size / 2 + MELEE_STOP, 0);
            this.#buildThen(g.unit, next, now);
          }
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
            if (next.animal) this.#approach(unit, now, to, MELEE_STOP, this.#eatersOf(next, unit));
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
          if (animal && !at.moving) this.#approach(unit, now, spot, MELEE_STOP, this.#eatersOf(resource, unit));
          continue; // still walking
        }
        const rate = animal ? MEAT_RATE : GATHER_RATES[resource.category] ?? 0;
        resource.remaining -= rate * (GATHER_STEP_MS / 1000);
        if (animal) resource.eatenAt = now;
        if (resource.remaining <= 0) {
          resource.depletedAt = now;
          if (animal) animal.removedAt = Math.min(animal.removedAt, now);
        }
      }
      this.#rotCarcasses(now);
    }
  }

  // Animals started and then left (eaters sent elsewhere) rot away.
  #rotCarcasses(now) {
    for (const [animal, food] of this.animalFood) {
      if (food.eatenAt == null || food.remaining <= 0 || animal.removedAt <= now) continue;
      if (now - food.eatenAt < CARCASS_ROT_MS) continue;
      food.remaining = 0;
      food.depletedAt = now;
      animal.removedAt = now;
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
      // The age research ends on arrival; one never reached was cancelled (or the game ended first).
      for (const r of this.researches) {
        const age = r.player === player && AGE_TECHS[r.techId];
        if (!age) continue;
        const arrival = settled.find((a) => a.age === age[0])?.reachedAt;
        if (arrival == null) r.t1 = r.t0 = Infinity;
        else {
          const length = r.t1 - r.t0;
          r.t1 = arrival;
          r.t0 = Math.max(Math.min(r.t0, arrival), arrival - length);
        }
      }
    }
  }

  // A trained villager whose ID never shows up in any command of the whole match
  // is doubtful: it may have died early or been taken out of a queue in a way the
  // engine missed, or
  // have died early. It does its first job (gather point) and then leaves, rather
  // than standing idle for the rest of the game. Soldiers stay at their gather
  // point, like in the game: armies pile up there until sent out. Many are never
  // bound to an ID (a Franks player's 175 Knights left 80 unbound), and making
  // them all vanish emptied the armies on screen.
  #dropUncommanded() {
    for (const u of this.units) {
      if (!u.key || u.id != null || u.removedAt < Infinity || !this.#isVillager(u)) continue;
      const last = u.activities[u.activities.length - 1];
      let idleFrom;
      if (last) idleFrom = last.t1;
      else idleFrom = u.arrivalT();
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

  // A building enemies were sent against (a real assault: siege, or several
  // attackers) and that its owner never used again (to train, research, set a
  // gather point, repair or garrison) though they kept playing well after, most
  // likely fell: when the last attack order has had time to land. Estimated.
  #estimateRazed() {
    const lastUse = new Map();
    const assaults = new Map(); // building -> { attackers: Set, siege, last }
    const lastOrderOf = new Map();
    const selected = selectionTracker();
    for (const e of this.data.timeline) {
      if (e.type !== 'GAME' && e.type !== 'DE_TRANSFORM') lastOrderOf.set(e.player, e.t);
      const ids = selected(e);
      for (const id of e.object_ids ?? []) {
        const b = this.buildingById.get(id);
        if (b?.player === e.player) lastUse.set(b, e.t);
      }
      let target = this.buildingById.get(e.target_id);
      if (!target && e.type === 'ATTACK_GROUND' && e.x != null) target = this.#buildingAt(e.x, e.y, e.t);
      if (!target) continue;
      if (target.player === e.player) {
        lastUse.set(target, e.t);
        continue;
      }
      if ((e.type !== 'ORDER' && e.type !== 'ATTACK_GROUND') || !this.#enemies(e.player, target.player)) continue;
      const a = assaults.get(target) ?? { attackers: new Set(), siege: false, last: 0 };
      for (const id of ids) {
        const unit = this.unitById.get(id);
        if (!unit || unit.player !== e.player || this.#isVillager(unit)) continue;
        a.attackers.add(unit);
        if (SIEGE_CLASSES.has(this.game?.units?.[unit.typeId]?.class) || SIEGE_NAME.test(this.objectName(unit.typeId))) a.siege = true;
      }
      if (e.type === 'ATTACK_GROUND') a.siege = true;
      a.last = e.t;
      assaults.set(target, a);
    }
    for (const [b, a] of assaults) {
      if (!a.siege && a.attackers.size < RAZE_MIN_ATTACKERS) continue;
      if ((lastUse.get(b) ?? -1) > a.last) continue;
      const fellAt = a.last + ATTACK_HOLD_MS;
      const playedOn = Math.min(lastOrderOf.get(b.player) ?? 0, this.resignedAt.get(b.player) ?? Infinity);
      if (fellAt <= b.t || playedOn - fellAt < FALLEN_AFTER_MS || b.removedAt <= fellAt) continue;
      b.removedAt = fellAt;
      b.razed = true;
    }
  }

  // Standing building whose footprint holds (x, y) at t.
  #buildingAt(x, y, t) {
    return this.buildings.find((b) => b.t <= t && b.removedAt > t
      && Math.abs(b.x - x) <= b.size / 2 && Math.abs(b.y - y) <= b.size / 2) ?? null;
  }

  // Nothing can be placed on a standing building: whatever was there before a
  // new foundation (a razed house, an expired farm) was gone by then. Walls are
  // left to their own rules.
  #clearBuiltOver() {
    const byCell = new Map();
    const cells = (b) => {
      const keys = [];
      const r = b.size / 2;
      for (let cx = Math.floor((b.x - r) / GRID_CELL); cx <= Math.floor((b.x + r) / GRID_CELL); cx++) {
        for (let cy = Math.floor((b.y - r) / GRID_CELL); cy <= Math.floor((b.y + r) / GRID_CELL); cy++) keys.push(`${cx},${cy}`);
      }
      return keys;
    };
    // Gates are 4x1, not a square of their size: a new gate where one stood is in #build.
    const solid = this.buildings.filter((b) => !b.line && b.size > 1 && !/Gate/.test(this.objectName(b.typeId)))
      .sort((a, b) => a.t - b.t);
    for (const c of solid) {
      const near = new Set();
      for (const k of cells(c)) for (const b of byCell.get(k) ?? []) near.add(b);
      for (const b of near) {
        if (b.t >= c.t || b.removedAt <= c.t) continue;
        const reach = (b.size + c.size) / 2 - OVERLAP_SLACK;
        if (Math.abs(b.x - c.x) < reach && Math.abs(b.y - c.y) < reach) {
          b.removedAt = c.t;
          b.replaced = true;
        }
      }
      for (const k of cells(c)) (byCell.get(k) ?? byCell.set(k, []).get(k)).push(c);
    }
  }

  // In the game what a player who resigns leaves behind stays on the map: the
  // villagers stop working, soldiers stand where they are (and still fight
  // whoever comes close), buildings keep standing and nothing more is built,
  // trained or researched.
  #applyResigns() {
    for (const [player, t] of this.resignedAt) {
      for (const u of this.units) {
        if (u.player !== player || u.removedAt <= t) continue;
        if (u.spawnT > t) {
          // Still in a production queue: never comes out.
          u.removedAt = u.spawnT;
          u.fell = false;
          continue;
        }
        u.stopActivity(t);
        const at = u.positionAt(t);
        u.moveTo(t, at.x, at.y);
        u.upgrades = u.upgrades.filter((up) => up.t <= t);
      }
      for (const b of this.buildings) {
        if (b.player !== player || b.removedAt <= t || b.t > t) continue;
        if (b.startT + b.buildTime > t) {
          // Unfinished: stays as it was then.
          if (b.startT > t) b.startT = Infinity;
          else b.pausedAt = Math.min(b.pausedAt ?? Infinity, t);
        }
      }
    }
  }

  // Population: a unit only comes out of its building if its player has room
  // (houses, town centers, castles... up to the population limit), like in the
  // game. A trained unit no command ever names that would come out with no room
  // waits until there is some (a house finished, a unit gone) and, if that never
  // happens, never comes out: the player kept queuing while housed. A unit an
  // order names waits too, but was out by that order at the latest; if it has
  // no room by then and that goes over the limit, others must have died: the
  // one left unordered longest (army first) falls.
  #enforcePopulationLimit() {
    const limit = this.data.game.population_limit;
    if (!limit) return;
    for (const p of this.players) {
      const mine = this.units.filter((u) => u.player === p.number);
      const room = this.#roomOf(p, limit);
      const takes = (u) => this.#popOf(u);
      const usedAt = (t, but) => {
        let n = 0;
        for (const u of mine) if (u !== but && u.spawnT <= t && u.removedAt > t) n += takes(u);
        return n;
      };
      const queue = [...mine].sort((a, b) => a.spawnT - b.spawnT);
      for (let i = 0; i < queue.length; i++) {
        const born = queue[i];
        const t = born.spawnT;
        if (born.removedAt <= t || !takes(born)) continue;
        const used = usedAt(t, born);
        if (used + takes(born) <= room.at(t)) continue;
        // Waits for room: the next moment a unit goes or a building is done. One
        // an order names was out by that order at the latest.
        const latest = !born.key ? -Infinity : born.id != null ? (born.boundAt ?? t) : this.duration;
        const moments = [...room.changes.filter((c) => c > t && c <= latest)];
        for (const u of mine) if (u !== born && u.spawnT <= t && u.removedAt > t && u.removedAt <= latest) moments.push(u.removedAt);
        moments.sort((x, y) => x - y);
        const when = moments.find((c) => c < this.duration && usedAt(c, born) + takes(born) <= room.at(c));
        if (when != null) {
          this.#delaySpawn(born, when);
          // Back in line at its new time.
          queue.splice(i, 1);
          let j = i;
          while (j < queue.length && queue[j].spawnT <= when) j++;
          queue.splice(j, 0, born);
          i--;
          continue;
        }
        if (born.id != null || !born.key) {
          let over = used + takes(born) - limit;
          if (over <= 0) continue;
          const alive = mine.filter((u) => u !== born && u.spawnT <= t && u.removedAt > t && takes(u));
          alive.sort((a, b) => this.#isVillager(a) - this.#isVillager(b) || a.lastOrderT - b.lastOrderT || a.spawnT - b.spawnT);
          for (const u of alive) {
            if (over <= 0) break;
            over -= takes(u);
            u.removedAt = t;
            u.fell = true;
          }
          continue;
        }
        born.removedAt = born.spawnT; // never comes out
        born.stalled = true;
      }
    }
  }

  // Population a unit takes (sheep none, most units one).
  #popOf(u) {
    const known = u.typeId != null ? this.game?.units?.[u.typeId]?.pop : undefined;
    if (known != null) return known;
    return u.typeId != null && HERDABLE.test(this.objectName(u.typeId)) ? 0 : 1;
  }

  // A player's population room over time: { at(t), changes } from finished
  // buildings that give it, never above the limit. Huns need no houses.
  #roomOf(player, limit) {
    if (player.civilization === 'Huns' || !this.game?.buildings) return { at: () => limit, changes: [] };
    const steps = [];
    for (const b of this.buildings) {
      if (b.player !== player.number) continue;
      const pop = this.game.buildings[b.typeId]?.pop ?? this.game.buildings[SAME_BUILDING[b.typeId]]?.pop
        ?? (b.typeId === TOWN_CENTER || b.typeId === TC_FOUNDATION ? TOWN_CENTER_POP : 0);
      if (!pop || b.pausedAt != null) continue;
      const done = b.startT + b.buildTime;
      if (done >= b.removedAt || !Number.isFinite(done)) continue;
      steps.push({ t: done, d: pop });
      if (Number.isFinite(b.removedAt)) steps.push({ t: b.removedAt, d: -pop });
    }
    steps.sort((x, y) => x.t - y.t);
    return {
      changes: steps.map((x) => x.t),
      at: (t) => {
        let n = 0;
        for (const x of steps) {
          if (x.t > t) break;
          n += x.d;
        }
        return Math.min(limit, n);
      },
    };
  }

  // A unit that had to wait comes out later: what it did before then moves too.
  #delaySpawn(unit, t) {
    const by = t - unit.spawnT;
    unit.spawnT = t;
    for (const seg of unit.path) if (seg.t0 < t) seg.t0 = Math.min(t, seg.t0 + by);
    for (const a of unit.activities) {
      if (a.t1 <= t) a.t1 = a.t0 = t;
      else if (a.t0 < t) a.t0 = t;
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

  // A gatherer standing at its resource walks its loads to the nearest drop site
  // and back, like in the game: work until it carries a load, walk there, walk
  // back. Only how it looks (position, walking, heading); the estimate of what is
  // gathered already counts those walks. Null when it isn't gathering or is next
  // to the drop site.
  #tripAt(u, at, t) {
    const a = u.activities.length ? this.#activityRecord(u, t) : null;
    if (!a || !DROP_OFF[a.kind] || u.hidden.length && u.hiddenAt(t)) return null;
    if (a.drop === undefined) a.drop = this.#dropSite(u.player, a.kind, at, a.t0);
    const site = a.drop;
    if (!site) return null;
    const dx = site.x - at.x;
    const dy = site.y - at.y;
    const d = Math.hypot(dx, dy);
    const walkTiles = d - site.size / 2 - 0.5;
    if (walkTiles < 1) return null;
    const rate = (a.kind === 'hunt' || a.kind === 'shepherd' ? MEAT_RATE : a.kind === 'farm' ? FARM_RATE : GATHER_RATES[a.kind] ?? 0.33) * RAW_RATE;
    const work = (CARRY / rate) * 1000;
    const walk = (walkTiles / Math.max(0.1, u.speed)) * 1000;
    const phase = (t - a.t0) % (work + 2 * walk);
    if (phase < work) return null;
    const out = phase < work + walk;
    const k = out ? (phase - work) / walk : 1 - (phase - work - walk) / walk;
    const reach = walkTiles / d;
    return {
      x: at.x + dx * reach * k,
      y: at.y + dy * reach * k,
      moving: true,
      trip: true,
      dir: out ? { dx, dy } : { dx: -dx, dy: -dy },
    };
  }

  #activityRecord(u, t) {
    for (let i = u.activities.length - 1; i >= 0; i--) {
      const a = u.activities[i];
      if (a.t0 <= t) return a.t1 > t ? a : null;
    }
    return null;
  }

  // Nearest finished building of the player that takes this resource, when the work began.
  #dropSite(player, kind, at, t) {
    const names = DROP_OFF[kind];
    let best = null;
    let bestD = TRIP_MAX;
    for (const b of this.buildings) {
      if (b.player !== player || b.startT + b.buildTime > t || b.removedAt <= t) continue;
      const name = this.objectName(b.typeId);
      if (!names.includes(name) && !DROP_ANYTHING.test(name)) continue;
      const d = Math.hypot(b.x - at.x, b.y - at.y);
      if (d < bestD) {
        best = b;
        bestD = d;
      }
    }
    return best;
  }

  stateAt(t) {
    const units = [];
    for (const u of this.units) {
      if (u.spawnT > t) continue;
      if (u.removedAt <= t) {
        // Fallen and deleted units fade out instead of vanishing.
        if ((u.fell || u.deleted) && t < u.removedAt + FADE_MS) {
          units.push({ unit: u, typeId: u.typeAt(t), ...u.positionAt(t), fading: 1 - (t - u.removedAt) / FADE_MS });
        }
        continue;
      }
      if (u.hidden.length && u.hiddenAt(t)) continue; // inside a building
      const at = u.positionAt(t);
      units.push({ unit: u, typeId: u.typeAt(t), ...at, ...(at.moving ? null : this.#tripAt(u, at, t)) });
    }
    const buildings = [];
    const ruins = [];
    for (const b of this.buildings) {
      if (b.t > t) continue;
      if (b.removedAt <= t) {
        if (!b.replaced) ruins.push(b);
        continue;
      }
      // Placed but not started: a foundation (planned). Then the construction.
      const planned = t < b.startT;
      const until = Math.min(t, b.pausedAt ?? Infinity);
      const progress = planned ? 0 : b.buildTime > 0 ? Math.min(1, (until - b.startT) / b.buildTime) : 1;
      buildings.push({ building: b, progress, planned });
    }
    const resigned = new Set([...this.resignedAt].filter(([, rt]) => rt <= t).map(([p]) => p));
    return { t, units, buildings, ruins, resigned };
  }

  /**
   * What a player is researching at t, in click order, with how far along each
   * is (0..1). Estimated: research times are the game's, without civilization
   * bonuses; the ones taken out of the queue are left out.
   */
  researchesAt(player, t) {
    const end = Math.min(this.duration, this.resignedAt.get(player) ?? Infinity);
    return this.researches
      .filter((r) => r.player === player && r.t0 <= t && t < r.t1 && r.t1 <= end)
      .map((r) => ({ techId: r.techId, name: r.name, t0: r.t0, t1: r.t1, progress: (t - r.t0) / (r.t1 - r.t0) }));
  }

  /**
   * Each player's villagers at t by what they are doing (estimated): food (berries,
   * hunting, herding, farming, fishing from shore), wood, gold, stone, build,
   * idle (standing with nothing to do), other (walking somewhere, fighting) and
   * garrisoned (inside a building).
   */
  villagerJobsAt(t) {
    const out = new Map();
    for (const p of this.players) out.set(p.number, { total: 0, food: 0, wood: 0, gold: 0, stone: 0, build: 0, idle: 0, other: 0, garrisoned: 0 });
    for (const u of this.units) {
      if (u.player <= 0 || u.spawnT > t || u.removedAt <= t || !this.#isVillager(u)) continue;
      const row = out.get(u.player);
      if (!row) continue;
      row.total++;
      const job = VILLAGER_JOB[u.activityAt(t)];
      if (u.hidden.length && u.hiddenAt(t)) row.garrisoned++;
      else if (job) row[job]++;
      else if (u.positionAt(t).moving) row.other++;
      else row.idle++;
    }
    return out;
  }

  /**
   * Each player's stockpile (food + wood + gold + stone) at t, as the game had
   * it: the replay's last sync at or before t (about every 17 s). Exact, but
   * only the sum. Null if the replay doesn't carry it (parsed before November 2026).
   */
  resourcesAt(t) {
    const list = this.data.resource_totals;
    if (!list?.length) return null;
    let lo = 0;
    let hi = list.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid].t <= t) lo = mid + 1;
      else hi = mid;
    }
    const out = new Map();
    const at = list[lo - 1];
    for (const p of this.players) out.set(p.number, at ? at.players[p.number] ?? 0 : null);
    return out;
  }

  /**
   * Each player's stockpile at t by resource: { total, food, wood, gold, stone }.
   * The total is the game's (last sync at or before t); the split is estimated
   * and corrected to that total every sync (see economy.js). Null if the replay
   * doesn't carry the totals.
   */
  stockAt(t) {
    if (this.stock === undefined) this.stock = stockTimeline(this);
    if (!this.stock) return null;
    const out = new Map();
    for (const p of this.players) {
      const list = this.stock.get(p.number) ?? [];
      let lo = 0;
      let hi = list.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (list[mid].t <= t) lo = mid + 1;
        else hi = mid;
      }
      const at = list[lo - 1];
      out.set(p.number, at ? { total: at.total, food: at.food, wood: at.wood, gold: at.gold, stone: at.stone } : null);
    }
    return out;
  }

  /**
   * Each player's army at t by kind (estimated: units come out when their
   * training should end, and deaths are guesses): infantry, archers, cavalry,
   * siege, ships, monks and other (soldiers of unknown kind). Villagers,
   * herdables, fishing and trade are not army.
   */
  armyAt(t) {
    const out = new Map();
    for (const p of this.players) out.set(p.number, { total: 0, infantry: 0, archers: 0, cavalry: 0, siege: 0, ships: 0, monks: 0, other: 0 });
    for (const u of this.units) {
      if (u.player <= 0 || u.spawnT > t || u.removedAt <= t) continue;
      const row = out.get(u.player);
      const kind = row && this.#armyKind(u.typeAt(t));
      if (!kind) continue;
      row.total++;
      row[kind]++;
    }
    return out;
  }

  #armyKind(typeId) {
    if (typeId == null) return null; // unknown trained units are almost always villagers
    const cls = this.game?.units?.[typeId]?.class;
    if (cls != null) return ARMY_CLASSES[cls] ?? (CIVILIAN_CLASSES.has(cls) ? null : 'other');
    const name = this.objectName(typeId);
    if (name === 'Villager' || HERDABLE.test(name) || /Fishing|Trade|Transport|King/.test(name)) return null;
    if (this.objectCategory(typeId) !== 'unit') return null;
    return SIEGE_NAME.test(name) ? 'siege' : 'other';
  }

  /**
   * A summary per player at t: age (exact with the game's notices), units
   * alive (villagers and army, estimated), researches done (estimated end) and
   * buildings standing (walls and farms apart).
   */
  overviewAt(t) {
    const out = new Map();
    for (const p of this.players) {
      const end = Math.min(this.duration, this.resignedAt.get(p.number) ?? Infinity);
      out.set(p.number, {
        age: this.ageAt(p.number, t),
        villagers: 0,
        army: 0,
        researches: this.researches.filter((r) => r.player === p.number && r.t1 <= t && r.t1 <= end && !AGE_TECHS[r.techId]).length,
        buildings: 0,
        walls: 0,
        farms: 0,
      });
    }
    for (const u of this.units) {
      if (u.player <= 0 || u.spawnT > t || u.removedAt <= t) continue;
      const row = out.get(u.player);
      if (!row) continue;
      if (this.#isVillager(u)) row.villagers++;
      else if (this.#armyKind(u.typeAt(t))) row.army++;
    }
    for (const b of this.buildings) {
      if (b.player <= 0 || b.t > t || b.removedAt <= t || b.startT + b.buildTime > t) continue;
      const row = out.get(b.player);
      if (!row) continue;
      const name = this.objectName(b.typeId);
      if (b.line || /Wall|Gate|Palisade/.test(name)) row.walls++;
      else if (name === 'Farm') row.farms++;
      else row.buildings++;
    }
    return out;
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
