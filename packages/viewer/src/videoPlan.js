// Video export sizes and estimates, without the encoder (video.js), so the
// dialog can show them before loading it.

export const VIDEO_SIZES = { 720: [1280, 720], 1080: [1920, 1080] };
export const BITS_PER_PIXEL = 4; // per second: ~3.7 Mbps at 720p, ~8.3 Mbps at 1080p

/** Length of the video, in ms. */
export function videoLengthMs({ from, to, speed }) {
  return Math.max(0, to - from) / speed;
}

/** Rough size in bytes, for the dialog. */
export function estimateBytes({ from, to, speed, height }) {
  const [w, h] = VIDEO_SIZES[height] ?? VIDEO_SIZES[720];
  return (videoLengthMs({ from, to, speed }) / 1000) * ((w * h * BITS_PER_PIXEL) / 8);
}
