// Video export sizes and estimates, without the encoder (video.js), so the
// dialog can show them before loading it.

export const VIDEO_SIZES = { 720: [1280, 720], 1080: [1920, 1080] };
// Camera framings for the video, as a share of the viewer's close zoom ('map':
// the whole map; 'viewer': as the viewer is framed).
export const VIDEO_ZOOMS = { close: 1, medium: 0.55, far: 0.32 };
export const AUDIO_BITRATE = 128_000;

/** [width, height] of the video: landscape, or portrait (9:16) for phones and social media. */
export function videoSize(height = 720, vertical = false) {
  const [w, h] = VIDEO_SIZES[height] ?? VIDEO_SIZES[720];
  return vertical ? [h, w] : [w, h];
}
export const BITS_PER_PIXEL = 4; // per second: ~3.7 Mbps at 720p, ~8.3 Mbps at 1080p

/** Length of the video, in ms. */
export function videoLengthMs({ from, to, speed }) {
  return Math.max(0, to - from) / speed;
}

/** Rough size in bytes, for the dialog. */
export function estimateBytes({ from, to, speed, height, music = false }) {
  const [w, h] = VIDEO_SIZES[height] ?? VIDEO_SIZES[720];
  const seconds = videoLengthMs({ from, to, speed }) / 1000;
  return seconds * ((w * h * BITS_PER_PIXEL) / 8 + (music ? AUDIO_BITRATE / 8 : 0));
}
