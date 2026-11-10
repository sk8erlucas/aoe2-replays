// Graphics quality levels (no DOM, so it is testable in Node). High is the full
// look; medium and low download and decode much less, for phones and modest
// computers. See tasks/14-calidad-grafica.md.

export const QUALITIES = ['high', 'medium', 'low'];

// Civilization whose buildings stand in for everyone's below high quality
// (British: Western European architecture). Its unique buildings are skipped;
// a building it lacks falls back to the owner's own sprite.
const SHARED_CIV = 1;

export const QUALITY_SETTINGS = {
  high: {
    maxDpr: 2, // canvas pixels per CSS pixel, at most
    fps: 60,
    terrain: true, // game textures (false: flat colours)
    blend: true, // soft edges between terrains
    water: true, // moving water layer
    chunkK: 32, // max px per unit of the close-up ground chunks
    chunks: 64, // close-up ground chunks kept in memory
    baseK: 8, // max px per unit of the whole-map ground layer
    lowRes: false, // half-size atlases
    sharedCiv: null, // one architecture for all players
    rubble: true,
    jobs: true, // work and attack animations
    frameStep: 1, // 2 = every other frame of an animation
    atlasMB: 640, // decoded atlas pages kept before releasing unused ones
  },
  medium: {
    maxDpr: 1.5,
    fps: 30,
    terrain: true,
    blend: false,
    water: false,
    chunkK: 16,
    chunks: 24,
    baseK: 6,
    lowRes: true,
    sharedCiv: SHARED_CIV,
    rubble: false,
    jobs: true,
    frameStep: 2,
    atlasMB: 160,
  },
  low: {
    maxDpr: 1,
    fps: 30,
    terrain: false,
    blend: false,
    water: false,
    chunkK: 16,
    chunks: 0,
    baseK: 4,
    lowRes: true,
    sharedCiv: SHARED_CIV,
    rubble: false,
    jobs: false,
    frameStep: 2,
    atlasMB: 64,
  },
};

/**
 * Quality for a device, from what the browser tells about it:
 * { deviceMemory (GB, Chromium only), cores, screenWidth (CSS px), coarse (touch
 * screen as main pointer), reducedMotion }.
 */
export function pickQuality({ deviceMemory, cores, screenWidth, coarse, reducedMotion } = {}) {
  const memory = deviceMemory ?? null;
  if ((memory != null && memory <= 2) || (coarse && screenWidth != null && screenWidth < 768 && (memory ?? 4) <= 4)) {
    return 'low';
  }
  if (coarse || reducedMotion || (memory != null && memory <= 4) || (cores != null && cores <= 4)) return 'medium';
  return 'high';
}

/** The next lower quality, or null at the lowest. */
export function lowerQuality(q) {
  const i = QUALITIES.indexOf(q);
  return i >= 0 && i < QUALITIES.length - 1 ? QUALITIES[i + 1] : null;
}

/**
 * Watches the frame rate while the match plays and says when to drop a level:
 * below 75% of the target for `windowMs` in a row. Paused time (nothing being
 * drawn) does not count.
 */
export class FpsWatch {
  constructor({ windowMs = 5000, ratio = 0.75 } = {}) {
    this.windowMs = windowMs;
    this.ratio = ratio;
    this.reset();
  }

  reset() {
    this.elapsed = 0;
    this.frames = 0;
  }

  /**
   * One drawn frame `dtMs` after the previous one, aiming at `targetFps`.
   * Returns true when the frame rate has been too low for the whole window.
   */
  frame(dtMs, targetFps) {
    if (!(dtMs > 0) || dtMs > 1000) {
      this.reset(); // a pause or a background tab, not slowness
      return false;
    }
    this.elapsed += dtMs;
    this.frames++;
    if (this.elapsed < this.windowMs) return false;
    const fps = (this.frames * 1000) / this.elapsed;
    this.reset();
    return fps < targetFps * this.ratio;
  }
}
