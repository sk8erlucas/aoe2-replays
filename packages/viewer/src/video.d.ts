// '@aoe2-replays/viewer/video': the video encoder (browser only, loads Mediabunny).
import type { Quality, Renderer, Replay, SpriteSet, TerrainSet, VideoHeight, VideoZoom } from './index';

export interface VideoFormat {
  codec: 'avc' | 'vp9' | 'vp8';
  extension: 'mp4' | 'webm';
  mimeType: string;
}
/** What this browser can encode at that size (WebCodecs); null if it can't. */
export function videoFormat(height?: VideoHeight, vertical?: boolean): Promise<VideoFormat | null>;
/** The viewer's players panel, drawn top right on every frame. */
export interface VideoTable {
  caption: string;
  columns: Array<{ key: string; label: string }>;
  players: Array<{ number: number; name: string; color: string; newTeam?: boolean }>;
  /** Cells by player number at game time t (numbers already formatted are fine). */
  rows: (t: number) => Map<number, Record<string, number | string | null>>;
}
export interface VideoOptions {
  /** Game ms. */
  from: number;
  to: number;
  speed: number;
  height?: VideoHeight;
  fps?: number;
  quality?: Quality;
  sprites?: SpriteSet | null;
  terrain?: TerrainSet | null;
  /** The viewer's renderer: the video starts with its follow mode. */
  camera?: Renderer | null;
  /** Framing: the viewer's, close, medium (default), far, or the whole map. */
  zoom?: VideoZoom;
  /** 9:16 instead of 16:9. */
  vertical?: boolean;
  /** Tracks to play under the video, in order, looping; null for none. */
  music?: string[] | null;
  overlay?: { players?: { name: string; color: string }[]; watermark?: string | null; font?: string; table?: VideoTable | null };
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}
/** Renders [from, to] of the match frame by frame; rejects with an AbortError when cancelled. */
export function recordVideo(replay: Replay, options: VideoOptions): Promise<{ blob: Blob; extension: VideoFormat['extension'] }>;
