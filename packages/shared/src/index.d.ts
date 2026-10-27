// Parser JSON contract, schema_version 1. Source of truth: services/parser/README.md.

export interface Point {
  x: number;
  y: number;
}

export interface Player {
  number: number;
  name: string;
  profile_id: number | null;
  civilization_id: number;
  civilization: string | null;
  /** 0-based: 0 blue, 1 red, 2 green, 3 yellow, 4 teal, 5 purple, 6 gray, 7 orange. */
  color_id: number;
  team_id: number;
  is_ai: boolean;
  start: Point | null;
}

export interface Game {
  game_version: string;
  save_version: number;
  build: number | null;
  untested_version: boolean;
  duration_ms: number;
  world_time_ms: number | null;
  speed: number;
  population_limit: number;
  victory_type_id: number;
  starting_age_id: number;
  treaty_length: number;
  multiplayer: boolean;
  players: Player[];
}

export interface GameMap {
  id: number | null;
  name: string | null;
  size: number;
  /** Tile (x, y) is at index y * size + x. */
  terrain: number[];
  elevation: number[];
}

export interface InitialObject {
  id: number;
  player: number;
  type_id: number;
  class_id: number;
  x: number;
  y: number;
}

export interface TimelineEvent {
  t: number;
  type: string;
  player?: number;
  object_ids?: number[];
  x?: number;
  y?: number;
  [field: string]: unknown;
}

export interface ChatMessage {
  t: number;
  player: number | null;
  channel: number | null;
  message: string;
}

export type TerrainCategory =
  | 'grass' | 'forest' | 'water' | 'deep_water' | 'shallows' | 'sand' | 'road' | 'snow' | 'farm' | 'rock';

export type ObjectCategory =
  | 'tree' | 'gold' | 'stone' | 'berries' | 'relic' | 'animal' | 'unit' | 'building' | 'decoration';

export interface Legend {
  terrain: Record<string, { name: string | null; category: TerrainCategory }>;
  objects: Record<string, { name: string | null; category: ObjectCategory }>;
  technologies: Record<string, string | null>;
}

export interface ReplayData {
  schema_version: 1;
  game: Game;
  map: GameMap;
  initial_objects: InitialObject[];
  timeline: TimelineEvent[];
  chat: ChatMessage[];
  legend: Legend;
}

export interface ParserError {
  error: { code: 'invalid_replay' | 'unsupported_version' | 'corrupt_replay' | 'too_large' | 'timeout' | string; message: string };
}
