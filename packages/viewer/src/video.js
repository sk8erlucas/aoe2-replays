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
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  WebMOutputFormat,
  canEncodeVideo,
  getFirstEncodableAudioCodec,
} from 'mediabunny';
import { Renderer } from './render.js';
import { formatTime } from './engine.js';
import { AUDIO_BITRATE, BITS_PER_PIXEL, VIDEO_ZOOMS, videoSize } from './videoPlan.js';

// Best first: H.264 MP4 plays everywhere (phones, WhatsApp); WebM as a fallback.
const FORMATS = [
  { codec: 'avc', extension: 'mp4', mimeType: 'video/mp4' },
  { codec: 'vp9', extension: 'webm', mimeType: 'video/webm' },
  { codec: 'vp8', extension: 'webm', mimeType: 'video/webm' },
];

const LOADING_WAIT_MS = 8000; // longest wait for graphics on one frame

/** The format this browser can encode at that size, or null if it can't encode video. */
export async function videoFormat(height = 720, vertical = false) {
  if (typeof VideoEncoder === 'undefined') return null;
  const [width, h] = videoSize(height, vertical);
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
 * - `camera`: the viewer's renderer, for the 'viewer' framing.
 * - `follow`: who the camera follows, 'auto' (where the action is) or a player
 *   number. Never free: a camera that doesn't move makes a still video.
 * - `fog`: fog of war as this player (and team) saw it, or null.
 * - `zoom`: 'viewer' (its framing), 'close', 'medium', 'far' or 'map' (all of it).
 * - `vertical`: 9:16 instead of 16:9.
 * - `music`: URLs of tracks to play under the video (in order, looping), or null.
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
    follow = 'auto',
    fog = null,
    zoom = 'medium',
    vertical = false,
    music = null,
    overlay = {},
    onProgress = () => {},
    signal,
  } = options;
  const format = await videoFormat(height, vertical);
  if (!format) throw new Error('unsupported');
  const [w, h] = videoSize(height, vertical);

  const canvas = document.createElement('canvas');
  const r = new Renderer(canvas, replay, { quality });
  r.setFixedSize(w, h);
  if (sprites) r.setSprites(sprites);
  if (terrain) await r.setTerrain(terrain);
  placeCamera(r, camera, from, zoom, typeof follow === 'number' ? follow : 'auto');
  if (fog != null) r.setFog(fog);

  const container = format.extension === 'mp4' ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat();
  const output = new Output({ format: container, target: new BufferTarget() });
  const source = new CanvasSource(canvas, {
    codec: format.codec,
    bitrate: Math.round(w * h * BITS_PER_PIXEL),
    keyFrameInterval: 2,
  });
  output.addVideoTrack(source, { frameRate: fps });

  const frameS = 1 / fps;
  const frames = Math.max(1, Math.ceil((to - from) / speed / 1000 / frameS));
  // Music: the game's tracks mixed down to the video's length. No audio codec
  // or no track just leaves the video silent.
  let audio = null;
  if (music?.length) {
    const codec = await getFirstEncodableAudioCodec(container.getSupportedAudioCodecs(), {
      numberOfChannels: 2, sampleRate: SAMPLE_RATE, bitrate: AUDIO_BITRATE,
    }).catch(() => null);
    if (codec) {
      audio = new AudioBufferSource({ codec, bitrate: AUDIO_BITRATE });
      output.addAudioTrack(audio);
    }
  }
  const ctx = canvas.getContext('2d');
  const paint = (t) => {
    r.draw(replay.stateAt(t));
    drawOverlay(ctx, w, h, t, overlay);
  };
  const loading = () => (sprites?.pending ?? 0) > 0 || r.pending;

  let done = false;
  try {
    await output.start();
    if (audio) {
      const mix = await musicMix(music, frames * frameS, signal).catch((err) => {
        if (err?.name === 'AbortError') throw err;
        return null;
      });
      if (mix) await audio.add(mix);
      audio.close();
    }
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

// Follows `follow` ('auto' or a player), framed as asked: the viewer's own
// zoom, a share of the close zoom (sized to the video's short side, so 1080p
// frames like 720p), or the whole map (which then stays still).
function placeCamera(r, camera, t, zoom, follow) {
  if (zoom === 'map') {
    r.fit();
    r.cam = { ...r.target };
    return;
  }
  const side = (view) => Math.max(1, Math.min(view.w, view.h));
  const scale = zoom === 'viewer' && camera
    ? camera.target.scale * (side(r.view) / side(camera.view))
    : r.closeScale() * (VIDEO_ZOOMS[zoom] ?? VIDEO_ZOOMS.medium) * (side(r.view) / 720);
  const f = follow === 'auto'
    ? r.replay.latestFocus(t) ?? r.replay.focusOf(r.replay.players[0]?.number ?? 1, t)
    : r.replay.focusOf(follow, t);
  r.centerOn(f.x, f.y, { scale, instant: true });
  r.setFollow(follow);
  // Start on the action (or the player), not on a glide toward it.
  r.update(0, t);
  r.cam = { ...r.target };
}

const SAMPLE_RATE = 48_000;
const MUSIC_FADE_S = 2;

// The tracks one after another (looping) for `seconds`, fading in and out.
async function musicMix(urls, seconds, signal) {
  const decoder = new OfflineAudioContext(2, 1, SAMPLE_RATE);
  const tracks = [];
  let total = 0;
  for (let i = 0; total < seconds && i < urls.length; i++) {
    if (signal?.aborted) throw abortError();
    const res = await fetch(urls[i], { signal });
    if (!res.ok) continue;
    const buffer = await decoder.decodeAudioData(await res.arrayBuffer());
    tracks.push(buffer);
    total += buffer.duration;
  }
  if (!tracks.length) return null;
  const ctx = new OfflineAudioContext(2, Math.max(1, Math.ceil(seconds * SAMPLE_RATE)), SAMPLE_RATE);
  const gain = ctx.createGain();
  gain.connect(ctx.destination);
  const fade = Math.min(MUSIC_FADE_S, seconds / 4);
  gain.gain.setValueAtTime(0, 0);
  gain.gain.linearRampToValueAtTime(1, fade);
  gain.gain.setValueAtTime(1, Math.max(fade, seconds - fade));
  gain.gain.linearRampToValueAtTime(0, seconds);
  for (let at = 0, i = 0; at < seconds; i++) {
    const node = ctx.createBufferSource();
    node.buffer = tracks[i % tracks.length];
    node.connect(gain);
    node.start(at);
    at += node.buffer.duration;
  }
  return ctx.startRendering();
}

function drawOverlay(ctx, w, h, t, { players = [], watermark = null, font = 'system-ui, sans-serif', table = null }) {
  const unit = Math.min(w, h) / 720; // sizes are designed for 720p (the short side)
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.textBaseline = 'middle';
  const pad = 14 * unit;
  const line = 24 * unit;

  // Clock and players, top left, on a dark plate so they read on any terrain.
  // With the players panel (top right) the names are there already.
  ctx.font = `600 ${15 * unit}px ${font}`;
  if (table) players = [];
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

  if (table) drawTable(ctx, w, t, table, unit, font);

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

// The viewer's players panel (the tab picked there), top right: a caption, a
// header row and one row per player with its colour swatch.
function drawTable(ctx, w, t, { caption, columns, players, rows }, unit, font) {
  const data = rows(t);
  const pad = 8 * unit;
  const line = 19 * unit;
  const gap = 10 * unit;
  const swatch = 10 * unit;
  ctx.font = `500 ${13 * unit}px ${font}`;
  const name = (p) => (p.name.length > 16 ? `${p.name.slice(0, 15)}…` : p.name);
  const nameW = Math.max(...players.map((p) => ctx.measureText(name(p)).width)) + swatch + 6 * unit;
  const cell = (p, c) => data.get(p.number)?.[c.key] ?? '–';
  const colW = columns.map((c) => Math.max(ctx.measureText(c.label).width, ...players.map((p) => ctx.measureText(String(cell(p, c))).width)));
  const width = pad * 2 + nameW + colW.reduce((a, b) => a + b + gap, 0);
  const height = pad * 2 + line * (players.length + 2);
  const x0 = w - 14 * unit - width;
  const y0 = 14 * unit;
  ctx.fillStyle = 'rgba(11, 12, 13, 0.62)';
  ctx.fillRect(x0, y0, width, height);

  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(243, 234, 216, 0.7)';
  ctx.font = `500 ${11 * unit}px ${font}`;
  ctx.fillText(caption, x0 + pad, y0 + pad + line / 2);
  ctx.font = `600 ${12 * unit}px ${font}`;
  const right = [];
  let x = x0 + pad + nameW;
  for (const cw of colW) {
    x += gap + cw;
    right.push(x);
  }
  ctx.textAlign = 'right';
  columns.forEach((c, i) => ctx.fillText(c.label, right[i], y0 + pad + line * 1.5));
  ctx.font = `500 ${13 * unit}px ${font}`;
  players.forEach((p, r) => {
    const y = y0 + pad + line * (r + 2.5);
    if (p.newTeam) {
      ctx.fillStyle = 'rgba(243, 234, 216, 0.25)';
      ctx.fillRect(x0 + pad, y - line / 2, width - pad * 2, Math.max(1, unit));
    }
    ctx.fillStyle = p.color;
    ctx.fillRect(x0 + pad, y - swatch / 2, swatch, swatch);
    ctx.fillStyle = '#f3ead8';
    ctx.textAlign = 'left';
    ctx.fillText(name(p), x0 + pad + swatch + 6 * unit, y);
    ctx.textAlign = 'right';
    columns.forEach((c, i) => {
      const v = cell(p, c);
      ctx.globalAlpha = v === 0 || v === '0' || v === '–' ? 0.45 : 1;
      ctx.fillText(String(v), right[i], y);
    });
    ctx.globalAlpha = 1;
  });
}
