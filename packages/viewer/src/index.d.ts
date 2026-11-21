import type { Player, ReplayData } from '@aoe2-replays/shared';

/** Structured so each UI language words it its own way. */
export interface LogEntry {
  t: number;
  player: number | null;
  kind: 'build' | 'queue' | 'dequeue' | 'research' | 'resign' | 'delete' | 'chat';
  /** Object or technology name (game names, in English). */
  name?: string;
  amount?: number;
  /** Wall pieces in one command. */
  segments?: number;
  /** A wall whose foundations were all deleted before anyone started them. */
  cancelled?: boolean;
  /** Chat message. */
  text?: string;
}

export class Unit {
  id: number | null;
  player: number;
  typeId: number | null;
  spawnT: number;
  /** When it left the game: deleted by its owner, eaten, or estimated fallen (Infinity if never). */
  removedAt: number;
  /** removedAt is an estimated death in a fight. */
  fell: boolean;
  approx: boolean;
  positionAt(t: number): { x: number; y: number; moving: boolean; target: { x: number; y: number } | null };
  /**
   * What the unit is doing at t, estimated: a resource category ('tree', 'gold', 'stone', 'berries'),
   * 'build', 'farm', 'hunt', 'shepherd', 'attack', or null.
   */
  activityAt(t: number): string | null;
  /** Upgrades it got while alive (Knight -> Cavalier), chronological. */
  upgrades: Array<{ t: number; typeId: number }>;
  /** Inside a building (garrisoned) at t: not drawn. */
  hiddenAt(t: number): boolean;
  /** Its type at t: `typeId` (trained, already upgraded if it came out after the research) or the last upgrade by then. */
  typeAt(t: number): number | null;
}

export interface Building {
  id: number | null;
  player: number;
  typeId: number;
  x: number;
  y: number;
  t: number;
  size: number;
  buildTime: number;
  /** When its owner deleted it (Infinity if never). */
  removedAt: number;
  /** Type whose sprite it uses, when not its own (a map's gate drawn as the built one). */
  drawAs?: number;
}

export interface State {
  t: number;
  units: Array<{
    unit: Unit;
    /** The unit's type at this time (see Unit.typeAt). */
    typeId: number | null;
    x: number;
    y: number;
    moving: boolean;
    target: { x: number; y: number } | null;
    /** 1 → 0 while a fallen unit fades out. */
    fading?: number;
  }>;
  /** `planned`: placed but not started yet (a foundation; walls only, see #wall). */
  buildings: Array<{ building: Building; progress: number; planned: boolean }>;
  /** Buildings deleted by their owner: drawn as rubble. */
  ruins: Building[];
  resigned: Set<number>;
}

export type Hit =
  | ({ kind: 'unit' } & State['units'][number])
  | ({ kind: 'building' } & State['buildings'][number]);

/** Food, wood, gold, stone. */
export type Cost = [number, number, number, number];

/** Game data made by tools/sprites (game-data.json). */
export interface GameData {
  /** cost: [food, wood, gold, stone] (missing if free); pop: population it takes, only if not 1. */
  units: Record<string, { speed: number; class: number; train: Array<[number, number]>; cost?: Cost; pop?: number }>;
  /** pop: population room it gives (a house 5). */
  buildings: Record<string, { size: number; buildTime: number; cost?: Cost; pop?: number }>;
  /** Tech id -> where it is researched ([building type, seconds]), its cost and the units it upgrades ([from, to]). */
  techs?: Record<string, { at: Array<[number, number]>; up?: Array<[number, number]>; cost?: Cost }>;
  /** What each map object carries (a gold mine 800, a javelina 300): food, wood, gold or stone. */
  gaia?: Record<string, number>;
  /** English names of the units techs upgrade to (no replay command names them). */
  names?: Record<string, string>;
}

export interface VillagerJobs {
  total: number;
  food: number;
  wood: number;
  gold: number;
  stone: number;
  build: number;
  /** Standing with nothing to do. */
  idle: number;
  /** Walking somewhere or fighting. */
  other: number;
  /** Inside a building (town bell, garrison). */
  garrisoned: number;
}

export type ArmyKind = 'infantry' | 'archers' | 'cavalry' | 'siege' | 'ships' | 'monks' | 'other';

export type Army = { total: number } & Record<ArmyKind, number>;

export interface PlayerOverview {
  age: number;
  villagers: number;
  army: number;
  /** Researches done (ages apart). */
  researches: number;
  /** Standing finished buildings, walls and farms apart. */
  buildings: number;
  walls: number;
  farms: number;
}

/** A research as the engine places it: started when its building's queue frees up, done after its research time (estimated). */
export interface Research {
  player: number;
  techId: number;
  name: string;
  building: Building | null;
  /** When it was clicked (and paid); t0 is when it starts, after what was queued before. */
  clickedAt: number;
  t0: number;
  t1: number;
}

/** Taken out of a production queue: paid when queued (at), given back at t. */
export interface Cancelled {
  player: number;
  t: number;
  at: number;
  unitId?: number;
  techId?: number;
}

export class Replay {
  /** The busiest place (most positioned orders, recent ones weigh more) in the last seconds of game time. */
  /** A building's gather point at time t (exact), or null. */
  rallyAt(building: Building, t: number): { x: number; y: number } | null;
  hotspot(t: number, options?: { windowMs?: number; radius?: number }): { x: number; y: number; score: number } | null;
  constructor(data: ReplayData, options?: { gameData?: GameData | null });
  game: GameData | null;
  data: ReplayData;
  duration: number;
  players: Player[];
  playerByNumber: Map<number, Player>;
  resignedAt: Map<number, number>;
  log: LogEntry[];
  /** Each tech once per player (a repeated click is ignored), in click order. */
  researches: Research[];
  cancelled: Cancelled[];
  objectName(typeId: number): string;
  /** What a player is researching at t (estimated), with progress 0..1. */
  researchesAt(player: number, t: number): Array<{ techId: number; name: string; t0: number; t1: number; progress: number }>;
  /** Each player's villagers at t by job (estimated). */
  villagerJobsAt(t: number): Map<number, VillagerJobs>;
  /** Each player's stockpile (food + wood + gold + stone) at t as the game had it, or null if the replay lacks it. */
  resourcesAt(t: number): Map<number, number | null> | null;
  /**
   * Each player's stockpile at t: the total is the game's (from the replay's syncs),
   * the split by resource estimated and corrected to it every sync. Null without totals.
   */
  stockAt(t: number): Map<number, { total: number; food: number; wood: number; gold: number; stone: number } | null> | null;
  /** Each player's army at t by kind (estimated). */
  armyAt(t: number): Map<number, Army>;
  /** Age, units, researches and buildings per player at t (estimated, ages exact with notices). */
  overviewAt(t: number): Map<number, PlayerOverview>;
  focusOf(player: number, t: number): { t: number; player: number; x: number; y: number };
  /** Age (1 Dark .. 4 Imperial) of a player at time t, estimated from age research. */
  ageAt(player: number, t: number): number;
  /** Estimated age arrivals (2 Feudal .. 4 Imperial) within the match, sorted by time. */
  ageMarks(): Array<{ player: number; age: number; t: number }>;
  latestFocus(t: number): { t: number; player: number; x: number; y: number } | null;
  stateAt(t: number): State;
  logUntil(t: number): LogEntry[];
}

/** Camera mode: null = free, 'auto' = follow the action, number = follow that player. */
export type FollowMode = null | 'auto' | number;

export class Renderer {
  constructor(canvas: HTMLCanvasElement, replay: Replay, options?: { quality?: Quality });
  follow: FollowMode;
  /** Camera position (map u/v) and zoom in CSS px per unit. */
  readonly cam: { u: number; v: number; scale: number };
  readonly target: { u: number; v: number; scale: number };
  /** Drawing size in CSS px. */
  readonly view: { w: number; h: number };
  /** Draw at an exact size, for a canvas that is not on the page. */
  setFixedSize(w: number, h: number): void;
  resize(): void;
  /** Whole map in view (switches to free camera). */
  fit(): void;
  centerOn(x: number, y: number, options?: { scale?: number; instant?: boolean }): void;
  /** Scale for the default close, in-game-like zoom. */
  closeScale(): number;
  setFollow(mode: FollowMode): void;
  /** Fog of war as this player (and their team) saw it; null for none. */
  setFog(player: number | null): void;
  /** The player whose fog of war is shown, or null. */
  fogPlayer: number | null;
  zoomAt(sx: number, sy: number, factor: number): void;
  pan(dx: number, dy: number): void;
  /** Glide the camera; returns true while it is still moving. */
  update(dtMs: number, t: number): boolean;
  /** `pointer` (CSS px): the building under it shows its rally flag. */
  draw(state: State, options?: { pointer?: { x: number; y: number } | null }): void;
  drawMinimap(canvas: HTMLCanvasElement, state: State): void;
  minimapToWorld(canvas: HTMLCanvasElement, mx: number, my: number): [number, number];
  pick(state: State, sx: number, sy: number): Hit | null;
  /** Game sprites to draw with; null keeps the plain shapes. */
  setSprites(sprites: SpriteSet | null): void;
  /** Game terrain textures; resolves when the ground is rebuilt with them (redraw then). */
  setTerrain(terrain: TerrainSet | null): Promise<void>;
  /** Current graphics quality ('high' by default). */
  readonly quality: Quality;
  /** Changes the graphics quality; resolves when the ground is rebuilt (redraw then). */
  setQuality(quality: Quality): Promise<void>;
}

export type Quality = 'high' | 'medium' | 'low';
export const QUALITIES: Quality[];
export interface QualitySettings {
  maxDpr: number;
  fps: number;
  terrain: boolean;
  blend: boolean;
  water: boolean;
  chunkK: number;
  chunks: number;
  baseK: number;
  lowRes: boolean;
  sharedCiv: number | null;
  rubble: boolean;
  jobs: boolean;
  frameStep: number;
  atlasMB: number;
}
export const QUALITY_SETTINGS: Record<Quality, QualitySettings>;
/** Quality for a device, from what the browser reports (all fields optional). */
export function pickQuality(device?: {
  deviceMemory?: number;
  cores?: number;
  screenWidth?: number;
  coarse?: boolean;
  reducedMotion?: boolean;
}): Quality;
/** The next lower quality, or null at the lowest. */
export function lowerQuality(quality: Quality): Quality | null;
/** Says when the frame rate stays too low while playing (drop a quality level then). */
export class FpsWatch {
  constructor(options?: { windowMs?: number; ratio?: number });
  reset(): void;
  frame(dtMs: number, targetFps: number): boolean;
}

/** Game terrain textures in apps/web/public/sprites/terrain (made by tools/sprites/terrain.py). */
export class TerrainSet {
  static load(baseUrl: string): Promise<TerrainSet>;
}

/** Game sprites from the atlases in apps/web/public/sprites (made by tools/sprites). */
export class SpriteSet {
  static load(baseUrl: string): Promise<SpriteSet>;
  /** Fetches the sprite lists of these civilizations (only the ones a match uses). */
  loadCivs(civIds: Array<number | null | undefined>): Promise<void>;
  /** Called whenever an atlas page finishes loading (redraw then). */
  onLoad: (() => void) | null;
  /** Atlas images requested and still downloading. */
  readonly pending: number;
  /** Decoded size of the loaded atlas pages, in bytes (approximate). */
  readonly decodedBytes: number;
}

export function formatTime(ms: number): string;
export function formationOffset(index: number): [number, number];

export const PLAYER_COLORS: Record<number, string>;
export const TERRAIN_COLORS: Record<string, string>;
export const RESOURCE_COLORS: Record<string, string>;

export interface BuildOrderItem {
  t: number;
  kind: 'build' | 'queue' | 'research' | 'age';
  name: string;
  amount?: number;
}

export interface AgeUp {
  key: 'feudal' | 'castle' | 'imperial';
  label: string;
  /** Exact: when the research was first clicked. */
  clickedAt: number;
  /**
   * When the age was reached. With the game's age-up notices (stored as chat) it
   * is exact, and null if it never was (cancelled, or the game ended first).
   * Without them, estimated: click time plus research time.
   */
  reachedAt: number | null;
  /** True when reachedAt comes from the game's notices. */
  exact: boolean;
}

export interface PlayerAnalysis {
  number: number;
  /** Time until the player resigned, or the whole game. */
  activeMs: number;
  actions: number;
  /** Null when the player was active less than 30 s. */
  apm: number | null;
  /** Actions per bucket of `bucketMs`. */
  activity: number[];
  buildOrder: BuildOrderItem[];
  /** Units queued, by type: 'economy' (villagers, fishing, trade, transport) or 'military'. */
  trained: Array<{ name: string; amount: number; kind: 'economy' | 'military' }>;
  /** Totals queued of each kind (queued, not necessarily trained: cancellations are not in a replay). */
  economy: number;
  military: number;
  ageUps: AgeUp[];
}

export interface Analysis {
  bucketMs: number;
  players: PlayerAnalysis[];
}

export const AGES: Array<{ key: AgeUp['key']; label: string; tech: string; seconds: number }>;
/** With `replay` (the engine), units trained leave out cancellations and clicks over a full queue. */
export function analyze(data: ReplayData, options?: { replay?: Replay | null }): Analysis;
export function bucketSize(durationMs: number, maxBars?: number): number;

/**
 * Plain-text match context for pasting into an AI chat; `full` adds every command,
 * `player` focuses it on one player (their build order and commands only).
 */
export function buildAiContext(
  data: ReplayData,
  options?: { full?: boolean; locale?: 'es' | 'en'; player?: number | null },
): { text: string; tokens: number };

/** The map turned to the game's orientation, for the engine and renderer (analysis keeps the original). */
export function toGameOrientation(data: ReplayData): ReplayData;

/** True for a game announcement (e.g. an age-up) that the replay stores as chat. */
export function isSystemMessage(message: { message: string }): boolean;
/** The chat without the game's announcements: only what players wrote. */
export function playerChat(data: ReplayData): ReplayData['chat'];

export type VideoHeight = 720 | 1080;
export const VIDEO_SIZES: Record<VideoHeight, [number, number]>;
/** Length of the video in ms: (to - from) / speed. */
export function videoLengthMs(range: { from: number; to: number; speed: number }): number;
export function estimateBytes(range: { from: number; to: number; speed: number; height: VideoHeight; music?: boolean }): number;
export type VideoZoom = 'viewer' | 'close' | 'medium' | 'far' | 'map';
/** Share of the viewer's close zoom for each framing ('viewer' and 'map' apart). */
export const VIDEO_ZOOMS: Record<'close' | 'medium' | 'far', number>;
/** [width, height]: landscape, or 9:16 portrait. */
export function videoSize(height?: VideoHeight, vertical?: boolean): [number, number];
