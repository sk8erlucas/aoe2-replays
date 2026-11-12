// Video export: draws the match frame by frame on a canvas that is not on the
// page, encodes each frame with WebCodecs at its exact time and muxes an MP4
// (WebM where the browser can't encode H.264) with Mediabunny (MPL-2.0).
// Browser only; the engine stays DOM-free.
//
// MediaRecorder was tried first: it stamps frames with the wall clock, so a slow
// frame (sprites decoding) stretched the video and frames sent to catch up were
// dropped, and pausing it didn't help in Chrome. Encoding frame by frame keeps
// the timing exact and runs faster than real time.

import {
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  WebMOutputFormat,
  canEncodeVideo,
} from 'mediabunny';
import { Renderer } from './render.js';
import { formatTime } from './engine.js';
import { BITS_PER_PIXEL, VIDEO_SIZES } from './videoPlan.js';

// Best first: H.264 MP4 plays everywhere (phones, WhatsApp); WebM as a fallback.
const FORMATS = [
  { codec: 'avc', extension: 'mp4', mimeType: 'video/mp4' },
  { codec: 'vp9', extension: 'webm', mimeType: 'video/webm' },
  { codec: 'vp8', extension: 'webm', mimeType: 'video/webm' },
];

const LOADING_WAIT_MS = 8000; // longest wait for graphics on one frame

/** The format this browser can encode at that size, or null if it can't encode video. */
export async function videoFormat(height = 720) {
  if (typeof VideoEncoder === 'undefined') return null;
  const [width, h] = VIDEO_SIZES[height] ?? VIDEO_SIZES[720];
  for (const format of FORMATS) {
    try {
      if (await canEncodeVideo(format.codec, { width, height: h, bitrate: width * h * BITS_PER_PIXEL })) return format;
    } catch {
      // try the next one
    }
  }
  return null;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function abortError() {
  return new DOMException('Video export cancelled', 'AbortError');
}

/**
 * Renders [from, to] of the match (game ms) and resolves with the video.
 *
 * - `camera`: the viewer's renderer; the video starts with its framing and follow mode.
 * - `overlay`: { players: [{ name, color }], watermark: string | null, font: CSS font family }.
 * - `onProgress(fraction)` is called once per frame; `signal` cancels.
 */
export async function recordVideo(replay, options) {
  const {
    from,
    to,
    speed,
    height = 720,
    fps = 30,
    quality = 'high',
    sprites = null,
    terrain = null,
    camera = null,
    overlay = {},
    onProgress = () => {},
    signal,
  } = options;
  const format = await videoFormat(height);
  if (!format) throw new Error('unsupported');
  const [w, h] = VIDEO_SIZES[height] ?? VIDEO_SIZES[720];

  const canvas = document.createElement('canvas');
  const r = new Renderer(canvas, replay, { quality });
  r.setFixedSize(w, h);
  if (sprites) r.setSprites(sprites);
  if (terrain) await r.setTerrain(terrain);
  placeCamera(r, camera, from);

  const output = new Output({
    format: format.extension === 'mp4' ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(),
    target: new BufferTarget(),
  });
  const source = new CanvasSource(canvas, {
    codec: format.codec,
    bitrate: Math.round(w * h * BITS_PER_PIXEL),
    keyFrameInterval: 2,
  });
  output.addVideoTrack(source, { frameRate: fps });

  const frameS = 1 / fps;
  const frames = Math.max(1, Math.ceil((to - from) / speed / 1000 / frameS));
  const ctx = canvas.getContext('2d');
  const paint = (t) => {
    r.draw(replay.stateAt(t));
    drawOverlay(ctx, w, h, t, overlay);
  };
  const loading = () => (sprites?.pending ?? 0) > 0 || r.pending;

  let done = false;
  try {
    await output.start();
    for (let i = 0; i < frames; i++) {
      if (signal?.aborted) throw abortError();
      const t = Math.min(to, from + i * frameS * 1000 * speed);
      r.update(frameS * 1000, t);
      paint(t);
      // Graphics still loading (a new area, a civilization's buildings): wait for them.
      for (let waited = 0; loading() && waited < LOADING_WAIT_MS; waited += 50) {
        await sleep(50);
        if (signal?.aborted) throw abortError();
        paint(t);
      }
      await source.add(i * frameS, frameS);
      onProgress((i + 1) / frames);
      // Let the page breathe (progress bar, cancel button) now and then.
      if (i % 10 === 9) await sleep(0);
    }
    source.close();
    await output.finalize();
    done = true;
  } finally {
    if (!done) await output.cancel().catch(() => {});
    r.setSprites(null);
  }
  return { blob: new Blob([output.target.buffer], { type: format.mimeType }), extension: format.extension };
}

// Same framing as the viewer: its follow mode, and as much of the map in view.
function placeCamera(r, camera, t) {
  if (!camera) {
    r.setFollow('auto');
    const f = r.replay.latestFocus(t) ?? r.replay.focusOf(r.replay.players[0]?.number ?? 1, t);
    r.centerOn(f.x, f.y, { scale: r.closeScale(), instant: true });
    return;
  }
  const ratio = r.view.h / Math.max(1, camera.view.h);
  r.setFollow(camera.follow);
  r.cam = { u: camera.cam.u, v: camera.cam.v, scale: camera.cam.scale * ratio };
  r.target = { u: camera.target.u, v: camera.target.v, scale: camera.target.scale * ratio };
  // Followed players: start on them, not on a glide from where the viewer was.
  if (camera.follow != null) {
    r.update(0, t);
    r.cam = { ...r.target };
  }
}

function drawOverlay(ctx, w, h, t, { players = [], watermark = null, font = 'system-ui, sans-serif' }) {
  const unit = h / 720; // sizes are designed for 720p
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.textBaseline = 'middle';
  const pad = 14 * unit;
  const line = 24 * unit;

  // Clock and players, top left, on a dark plate so they read on any terrain.
  ctx.font = `600 ${15 * unit}px ${font}`;
  const rows = [formatTime(t), ...players.map((p) => p.name)];
  const width = Math.max(...rows.map((s) => ctx.measureText(s).width)) + pad * 2 + 18 * unit;
  ctx.fillStyle = 'rgba(11, 12, 13, 0.62)';
  ctx.fillRect(pad, pad, width, line * rows.length + pad);
  ctx.fillStyle = '#f3ead8';
  ctx.fillText(rows[0], pad * 2, pad + line / 2 + pad / 2);
  players.forEach((p, i) => {
    const y = pad + line * (i + 1.5) + pad / 2;
    ctx.fillStyle = p.color;
    ctx.fillRect(pad * 2, y - 6 * unit, 12 * unit, 12 * unit);
    ctx.fillStyle = '#f3ead8';
    ctx.fillText(p.name, pad * 2 + 18 * unit, y);
  });

  if (watermark) {
    ctx.font = `600 ${14 * unit}px ${font}`;
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(243, 234, 216, 0.75)';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 4 * unit;
    ctx.fillText(watermark, w - pad, h - pad - 8 * unit);
  }
  ctx.restore();
}
