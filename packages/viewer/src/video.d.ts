// '@aoe2-replays/viewer/video': the video encoder (browser only, loads Mediabunny).
import type { Quality, Renderer, Replay, SpriteSet, TerrainSet, VideoHeight } from './index';

export interface VideoFormat {
  codec: 'avc' | 'vp9' | 'vp8';
  extension: 'mp4' | 'webm';
  mimeType: string;
}
/** What this browser can encode at that size (WebCodecs); null if it can't. */
export function videoFormat(height?: VideoHeight): Promise<VideoFormat | null>;
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
  /** The viewer's renderer: the video starts with its framing and follow mode. */
  camera?: Renderer | null;
  overlay?: { players?: { name: string; color: string }[]; watermark?: string | null; font?: string };
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}
/** Renders [from, to] of the match frame by frame; rejects with an AbortError when cancelled. */
export function recordVideo(replay: Replay, options: VideoOptions): Promise<{ blob: Blob; extension: VideoFormat['extension'] }>;
