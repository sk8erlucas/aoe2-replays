import type { Player, ReplayData } from '@aoe2-replays/shared';

export interface LogEntry {
  t: number;
  player: number | null;
  kind: 'build' | 'queue' | 'research' | 'resign' | 'chat';
  text: string;
}

export class Unit {
  id: number | null;
  player: number;
  typeId: number | null;
  spawnT: number;
  approx: boolean;
  positionAt(t: number): { x: number; y: number; moving: boolean; target: { x: number; y: number } | null };
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
}

export interface State {
  t: number;
  units: Array<{ unit: Unit; x: number; y: number; moving: boolean; target: { x: number; y: number } | null }>;
  buildings: Array<{ building: Building; progress: number }>;
  resigned: Set<number>;
}

export type Hit =
  | ({ kind: 'unit' } & State['units'][number])
  | ({ kind: 'building' } & State['buildings'][number]);

export class Replay {
  constructor(data: ReplayData);
  data: ReplayData;
  duration: number;
  players: Player[];
  playerByNumber: Map<number, Player>;
  resignedAt: Map<number, number>;
  log: LogEntry[];
  objectName(typeId: number): string;
  stateAt(t: number): State;
  logUntil(t: number): LogEntry[];
}

export class Renderer {
  constructor(canvas: HTMLCanvasElement, replay: Replay);
  resize(): void;
  fit(): void;
  zoomAt(sx: number, sy: number, factor: number): void;
  pan(dx: number, dy: number): void;
  draw(state: State): void;
  pick(state: State, sx: number, sy: number): Hit | null;
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
  /** Exact: when the research was clicked. */
  clickedAt: number;
  /** Estimated: click time plus research time. */
  reachedAt: number;
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
  trained: Array<{ name: string; amount: number }>;
  ageUps: AgeUp[];
}

export interface Analysis {
  bucketMs: number;
  players: PlayerAnalysis[];
}

export const AGES: Array<{ key: AgeUp['key']; label: string; tech: string; seconds: number }>;
export function analyze(data: ReplayData): Analysis;
export function bucketSize(durationMs: number, maxBars?: number): number;
