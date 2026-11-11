// Colors and per-type numbers used by the viewer. All values are our own
// approximations: nothing here is extracted from the game files.

export const TERRAIN_COLORS = {
  grass: '#5f8f3e',
  forest: '#3d6b2c',
  water: '#2d6aa8',
  deep_water: '#1f4e86',
  shallows: '#5b93c4',
  sand: '#d6bb7f',
  road: '#b39566',
  snow: '#e8eef0',
  farm: '#a08040',
  rock: '#80776b',
};

export const RESOURCE_COLORS = {
  tree: '#1e4a1a',
  gold: '#f5cd3c',
  stone: '#c4c4c4',
  berries: '#c4386d',
  relic: '#ffffff',
};

export const ANIMAL_COLOR = '#8a5a30';

// Keyed by DE color_id, which is 0-based: in the sample replay the player who
// quit at 0:01 has color_id 5 and a teammate's chat says "report purple".
export const PLAYER_COLORS = {
  0: '#3a6fe0', // blue
  1: '#e2342c', // red
  2: '#3caf4a', // green
  3: '#f0d12e', // yellow
  4: '#2ec4c8', // teal
  5: '#9a52d8', // purple
  6: '#a0a0a0', // gray
  7: '#f08c28', // orange
};

// Building footprint in tiles, by name. Unknown buildings use DEFAULT_FOOTPRINT.
export const FOOTPRINTS = {
  'Town Center': 4,
  House: 2,
  Mill: 2,
  'Lumber Camp': 2,
  'Mining Camp': 2,
  Barracks: 3,
  'Archery Range': 3,
  Stable: 3,
  Blacksmith: 3,
  Market: 4,
  Monastery: 3,
  University: 3,
  Castle: 4,
  Dock: 3,
  Farm: 3,
  'Palisade Wall': 1,
  'Stone Wall': 1,
  Outpost: 1,
  'Watch Tower': 1,
};
export const DEFAULT_FOOTPRINT = 2;

// Build time in game seconds with one builder.
export const BUILD_TIMES = {
  House: 25,
  Mill: 35,
  'Lumber Camp': 35,
  'Mining Camp': 35,
  Farm: 15,
  'Palisade Wall': 5,
  Barracks: 50,
};
export const DEFAULT_BUILD_TIME = 40;

// Train time in game seconds.
export const TRAIN_TIMES = {
  Villager: 25,
  'Scout Cavalry': 30,
};
export const DEFAULT_TRAIN_TIME = 25;

// Movement speed in tiles per game second.
export const SPEEDS = {
  Villager: 0.8,
  'Scout Cavalry': 1.2,
  Pig: 0.7,
  Sheep: 0.7,
};
export const DEFAULT_SPEED = 1.0;

// Extra objects that make up a Town Center; only the main one (109) is drawn.
export const HIDDEN_OBJECT_TYPES = new Set([618, 619, 620, 1649, 890]);

// Resource amounts and effective gather rates (per villager, per game second,
// including walks to the drop-off). Estimates: a replay never says how much
// was gathered, only who was told to gather what.
export const RESOURCE_AMOUNTS = {
  tree: 100,
  gold: 800,
  stone: 350,
  berries: 125,
};

export const GATHER_RATES = {
  tree: 0.33,
  gold: 0.33,
  stone: 0.32,
  berries: 0.28,
};

// How far (tiles) a gatherer looks for the next resource of the same kind.
export const RETARGET_RADIUS = 8;

// Fighting. A replay says who was told to attack what, never who won or when the
// target fell: an attacker walks up to its target and fights for this long, or
// until its next order.
export const ATTACK_HOLD_MS = 25_000;
// Unit classes (game data) that fight from a distance, and where they stop (tiles).
export const RANGED_CLASSES = new Set([0, 13, 18, 22, 36, 44, 51, 54, 55]);
export const RANGED_STOP = 5;
export const MELEE_STOP = 0.8;
// Food in a hunted or herded animal, and how fast one villager takes it (per
// game second, walks included). The animal disappears when its food runs out.
export const ANIMAL_FOOD = { Sheep: 100, Goose: 100, Turkey: 100, Llama: 100, Pig: 100, Cow: 150, 'Water Buffalo': 150, Goat: 100, Deer: 140, Zebra: 140, Ostrich: 140, Boar: 340, Elephant: 340, Rhinoceros: 340 };
export const DEFAULT_ANIMAL_FOOD = 140;
export const MEAT_RATE = 0.4;
// A unit whose last order was an attack, and that its player never ordered again
// though they kept playing this long, is taken as fallen in that fight.
export const FALLEN_AFTER_MS = 60_000;
// The same for a unit last sent this close to an enemy building or base (tiles).
export const ENEMY_BUILDING_REACH = 6;
export const ENEMY_BASE_RADIUS = 18;
// How long a fallen unit takes to fade out.
export const FADE_MS = 2_000;

// Animals a villager herds (shepherd) rather than hunts.
export const HERDABLE = /^(Sheep|Goose|Turkey|Llama|Cow|Pig|Water Buffalo|Goat)\b/;
// Hunted only after luring them one at a time: hunters never move on to the next by themselves.
export const DANGEROUS_ANIMALS = /\b(Boar|Javelina|Elephant|Rhinoceros|Bear)\b/;

// Builders of a drop site start gathering the closest of these within reach (tiles).
export const DROP_SITES = { 'Lumber Camp': ['tree'], 'Mining Camp': ['gold', 'stone'], Mill: ['berries'] };
export const DROP_SITE_REACH = 8;

// Research time (game seconds) of the techs that hold up a town center's queue, by legend name.
export const RESEARCH_TIMES = {
  Loom: 25, Wheelbarrow: 75, 'Hand Cart': 55, 'Town Watch': 25, 'Town Patrol': 40,
  'Feudal Age': 130, 'Castle Age': 160, 'Imperial Age': 190,
};

// Age techs: id -> [age it leads to, research time in game seconds].
export const AGE_TECHS = {
  101: [2, 130],
  102: [3, 160],
  103: [4, 190],
};
