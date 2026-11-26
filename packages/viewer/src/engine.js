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
// Castles, towers and town centers shoot at enemies in range, and archers and
// siege at their target (shotsAt): only drawn, arrows take no hit points.
// Soldiers also fight on their own by stance (STANCE command; aggressive by
// default), and on attack-move and patrol, what they meet (#autoFight).
// Deaths, while simulating: a soldier left out when its group is ordered again
// died in between (exact to that window, #deathEvidence); otherwise hit points
// run out in the fights (#hit: the game's numbers, upgrades and civ bonuses),
// never before the orders last name the unit.
// Animals only move in the replay through the clicks on them: an order on an
// animal says where it was right then, so it walks there (a boar lured to the
// town center, a sheep pushed home). Animals are food shared by everyone eating
// them; when one is finished its eaters move on to the nearest of the same kind.
// Deaths are guessed: eaten animals vanish when their food runs out; a unit last
// sent to fight (or into enemy ground) and never ordered again is taken as fallen;
// so are units over the population limit (others must have died). What a player
// who resigns leaves stays where it was, idle. Buildings have the game's hit
// points: those told to attack one hit it until it falls (not before the last
// order naming it). Besides, a building under a real assault (siege or several
// soldiers) that its owner never uses again is taken as razed (the simulation
// hits less than the game: units without an id, siege on its own), and one with
// a new foundation over it as gone by then.
// Garrisoned units are inside their building (not drawn) until let out; back
// to work sends them to what they were doing. A builder that is done goes on to
// the nearest unfinished building of its player.
// Researches queue in their building and take the game's time; when one ends,
// the units it upgrades (Knight -> Cavalier) change, since queue orders always
// name the base unit. Units and researches taken out of a queue are in the
// replay (SPECIAL order 4): they never happen and the queue moves up.

import {
  AGE_TECHS, ANIMAL_FOOD, ARROW_SPEED, BUILDING_FIRE, CARCASS_ROT_MS, COMBAT_STEP_MS, DEFENSIVE_CHASE, FIRE_PERIOD_MS, MIN_SIGHT, STANCES, DANGEROUS_ANIMALS, DROP_SITE_REACH, DROP_SITES, RESEARCH_TIMES, ATTACK_HOLD_MS, BUILD_TIMES, DEFAULT_ANIMAL_FOOD, DEFAULT_BUILD_TIME, DEFAULT_FOOTPRINT,
  DEFAULT_SPEED, DEFAULT_TRAIN_TIME, FADE_MS, FALLEN_AFTER_MS, FOOTPRINTS, GATHER_RATES, HERDABLE, HIDDEN_OBJECT_TYPES,
  ENEMY_BASE_RADIUS, ENEMY_BUILDING_REACH, FARM_RATE, HUNTED_REACH, MEAT_RATE, MELEE_STOP, RANGED_CLASSES, RANGED_STOP, RESOURCE_AMOUNTS, RETARGET_RADIUS, SPEEDS, TRAIN_TIMES,
} from './palette.js';
import { isSystemMessage, noticeTimes, settleAgeUps } from './notices.js';
import { NavGrid } from './pathing.js';
import { stockTimeline } from './economy.js';
import { NOT_ACTIONS } from './analysis.js';

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
// Only soldiers get these (stances, attack-move, patrol).
const MILITARY_ORDERS = new Set(['STANCE', 'DE_ATTACK_MOVE', 'PATROL']);
const TRADE_CLASS = 19;
const MONK_CLASS = 18;
// A group ordered again: these orders select units, so a unit missing from one
// is no longer selectable (dead). See #deathEvidence.
const GROUP_ORDERS = new Set(['MOVE', 'ORDER', 'DE_ATTACK_MOVE', 'PATROL', 'STANCE', 'FORMATION', 'STOP', 'GUARD', 'FOLLOW', 'ATTACK_GROUND']);
const DROP_WINDOW_MS = 180_000; // the same group ordered again within this
const GROUP_KEPT = 0.5; // ...keeping at least this share of it
const DROP_LATEST_MS = 15_000; // in a longer window, it falls this long before the window ends
const ARMY_SHARE = 0.75;
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
// replays stored then have them nameless, the bushes as decoration and the
// spruce trees too (so whole forests were missing).
const LEGEND_FIXES = {
  2650: { name: 'Pineapple Bush', category: 'berries' },
  2084: { name: 'Wild Chicken A', category: 'animal' },
  2086: { name: 'Wild Chicken B', category: 'animal' },
  2088: { name: 'Wild Chicken C', category: 'animal' },
  2731: { name: 'Tree (Spruce)', category: 'tree' },
  2732: { name: 'Tree (Spruce Snow)', category: 'tree' },
  2737: { name: 'Elk', category: 'animal' },
};
const TERRAIN_FIXES = { 131: { name: 'Forest, Spruce', category: 'forest' } };
function withLegendFixes(legend) {
  const missing = Object.keys(LEGEND_FIXES).filter((id) => legend.objects?.[id] && legend.objects[id].name == null);
  const terrain = Object.keys(legend.terrain ?? {}).some((id) => id < 0 || (TERRAIN_FIXES[id] && legend.terrain[id].name == null));
  if (!missing.length && !terrain) return legend;
  const objects = { ...legend.objects };
  for (const id of missing) objects[id] = LEGEND_FIXES[id];
  return { ...legend, objects, terrain: terrain ? fixTerrainLegend(legend.terrain) : legend.terrain };
}

// Before November 2026 the parser read terrain IDs past 127 as negative
// ("Forest, Spruce", 131, came out as -125): the map's and the legend's.
function fixTerrainIds(data) {
  if (!data.map?.terrain?.some((v) => v < 0)) return;
  data.map = { ...data.map, terrain: data.map.terrain.map((v) => (v < 0 ? v + 256 : v)) };
}
function fixTerrainLegend(terrain) {
  const out = {};
  for (const [key, value] of Object.entries(terrain)) {
    const id = Number(key) < 0 ? Number(key) + 256 : Number(key);
    out[id] = value.name == null && TERRAIN_FIXES[id] ? TERRAIN_FIXES[id] : value;
  }
  return out;
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
    // Its speed at t with its player's upgrades (Wheelbarrow, Husbandry...), set by
    // the engine when it has game data; else `speed`.
    this.speedAt = null;
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

  /** Its stance at t (STANCES in palette.js): aggressive until told otherwise. */
  stanceAt(t) {
    let stance = 'aggressive';
    for (const s of this.stances ?? []) {
      if (s.t > t) break;
      stance = s.stance;
    }
    return stance;
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

  // Segments are in time order: the last one started by t. Asked mostly for
  // times a little after the last one (the simulation, playback), so the last
  // answer and the one after it are tried first.
  segmentAt(t) {
    const path = this.path;
    const c = this.cursor ?? 0;
    if (c < path.length && path[c].t0 <= t) {
      if (c + 1 >= path.length || path[c + 1].t0 > t) return path[c];
      if (c + 2 >= path.length || path[c + 2].t0 > t) {
        this.cursor = c + 1;
        return path[c + 1];
      }
    }
    let lo = 0;
    let hi = path.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (path[mid].t0 <= t) lo = mid;
      else hi = mid - 1;
    }
    this.cursor = lo;
    return path[lo];
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

  /** Walks to (x, y) from t. `auto`: not its player's order (it fights on its own). */
  moveTo(t, x, y, auto = false) {
    const from = this.positionAt(t);
    // Commands at the same time replace each other (and what was left of the way there).
    while (this.path.length > 1 && this.path[this.path.length - 1].t0 >= t) this.path.pop();
    // Around obstacles: one segment per leg, each starting when the last one ends.
    const points = this.nav && (from.x !== x || from.y !== y) ? this.nav.path(from.x, from.y, x, y) : [{ x, y }];
    let t0 = t;
    let at = from;
    const speed = this.speedAt ? this.speedAt(t) : this.speed;
    for (const p of points) {
      this.path.push({ t0, x0: at.x, y0: at.y, x1: p.x, y1: p.y, speed, ...(auto ? { auto } : null) });
      t0 += (Math.hypot(p.x - at.x, p.y - at.y) / Math.max(0.1, speed)) * 1000;
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
const WALL_NAME = /Wall|Gate|Palisade/;
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
// The carry itself is the game's (game-data.json `carry`, by villager task unit:
// hunters carry more), with Wheelbarrow and Hand Cart; CARRY without data.
const CARRY = 10;
const HUNTER = 122;
const RAW_RATE = 1.4;
// How far a ranged attacker hits a building from (tiles): its range in the game
// data, capped (a trebuchet's 16 would need unpacking, which isn't simulated).
const SIEGE_REACH = 10;
// APM now (overviewAt): actions in the last minute.
const APM_WINDOW_MS = 60_000;
// Most arrows in one building volley (with units garrisoned inside).
const MAX_ARROWS = 25;
// What counts for the society score (scoresAt).
const SOCIETY = /^(Castle|Wonder)$/;
const costSum = (c) => (c ? c[0] + c[1] + c[2] + c[3] : 0);
// Game attribute ids of the effect commands attributeAt applies.
const FX_ATTRIBUTE = { los: 1, speed: 5, carry: 14 };
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
  // `deathEvidence: false` leaves out the deaths the orders show (to measure
  // the rest against them).
  constructor(data, { gameData = null, dry = false, deathEvidence = true } = {}) {
    fixTerrainIds(data);
    this.data = data;
    this.game = gameData;
    this.legend = withLegendFixes(data.legend ?? { objects: {}, terrain: {}, technologies: {} });
    this.duration = data.game.duration_ms;
    this.players = data.game.players;
    this.playerByNumber = new Map(this.players.map((p) => [p.number, p]));
    this.units = [];
    this.newUnits = []; // added since the last fight step (see #aliveAt)
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
    // Castles and towers told to shoot at something: { from, target, t }, chronological.
    this.buildingShots = [];

    // Object IDs are handed out in creation order: (id, time) pairs that are known
    // place an unknown ID in time, to bind it to the unit trained around then.
    this.idAnchors = [];
    this.trainedByKey = new Map(); // `${event index}:${i}` -> unit trained by that queue command
    this.dry = dry;

    if (!dry) fixShiftedIds(data.timeline);
    this.nav = dry ? null : NavGrid.fromMap(data.map, this.legend.terrain);
    // What the orders say about deaths, exactly: see #deathEvidence.
    this.evidence = dry ? null : Replay.#deathEvidence(data.timeline);
    if (this.evidence && !deathEvidence) this.evidence.fell = new Map();
    this.#loadInitialObjects();
    // A dry run only trains: when each unit comes out, to match it with its ID.
    if (dry) this.plannedIds = new Map();
    else {
      const run = new Replay(data, { gameData, dry: true });
      this.plannedIds = Replay.#planIds(run);
      this.idWants = run.idWants; // what all of an unknown ID's orders say it is
      // IDs that turn out to be buildings (a castle given an order before its
      // ID is known): never units.
      this.laterBuildings = new Set(run.buildingById.keys());
    }
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
    this.#dropUnaffordable();
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
    if (unit.player > 0 && this.game?.units) {
      unit.speedAt = (t) => this.attributeAt(unit.player, unit.typeAt(t), 'speed', t) ?? unit.speed;
    }
    this.units.push(unit);
    this.newUnits.push(unit);
    if (unit.id != null) {
      this.unitById.set(unit.id, unit);
      this.#applyDeath(unit);
    }
    return unit;
  }

  /**
   * What the orders say about each ID, before simulating (exact, from the
   * replay alone):
   * - seen: the last time it was alive (named in an order, its own player's
   *   or an enemy's on it);
   * - fell: when a soldier died, for one left out of its group: a player
   *   orders the same group again (most of it, within DROP_WINDOW_MS) and it
   *   is missing, and it never shows up again. The game only selects living
   *   units, so it died between the two orders: halfway, or DROP_LATEST_MS
   *   before the second in a long window (the fight can take it earlier).
   */
  static #deathEvidence(timeline) {
    const seen = new Map();
    for (const e of timeline) {
      for (const id of e.object_ids ?? []) seen.set(id, e.t);
      if (e.target_id != null && e.target_id >= 0) seen.set(e.target_id, Math.max(seen.get(e.target_id) ?? 0, e.t));
    }
    const fell = new Map();
    const recent = new Map(); // player -> its last orders to 3 or more units: { t, ids }
    for (const e of timeline) {
      if (!GROUP_ORDERS.has(e.type)) continue;
      const ids = e.object_ids ?? [];
      if (ids.length < 3) continue;
      const now = new Set(ids);
      const list = (recent.get(e.player) ?? []).filter((p) => e.t - p.t <= DROP_WINDOW_MS);
      for (const p of list) {
        const kept = ids.filter((id) => p.ids.has(id)).length;
        if (kept < 3 || kept < ids.length * GROUP_KEPT) continue;
        for (const id of p.ids) {
          if (now.has(id) || fell.has(id) || (seen.get(id) ?? 0) > p.t) continue;
          const t = Math.round(Math.max((p.t + e.t) / 2, e.t - DROP_LATEST_MS));
          fell.set(id, { from: p.t, to: e.t, t });
        }
      }
      list.push({ t: e.t, ids: now });
      recent.set(e.player, list);
    }
    return { seen, fell };
  }

  // A soldier the orders show died (see #deathEvidence) is gone from then on,
  // already while simulating: it no longer fights, sees or takes room.
  #applyDeath(unit) {
    const f = this.evidence?.fell.get(unit.id);
    if (!f || unit.removedAt <= f.t || this.#kindOf(unit) !== 'military') return;
    unit.removedAt = Math.max(f.t, unit.spawnT);
    unit.fell = true;
    unit.fellExact = f; // its death is known to within this window
  }

  // The last time the orders show this unit alive (-Infinity if never named).
  #seenAt(unit) {
    return unit.id == null ? -Infinity : this.evidence?.seen.get(unit.id) ?? -Infinity;
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
    if (this.buildingById.has(id) || this.laterBuildings?.has(id)) return null;
    want = this.idWants?.get(id) ?? want;
    const planned = this.trainedByKey.get(this.plannedIds.get(id));
    if (planned && planned.id == null && planned.player === player) return this.#bind(planned, id, t);
    // Prefer the unit trained when this ID was created (IDs grow in creation
    // order), then one already out of its building, then the kind the order wants.
    const [from, to] = this.#idWindow(id);
    const gap = (u) => (u.spawnT < from ? from - u.spawnT : u.spawnT > to ? u.spawnT - to : 0);
    const kindMiss = (u) => (want && this.#kindOf(u) !== want ? 1 : 0);
    const unbound = this.units
      .filter((u) => u.id == null && u.player === player)
      .sort((a, b) => kindMiss(a) - kindMiss(b) || Math.round((gap(a) - gap(b)) / 5000)
        || (a.spawnT > t) - (b.spawnT > t) || a.spawnT - b.spawnT);
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
    this.#applyDeath(unit);
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
    const groups = []; // object_ids of plain moves to 3 or more units
    // Who commands each ID: an order on an ID an enemy commands is an attack,
    // even before the target is known as a unit.
    const owner = new Map();
    for (const e of dry.data.timeline) {
      for (const id of e.object_ids ?? []) if (!owner.has(id)) owner.set(id, e.player);
    }
    const attacks = (e) => e.type === 'ORDER' && owner.has(e.target_id) && dry.#enemies(e.player, owner.get(e.target_id));
    for (const e of dry.data.timeline) {
      if (!UNIT_COMMANDS.has(e.type) && e.type !== 'STANCE') continue;
      // Over all its orders: one villager order (gather, build) makes it a
      // villager, one to trade a trade cart; otherwise attacks, attack-moves,
      // patrols and stances make it a soldier. Its first order alone is often
      // a plain move, which says nothing.
      const want = dry.#orderWants(e) ?? (MILITARY_ORDERS.has(e.type) || attacks(e) ? 'military' : null);
      for (const id of e.object_ids ?? []) {
        if (dry.unitById.has(id) || dry.buildingById.has(id)) continue;
        const known = seen.get(id);
        if (!known) seen.set(id, { id, t: e.t, player: e.player, want });
        else if (want && (!known.want || known.want === 'military')) known.want = want;
      }
      if (!want && (e.object_ids?.length ?? 0) >= 3) groups.push(e.object_ids);
    }
    // Weaker: moved along with soldiers (a group of 3 or more, most of the
    // members that say what they are soldiers) makes it a soldier, if nothing else says.
    const kindOfId = (id) => seen.get(id)?.want ?? (dry.unitById.has(id) ? dry.#kindOf(dry.unitById.get(id)) : null);
    for (const ids of groups) {
      const kinds = ids.map(kindOfId).filter(Boolean);
      if (kinds.length < 2 || kinds.filter((k) => k === 'military').length < kinds.length * ARMY_SHARE) continue;
      for (const id of ids) {
        const x = seen.get(id);
        if (x && !x.want) x.inArmy = true;
      }
    }
    for (const x of seen.values()) if (x.inArmy) x.want = 'military';
    // When each ID was created, roughly: no later than the first order to any
    // higher ID (of any player), and new units usually get an order soon.
    dry.idWants = new Map([...seen.values()].filter((x) => x.want).map((x) => [x.id, x.want]));
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
        if (id.want && dry.#kindOf(u) !== id.want) return 0;
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

      if (e.type === 'STANCE') {
        const stance = STANCES[e.stance_id] ?? 'aggressive';
        for (const id of ids) {
          const unit = this.#resolveUnit(id, e.player, e.t, 'military');
          if (unit?.player === e.player) (unit.stances ??= []).push({ t: e.t, stance });
        }
        continue;
      }

      // Any new order for a unit interrupts what it was gathering (or the wall
      // it was building), and whatever it was fighting on its own.
      for (const id of KEEPS_WORKING.has(e.type) ? [] : ids) {
        this.#leaveWall(id, e.t);
        const unit = this.unitById.get(id);
        if (unit) {
          this.#stopGathering(unit, e.t);
          unit.lastOrderT = e.t;
          unit.sweep = null;
          unit.fight = null;
          if (unit.activities[unit.activities.length - 1]?.auto) unit.stopActivity(e.t);
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
            const from = unit.positionAt(e.t);
            unit.moveTo(e.t, e.x + ox, e.y + oy);
            // Attack-move and patrol fight what they meet; patrol goes back and forth.
            if (e.type === 'DE_ATTACK_MOVE' || e.type === 'PATROL') {
              unit.sweep = { x: e.x + ox, y: e.y + oy, back: e.type === 'PATROL' ? { x: from.x, y: from.y } : null };
            }
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
    if (!place) return null;
    if (this.#enemies(e.player, place.player)) return 'military';
    // Trade carts are sent to markets; a villager on a market only repairs it.
    if (/^Market/.test(this.objectName(place.typeId))) return 'trade';
    return 'villager';
  }

  // What an order can tell apart: villager, trade (carts) or military (the rest).
  #kindOf(unit) {
    if (this.#isVillager(unit)) return 'villager';
    return this.game?.units?.[unit.typeId]?.class === TRADE_CLASS ? 'trade' : 'military';
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

  #approach(unit, t, at, stop, i, auto = false) {
    const from = unit.positionAt(t);
    const dx = from.x - at.x;
    const dy = from.y - at.y;
    const d = Math.hypot(dx, dy);
    if (d <= stop) {
      unit.moveTo(t, from.x, from.y, auto);
      return;
    }
    const k = stop / d;
    const [ox, oy] = formationOffset(i);
    unit.moveTo(t, at.x + dx * k + ox * 0.4, at.y + dy * k + oy * 0.4, auto);
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
      (unit.targets ??= []).push({ t, target: other });
      return true;
    }
    const place = this.buildingById.get(e.target_id) ?? this.#bindClicked(e);
    if (!place || place.removedAt <= t) return false;
    if (this.#enemies(unit.player, place.player)) {
      this.#approach(unit, t, place, place.size / 2 + (villager ? MELEE_STOP : reach), i);
      // With the building's hit points it is attacked until it falls (#attackBuilding).
      unit.startActivity(t, 'attack', this.game?.buildings?.[place.typeId]?.hp ? Infinity : t + ATTACK_HOLD_MS);
      (unit.targets ??= []).push({ t, target: place });
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
      const inside = { t0: unit.arrivalT(), t1: Infinity, unit };
      unit.hidden.push(inside);
      (building.inside ??= []).push(inside); // for its arrows (#arrows)
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
      u.dequeued = true;
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
        if (unit.removedAt <= now) {
          this.gatherers.delete(unit);
          continue;
        }
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
      if (!this.dry && now % COMBAT_STEP_MS === 0) this.#autoFight(now);
    }
  }

  // What a unit type is in a fight: a ship (kept out: they are on the water),
  // or a soldier that fights on its own (land infantry, archers and cavalry;
  // not villagers, trade carts, monks or siege). Cached per type.
  #combatType(typeId) {
    this.combatTypes ??= new Map();
    let c = this.combatTypes.get(typeId);
    if (!c) {
      const cls = this.game?.units?.[typeId]?.class;
      const military = typeId != null && this.#kindOf({ typeId }) === 'military';
      c = {
        ship: SHIP_CLASSES.has(cls),
        fighter: military && cls != null && cls !== MONK_CLASS && !SHIP_CLASSES.has(cls) && !SIEGE_CLASSES.has(cls)
          && !SIEGE_NAME.test(this.objectName(typeId)),
      };
      this.combatTypes.set(typeId, c);
    }
    return c;
  }

  // Players' units out and alive at `now`, kept up as the simulation moves on
  // (now only grows): new units wait until they come out.
  #aliveAt(now) {
    const a = (this.aliveCache ??= { waiting: [], alive: [] });
    if (this.newUnits.length) {
      for (const u of this.newUnits) if (u.player > 0) a.waiting.push(u);
      this.newUnits = [];
    }
    const still = [];
    for (const u of a.waiting) {
      if (u.removedAt <= now || u.dequeued) continue;
      if (u.spawnT <= now) a.alive.push(u);
      else still.push(u);
    }
    a.waiting = still;
    a.alive = a.alive.filter((u) => u.removedAt > now && u.spawnT <= now && !u.dequeued);
    return a.alive;
  }

  // Which side a player is on: their team, or alone without one.
  #side(player) {
    const team = this.playerByNumber.get(player)?.team_id ?? 0;
    return team > 1 ? team : -player;
  }

  // Every COMBAT_STEP_MS: soldiers take on enemies by their stance (see STANCES).
  // A grid of 8-tile cells per side (flat arrays, reused), and which sides
  // are in each cell, to skip the many soldiers with no enemy around.
  #autoFight(now) {
    const sides = (this.sideIndex ??= new Map(this.players.map((p) => [p.number, this.#sideIndex(p.number)])));
    const sideCount = this.sideNumbers.length;
    if (sideCount < 2) return;
    const n = Math.ceil((this.data.map?.size || 256) / 8) + 1;
    const g = (this.fightGrid ??= {
      cells: Array.from({ length: sideCount * n * n }, () => []),
      mask: new Uint16Array(n * n),
      used: [],
    });
    for (const i of g.used) g.cells[i].length = 0;
    g.used.length = 0;
    g.mask.fill(0);
    const cellOf = (v) => Math.min(n - 1, Math.max(0, Math.floor(v / 8)));
    const fighters = [];
    const besiegers = [];
    for (const u of this.#aliveAt(now)) {
      if (u.targets && u.activityAt(now) === 'attack' && !(u.targets[u.targets.length - 1].target instanceof Unit)) besiegers.push(u);
      if (u.hidden.length && u.hiddenAt(now)) continue;

      const c = this.#combatType(u.upgrades.length ? u.typeAt(now) : u.typeId);
      if (c.ship) continue;
      const at = u.positionAt(now);
      const side = sides.get(u.player) ?? 0;
      const cell = cellOf(at.x) * n + cellOf(at.y);
      const i = side * n * n + cell;
      const entry = (u.gridEntry ??= { u, at, side, cell });
      entry.at = at;
      entry.side = side;
      entry.cell = cell;
      if (!g.cells[i].length) g.used.push(i);
      g.cells[i].push(entry);
      g.mask[cell] |= 1 << side;
      if (c.fighter && (this.resignedAt.get(u.player) ?? Infinity) > now) fighters.push(entry);
    }
    const nearest = (entry, radius) => {
      const { at, side: own } = entry;
      let best = null;
      let bestD = radius;
      const r = Math.ceil(radius / 8);
      const cx = cellOf(at.x);
      const cy = cellOf(at.y);
      for (let gx = Math.max(0, cx - r); gx <= Math.min(n - 1, cx + r); gx++) {
        for (let gy = Math.max(0, cy - r); gy <= Math.min(n - 1, cy + r); gy++) {
          const cell = gx * n + gy;
          if (!(g.mask[cell] & ~(1 << own))) continue;
          for (let side = 0; side < sideCount; side++) {
            if (side === own) continue;
            for (const o of g.cells[side * n * n + cell]) {
              const d = Math.hypot(o.at.x - at.x, o.at.y - at.y);
              if (d <= bestD) {
                best = o;
                bestD = d;
              }
            }
          }
        }
      }
      return best;
    };
    // Enemies within two cells (16 tiles, past anyone's sight).
    const enemyAround = ({ at, side }) => {
      const cx = cellOf(at.x);
      const cy = cellOf(at.y);
      const others = ~(1 << side);
      for (let gx = Math.max(0, cx - 2); gx <= Math.min(n - 1, cx + 2); gx++) {
        for (let gy = Math.max(0, cy - 2); gy <= Math.min(n - 1, cy + 2); gy++) if (g.mask[gx * n + gy] & others) return true;
      }
      return false;
    };
    this.#attackBuildings(besiegers, now);
    for (const b of this.#firingBuildings(now)) {
      const side = sides.get(b.player) ?? 0;
      const fire = this.#fire(b);
      const target = nearest({ at: b, side }, fire.range + b.size / 2);
      if (target && target.u.removedAt > now) this.#hit(b, target.u, now, this.#arrows(b, fire, now));
    }
    for (const f of fighters) {
      const { u } = f;
      if (!u.fight && !u.sweep && !enemyAround(f) && u.activityAt(now) !== 'attack') continue;
      if (u.stanceAt(now) === 'none') continue;
      this.#fight(f, nearest, now);
    }
  }

  // Units told to attack a building (siege, soldiers or villagers) hit it once
  // there, until it falls; then they stop. Buildings without hit points in the
  // game data are left to the assault rule (#estimateRazed).
  #attackBuildings(units, now) {
    for (const u of units) {
      const b = u.targets[u.targets.length - 1].target;
      if (!b || !this.game?.buildings?.[b.typeId]?.hp) continue;
      if (b.removedAt <= now) {
        u.stopActivity(now);
        continue;
      }
      if (u.hidden.length && u.hiddenAt(now)) continue;
      const type = this.game?.units?.[u.typeAt(now)];
      const reach = Math.max(MELEE_STOP, RANGED_CLASSES.has(type?.class) ? RANGED_STOP : 0, Math.min(type?.range ?? 0, SIEGE_REACH));
      const at = u.positionAt(now);
      const d = Math.hypot(b.x - at.x, b.y - at.y) - b.size / 2;
      if (d <= reach + 1) this.#hit(u, b, now);
      else if (!at.moving) this.#approach(u, now, b, b.size / 2 + reach, 0);
    }
  }

  // Arrows of a building's volley: its own, plus one for each unit inside, as in
  // the game (all garrisoned units count, a simplification). Capped for drawing.
  #arrows(b, fire, t) {
    let extra = 0;
    for (const x of b.inside ?? []) if (x.t0 <= t && x.t1 > t && x.unit.removedAt > t) extra++;
    return Math.min(MAX_ARROWS, fire.arrows + extra);
  }

  // Finished castles, towers and town centers standing at `now`, of players still in.
  #firingBuildings(now) {
    this.firing ??= this.buildings.filter((b) => b.player > 0 && this.#fire(b));
    if (this.firing.length !== this.firingOf) {
      // New ones placed since: look again (cheap, few buildings shoot).
      this.firing = this.buildings.filter((b) => b.player > 0 && this.#fire(b));
    }
    this.firingOf = this.firing.length;
    return this.firing.filter((b) => b.removedAt > now && now >= b.startT + b.buildTime
      && (this.resignedAt.get(b.player) ?? Infinity) > now);
  }

  /**
   * One combat step of `attacker` (a unit, or a building) on `target`: its hits
   * in COMBAT_STEP_MS, as the game works them out (per hit, each attack class
   * the target has an armour for: attack minus armour, at least 1 in all;
   * ranged ones times their accuracy), with both sides' upgrades and
   * civilization bonuses at `now`. A unit at 0 falls, but never before the
   * orders last name it (then it holds on at 1). Estimated: who hits whom is
   * the engine's guess, and positions are too.
   */
  #hit(attacker, target, now, volleys = 1) {
    const a = this.#stats(attacker.player, attacker instanceof Unit ? attacker.typeAt(now) : attacker.typeId, now, !(attacker instanceof Unit));
    const building = !(target instanceof Unit);
    const t = this.#stats(target.player, building ? target.typeId : target.typeAt(now), now, building);
    if (!a?.atk.size || !t) return;
    let perHit = 0;
    for (const [cls, amount] of a.atk) {
      const armour = t.arm.get(cls);
      if (armour != null) perHit += Math.max(0, amount - armour);
    }
    perHit = Math.max(1, perHit) * (a.acc ?? 100) / 100;
    target.hitBy = attacker.player; // for the military score
    const hits = (COMBAT_STEP_MS / 1000 / Math.max(0.5, a.reload)) * volleys;
    // A building still going up has the part of its hit points built so far.
    target.hp ??= building ? t.hp * Math.max(0.1, Math.min(1, (now - target.startT) / Math.max(1, target.buildTime))) : t.hp;
    target.hp -= perHit * hits;
    if (target.hp > 0) return;
    if (this.#seenAt(target) >= now) {
      target.hp = 1; // alive in a later order: it gets away this time
      return;
    }
    if (building) {
      target.removedAt = now;
      target.razed = true;
      target.razedBy = attacker.player;
      return;
    }
    target.removedAt = now;
    target.fell = true;
    target.killed = true; // fell in a fight the engine worked out
  }

  /**
   * Combat numbers of a unit (or building) type for a player at `now`: the
   * game's (game-data.json), with the effects of the player's researches done
   * by then and its civilization's bonuses. Null without combat data. Cached
   * until the player's next research or age.
   */
  #stats(player, typeId, now, building = false) {
    const base = building ? this.game?.buildings?.[typeId] : this.game?.units?.[typeId];
    if (!base?.hp) return null;
    const done = this.#effectsDone(player, now);
    const key = `${player}:${building ? 'b' : 'u'}${typeId}:${done.length}`;
    this.statCache ??= new Map();
    const hit = this.statCache.get(key);
    if (hit) return hit;
    const st = {
      hp: base.hp,
      atk: new Map(base.atk ?? []),
      arm: new Map(base.arm ?? []),
      reload: base.reload ?? 2,
      acc: base.acc,
    };
    const cls = base.class;
    for (const fx of done) {
      for (const [type, unit, klass, attr, amount] of fx) {
        if (unit === -1 && klass === -1) continue;
        if (unit !== -1 && unit !== typeId) continue;
        if (klass !== -1 && klass !== cls) continue;
        if (attr === 0) st.hp = type === 0 ? amount : type === 4 ? st.hp + amount : st.hp * amount;
        else if (attr === 10) st.reload = type === 0 ? amount : type === 4 ? st.reload + amount : st.reload * amount;
        else if (attr === 8 || attr === 9) {
          if (type === 5) continue;
          // Attack and armour amounts carry their class: class * 256 + amount.
          const sign = amount < 0 ? -1 : 1;
          const v = Math.abs(Math.round(amount));
          const c = v >> 8;
          const n = sign * (v & 255);
          const map = attr === 9 ? st.atk : st.arm;
          if (type === 0) map.set(c, n);
          else if (map.has(c)) map.set(c, map.get(c) + n);
        }
      }
    }
    this.statCache.set(key, st);
    return st;
  }

  /**
   * Line of sight, speed or carry capacity (`attr`: 'los', 'speed', 'carry') of a
   * unit or building type for a player at `now`: the game's number with the
   * effects of the player's researches done by then and its civilization's
   * bonuses (Town Watch, Wheelbarrow, Hand Cart...). `base` replaces the type's
   * own number (what a villager carries depends on its task). Undefined without
   * game data for it.
   */
  attributeAt(player, typeId, attr, now, { building = false, base } = {}) {
    const data = building ? this.game?.buildings?.[typeId] : this.game?.units?.[typeId];
    const start = base ?? data?.[attr];
    if (start === undefined || !data) return start;
    const done = this.#effectsDone(player, now);
    const key = `${player}:${building ? 'b' : 'u'}${typeId}:${attr}:${start}:${done.length}`;
    this.attrCache ??= new Map();
    const hit = this.attrCache.get(key);
    if (hit !== undefined) return hit;
    const id = FX_ATTRIBUTE[attr];
    const cls = data.class;
    let v = start;
    for (const fx of done) {
      for (const [type, unit, klass, a, amount] of fx) {
        if (a !== id || unit === -1 && klass === -1) continue;
        if (unit !== -1 && unit !== typeId) continue;
        if (klass !== -1 && klass !== cls) continue;
        v = type === 0 ? amount : type === 4 ? v + amount : type === 5 ? v * amount : v;
      }
    }
    this.attrCache.set(key, v);
    return v;
  }

  // Effect lists in force for a player at `now`: its civilization's bonuses
  // (those waiting for an age once it is reached) and its researches done.
  #effectsDone(player, now) {
    if (this.fxMemo?.now !== now) this.fxMemo = { now, byPlayer: new Map() };
    const memo = this.fxMemo.byPlayer.get(player);
    if (memo) return memo;
    const techs = this.game?.techs;
    const civ = this.playerByNumber.get(player)?.civilization_id;
    const done = new Set();
    const out = [];
    for (const r of this.researches) {
      if (r.player !== player || r.t1 > now) continue;
      done.add(r.techId);
      const fx = techs?.[r.techId]?.fx;
      if (fx) out.push(fx);
    }
    // Ages: 104 (Dark) from the start, 101-103 when researched.
    done.add(104);
    for (const bonus of this.game?.civs?.[civ] ?? []) {
      if ((bonus.req ?? []).every((id) => done.has(id))) out.push(bonus.fx);
    }
    this.fxMemo.byPlayer.set(player, out);
    return out;
  }

  // Sides numbered from 0 (teams, and each player without one), for the grid.
  #sideIndex(player) {
    this.sideNumbers ??= [];
    const side = this.#side(player);
    let i = this.sideNumbers.indexOf(side);
    if (i < 0) i = this.sideNumbers.push(side) - 1;
    return i;
  }

  #fight(entry, nearest, now) {
    const { u, at } = entry;
    const type = this.game?.units?.[u.typeAt(now)];
    const reach = RANGED_CLASSES.has(type?.class) ? RANGED_STOP : MELEE_STOP;
    const sight = Math.max(MIN_SIGHT, type?.los ?? 0);
    const stance = u.stanceAt(now);
    const last = u.activities[u.activities.length - 1];
    if (u.activityAt(now) === 'attack' && !last?.auto) {
      // Told to attack a unit: keep after it while it is in sight, and hit it once there.
      const other = u.targets?.[u.targets.length - 1]?.target;
      if (other instanceof Unit && other.removedAt > now) {
        const to = other.positionAt(now);
        const d = Math.hypot(to.x - at.x, to.y - at.y);
        if (d > reach + 1 && d < sight * 2) this.#approach(u, now, to, reach, 0);
        else if (d <= reach + 1) this.#hit(u, other, now);
      }
      return;
    }
    if (u.activityAt(now) && !last?.auto) return; // busy with something else
    if (at.moving && !u.sweep && !u.fight) return; // a plain move walks past enemies

    // The enemy it was on, while in reach of a chase; else the nearest in sight.
    let target = null;
    const fight = u.fight;
    const on = fight?.target;
    if (on && on.removedAt > now && !(on.hidden.length && on.hiddenAt(now))) {
      const to = on.positionAt(now);
      const far = Math.hypot(to.x - at.x, to.y - at.y);
      const fromHome = Math.hypot(to.x - fight.home.x, to.y - fight.home.y);
      const keep = stance === 'stand' ? far <= reach + 0.5
        : stance === 'defensive' ? fromHome <= DEFENSIVE_CHASE + reach : far <= sight * 1.5;
      if (keep) target = { u: on, at: to };
    }
    if (!target) target = nearest(entry, stance === 'stand' ? reach + 0.5 : sight);

    if (!target) {
      if (fight) {
        u.fight = null;
        if (last?.auto) u.stopActivity(now);
        if (stance === 'defensive') u.moveTo(now, fight.home.x, fight.home.y, true);
        else if (u.sweep) u.moveTo(now, u.sweep.x, u.sweep.y, true);
      } else if (u.sweep && !at.moving) {
        // At the end of an attack-move it stops; a patrol turns back.
        const { back } = u.sweep;
        if (!back) u.sweep = null;
        else {
          u.sweep = { x: back.x, y: back.y, back: { x: u.sweep.x, y: u.sweep.y } };
          u.moveTo(now, back.x, back.y, true);
        }
      }
      return;
    }

    if (on !== target.u) {
      u.fight = { target: target.u, home: fight?.home ?? { x: at.x, y: at.y } };
      (u.targets ??= []).push({ t: now, target: target.u });
    }
    const d = Math.hypot(target.at.x - at.x, target.at.y - at.y);
    if (d <= reach + 1) this.#hit(u, target.u, now);
    if (stance !== 'stand') {
      if (d > reach + 0.3) {
        // A new way only if the target moved off from where it was going.
        const end = u.path[u.path.length - 1];
        const aim = Math.hypot(end.x1 - target.at.x, end.y1 - target.at.y);
        if (!at.moving || aim > reach + 1) this.#approach(u, now, target.at, reach, 0, true);
      } else if (at.moving) u.moveTo(now, at.x, at.y, true);
    }
    if (last?.kind === 'attack' && last.auto && last.t1 >= now) last.t1 = now + COMBAT_STEP_MS + 500;
    else {
      u.startActivity(now, 'attack', now + COMBAT_STEP_MS + 500);
      u.activities[u.activities.length - 1].auto = true;
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
      u.dropped = true; // nobody killed it
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
      // Only what its player told it: fights on its own (and the walks they
      // take) say nothing about how it ended.
      const last = u.activities.findLast((a) => !a.auto);
      let fellAt = null;
      if (last?.kind === 'attack' && u.lastOrderT <= last.t0) {
        fellAt = last.t1;
      } else if (!last || last.t1 <= u.lastOrderT) {
        // Last sent somewhere enemy (next to their buildings or base) and left there.
        const seg = u.path.findLast((p) => !p.auto);
        const moved = Math.hypot(seg.x1 - seg.x0, seg.y1 - seg.y0);
        if (moved > 0 && seg.t0 >= u.lastOrderT && this.#enemyGround(u.player, seg.x1, seg.y1, seg.t0)) {
          fellAt = seg.t0 + (moved / Math.max(0.1, seg.speed)) * 1000 + ATTACK_HOLD_MS;
        }
      }
      if (fellAt == null) continue;
      // Alive as long as the orders name it.
      fellAt = Math.max(fellAt, this.#seenAt(u) + FADE_MS);
      if (playedOn - fellAt < FALLEN_AFTER_MS) continue;
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
      // Castles and towers shoot at units on their own, never at buildings: an
      // order on a building (often a wall in their way) is the player's.
      const shooters = e.type === 'ORDER' ? ids.map((id) => this.buildingById.get(id))
        .filter((b) => b?.player === e.player && this.#fire(b)) : [];
      if (shooters.length && !target && e.x != null && !this.unitById.has(e.target_id)) {
        target = this.#enemyBuildingAt(e.player, e.x, e.y, e.t);
      }
      const shot = target ?? this.unitById.get(e.target_id);
      if (shot && this.#enemies(e.player, shot.player)) {
        for (const from of shooters) this.buildingShots.push({ from, target: shot, t: e.t });
      }
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
      // A castle or tower kept on a wall brings it down; other buildings take more.
      for (const from of shooters) {
        if (WALL_NAME.test(this.objectName(target.typeId))) a.siege = true;
        else a.attackers.add(from);
      }
      a.last = e.t;
      a.by = e.player;
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
      b.razedBy = a.by;
    }
  }

  // The nearest standing building of an enemy of `player` whose footprint holds (x, y) at t.
  #enemyBuildingAt(player, x, y, t) {
    let best = null;
    let bestD = Infinity;
    for (const b of this.buildings) {
      if (b.t > t || b.removedAt <= t || !this.#enemies(player, b.player)) continue;
      if (Math.abs(b.x - x) > b.size / 2 || Math.abs(b.y - y) > b.size / 2) continue;
      const d = Math.hypot(b.x - x, b.y - y);
      if (d < bestD) {
        best = b;
        bestD = d;
      }
    }
    return best;
  }

  // How a building shoots (BUILDING_FIRE), or null if it doesn't.
  #fire(b) {
    return BUILDING_FIRE[this.objectName(b.typeId)] ?? null;
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
          const alive = mine.filter((u) => u !== born && u.spawnT <= t && u.removedAt > t && takes(u) && this.#seenAt(u) <= t);
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

  // A click the player couldn't pay for is refused by the game: a trained unit
  // whose cost the estimated stock (corrected to the game's totals every ~17 s)
  // couldn't cover never comes out, unless an order names it (then it existed).
  // Needs the replay's totals and the game's costs; the stock is kept for stockAt.
  #dropUnaffordable() {
    if (!this.data.resource_totals?.length || !this.game?.units) return;
    const result = stockTimeline(this);
    this.stock = result?.players ?? null;
    for (const u of result?.refused ?? []) {
      if (u.id != null || u.stalled) continue;
      u.removedAt = u.spawnT;
      u.stalled = true;
      u.unaffordable = true;
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
    const type = u.typeAt(t);
    const carry = this.attributeAt(u.player, type, 'carry', t, { base: this.game?.carry?.[a.kind === 'hunt' ? HUNTER : type] ?? CARRY }) ?? CARRY;
    const speed = this.attributeAt(u.player, type, 'speed', t) ?? u.speed;
    const work = (carry / rate) * 1000;
    const walk = (walkTiles / Math.max(0.1, speed)) * 1000;
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
   * Arrows in the air at state.t (from stateAt): castles, towers and town
   * centers shoot volleys at the nearest enemies in range, or at what their
   * player told them to; archers and siege at what they were sent to attack,
   * once there. Each: { player, x0, y0, z0, x1, y1, z1, p (0..1 of the way), ball }.
   * Only how it looks: the replay has no hit points, so nothing falls to these.
   */
  shotsAt(state) {
    const t = state.t;
    const shots = [];
    const cell = 4;
    const grid = new Map();
    for (const s of state.units) {
      if (s.fading != null || s.unit.player <= 0) continue;
      const key = `${Math.floor(s.x / cell)},${Math.floor(s.y / cell)}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(s.unit);
    }
    // Shooter-specific volley times, so they don't all fire together.
    const volley = (seed) => {
      const phase = (seed * 7919) % FIRE_PERIOD_MS;
      return t - ((t + phase) % FIRE_PERIOD_MS);
    };
    const fly = (from, x0, y0, z0, x1, y1, z1, at, ball = false) => {
      const flight = (Math.hypot(x1 - x0, y1 - y0) / ARROW_SPEED) * 1000;
      const p = (t - at) / Math.max(150, flight);
      if (p >= 0 && p < 1) shots.push({ player: from, x0, y0, z0, x1, y1, z1, p, ball });
    };
    const ordered = new Map(); // building -> its last order
    for (const o of this.buildingShots) {
      if (o.t > t) break;
      ordered.set(o.from, o);
    }
    for (const { building: b, progress, planned } of state.buildings) {
      if (planned || progress < 1) continue;
      const fire = this.#fire(b);
      if (!fire) continue;
      const shotT = volley(b.id ?? b.x * 997 + b.y);
      if (shotT < b.startT + b.buildTime) continue;
      const reach = fire.range + b.size / 2;
      const o = ordered.get(b);
      if (o && shotT < o.t + ATTACK_HOLD_MS && o.target.removedAt > shotT) {
        const at = o.target.positionAt ? o.target.positionAt(shotT) : o.target;
        if (Math.hypot(at.x - b.x, at.y - b.y) <= reach + (o.target.size ?? 0) / 2) {
          const arrows = this.#arrows(b, fire, shotT);
          const gap = Math.min(150, FIRE_PERIOD_MS / 2 / arrows);
          for (let i = 0; i < arrows; i++) fly(b.player, b.x, b.y, fire.z, at.x, at.y, 0.4, shotT + i * gap, fire.ball);
          continue;
        }
      }
      // The nearest enemies where they were when the volley left.
      const near = [];
      const r = Math.ceil((reach + 2) / cell);
      const cx = Math.floor(b.x / cell);
      const cy = Math.floor(b.y / cell);
      for (let gx = cx - r; gx <= cx + r; gx++) {
        for (let gy = cy - r; gy <= cy + r; gy++) {
          for (const u of grid.get(`${gx},${gy}`) ?? []) {
            if (!this.#enemies(b.player, u.player) || u.spawnT > shotT || u.removedAt <= shotT) continue;
            if (u.hidden.length && u.hiddenAt(shotT)) continue;
            const at = u.positionAt(shotT);
            const d = Math.hypot(at.x - b.x, at.y - b.y);
            if (d <= reach) near.push({ at, d });
          }
        }
      }
      near.sort((a, z) => a.d - z.d);
      const arrows = near.length ? this.#arrows(b, fire, shotT) : 0;
      const gap = Math.min(150, FIRE_PERIOD_MS / 2 / Math.max(1, arrows));
      for (let i = 0; i < arrows; i++) {
        const { at } = near[i % near.length];
        fly(b.player, b.x, b.y, fire.z, at.x, at.y, 0.4, shotT + i * gap, fire.ball);
      }
    }
    for (const s of state.units) {
      const u = s.unit;
      if (!u.targets || s.moving || s.fading != null || u.activityAt(t) !== 'attack') continue;
      const cls = this.game?.units?.[u.typeAt(t)]?.class;
      if (!RANGED_CLASSES.has(cls)) continue;
      let o = null;
      for (const x of u.targets) if (x.t <= t) o = x;
      if (!o || o.target.removedAt <= t) continue;
      const shotT = volley(u.id ?? u.spawnT);
      if (shotT < o.t) continue;
      const at = o.target.positionAt ? o.target.positionAt(shotT) : o.target;
      const from = u.positionAt(shotT);
      if (from.moving || Math.hypot(at.x - from.x, at.y - from.y) > RANGED_STOP + (o.target.size ?? 0) / 2 + 1.5) continue;
      fly(u.player, from.x, from.y, 0.5, at.x, at.y, o.target.size ? 0.6 : 0.4, shotT, SIEGE_CLASSES.has(cls));
    }
    return shots;
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
    if (this.stock === undefined) this.stock = stockTimeline(this)?.players ?? null;
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
   * Each player's score at t, like the one over the game's minimap (estimated:
   * the replay doesn't have it), with the game's rules as far as they are known:
   * economy, a tenth of what was gathered (from the game's totals, so close);
   * technology, a fifth of what its researches done cost; society, a fifth of
   * its castles and wonders standing; military, a fifth of what the enemy units
   * and buildings it brought down cost (the least exact: deaths and who caused
   * them are estimates; one nobody is known to have hit is shared among its
   * enemies). Economy is null without the totals (replays parsed before
   * November 2026).
   */
  scoresAt(t) {
    if (this.stock === undefined) this.stockAt(0);
    const stock = this.stock;
    const kills = this.#kills();
    const out = new Map();
    for (const p of this.players) {
      const end = Math.min(this.duration, this.resignedAt.get(p.number) ?? Infinity);
      let economy = null;
      if (stock) {
        const list = stock.get(p.number) ?? [];
        let at = null;
        for (const s of list) {
          if (s.t > t) break;
          at = s;
        }
        economy = Math.floor((at?.gathered ?? 0) / 10);
      }
      let tech = 0;
      for (const r of this.researches) {
        if (r.player === p.number && r.t1 <= t && r.t1 <= end) tech += costSum(this.game?.techs?.[r.techId]?.cost);
      }
      out.set(p.number, { total: 0, military: 0, economy, technology: Math.floor(tech / 5), society: 0 });
    }
    for (const k of kills) {
      if (k.t > t) break;
      for (const n of k.by) {
        const row = out.get(n);
        if (row) row.military += k.value / k.by.length / 5;
      }
    }
    for (const b of this.buildings) {
      if (b.player <= 0 || b.removedAt <= t || b.startT + b.buildTime > t || !SOCIETY.test(this.objectName(b.typeId))) continue;
      const row = out.get(b.player);
      if (row) row.society += costSum(this.game?.buildings?.[b.typeId]?.cost) / 5;
    }
    for (const row of out.values()) {
      row.military = Math.floor(row.military);
      row.society = Math.floor(row.society);
      row.total = row.military + (row.economy ?? 0) + row.technology + row.society;
    }
    return out;
  }

  // Enemy units and buildings brought down, by time: { t, value, by: [players] }.
  #kills() {
    if (this.killList) return this.killList;
    const list = [];
    const add = (victim, t, value, by) => {
      if (!value) return;
      if (by != null && this.#enemies(by, victim.player)) {
        list.push({ t, value, by: [by] });
        return;
      }
      const enemies = this.players.map((p) => p.number)
        .filter((n) => this.#enemies(n, victim.player) && (this.resignedAt.get(n) ?? Infinity) > t);
      if (enemies.length) list.push({ t, value, by: enemies });
    };
    for (const u of this.units) {
      if (u.player <= 0 || !u.fell || u.deleted || u.dropped || !Number.isFinite(u.removedAt)) continue;
      if ((this.resignedAt.get(u.player) ?? Infinity) <= u.removedAt) continue;
      add(u, u.removedAt, costSum(this.game?.units?.[u.typeAt(u.removedAt - 1)]?.cost), u.hitBy);
    }
    for (const b of this.buildings) {
      if (b.player <= 0 || !b.razed || !Number.isFinite(b.removedAt)) continue;
      add(b, b.removedAt, costSum(this.game?.buildings?.[b.typeId]?.cost), b.razedBy);
    }
    this.killList = list.sort((a, b) => a.t - b.t);
    return this.killList;
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
   * alive (villagers and army, estimated), researches done (estimated end),
   * buildings standing (walls and farms apart) and its actions in the last
   * minute (APM now, exact; counted like the analysis).
   */
  overviewAt(t) {
    const out = new Map();
    for (const p of this.players) {
      const end = Math.min(this.duration, this.resignedAt.get(p.number) ?? Infinity);
      out.set(p.number, {
        age: this.ageAt(p.number, t),
        apm: this.#actionsBetween(p.number, t - APM_WINDOW_MS, t),
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

  // How many actions a player took in (from, to], from its sorted action times.
  #actionsBetween(player, from, to) {
    if (!this.actionTimes) {
      this.actionTimes = new Map();
      for (const e of this.data.timeline) {
        if (NOT_ACTIONS.has(e.type)) continue;
        let list = this.actionTimes.get(e.player);
        if (!list) this.actionTimes.set(e.player, (list = []));
        list.push(e.t);
      }
      for (const list of this.actionTimes.values()) list.sort((a, b) => a - b);
    }
    const list = this.actionTimes.get(player) ?? [];
    const after = (x) => {
      let lo = 0;
      let hi = list.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (list[mid] <= x) lo = mid + 1;
        else hi = mid;
      }
      return lo;
    };
    return after(to) - after(from);
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
