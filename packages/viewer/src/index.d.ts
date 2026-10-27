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
