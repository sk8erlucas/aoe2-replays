import assert from 'node:assert/strict';
import { test } from 'node:test';

import { FpsWatch, QUALITIES, QUALITY_SETTINGS, lowerQuality, pickQuality } from '../src/quality.js';
import { SpriteSet } from '../src/sprites.js';

test('every quality has the same settings', () => {
  const keys = Object.keys(QUALITY_SETTINGS.high).sort();
  for (const q of QUALITIES) assert.deepEqual(Object.keys(QUALITY_SETTINGS[q]).sort(), keys);
});

test('pickQuality: phones go low or medium, desktops high', () => {
  assert.equal(pickQuality({ deviceMemory: 8, cores: 8, screenWidth: 1920, coarse: false }), 'high');
  assert.equal(pickQuality({ cores: 8, screenWidth: 1440 }), 'high'); // Firefox/Safari: no deviceMemory
  assert.equal(pickQuality({ deviceMemory: 4, cores: 8, screenWidth: 390, coarse: true }), 'low');
  assert.equal(pickQuality({ cores: 6, screenWidth: 390, coarse: true }), 'low'); // iPhone
  assert.equal(pickQuality({ deviceMemory: 8, cores: 8, screenWidth: 1024, coarse: true }), 'medium'); // tablet
  assert.equal(pickQuality({ deviceMemory: 2, cores: 8, screenWidth: 1920 }), 'low');
  assert.equal(pickQuality({ deviceMemory: 4, cores: 8, screenWidth: 1920 }), 'medium');
  assert.equal(pickQuality({ deviceMemory: 8, cores: 8, screenWidth: 1920, reducedMotion: true }), 'medium');
  assert.equal(pickQuality(), 'high');
});

test('lowerQuality steps down and stops at low', () => {
  assert.equal(lowerQuality('high'), 'medium');
  assert.equal(lowerQuality('medium'), 'low');
  assert.equal(lowerQuality('low'), null);
});

test('FpsWatch: asks to drop only after a whole slow window', () => {
  const w = new FpsWatch({ windowMs: 1000 });
  let drop = false;
  for (let i = 0; i < 30; i++) drop = w.frame(1000 / 60, 60) || drop; // 0.5 s at 60 fps
  for (let i = 0; i < 20; i++) drop = w.frame(1000 / 40, 60) || drop;
  assert.equal(drop, false, '~50 fps over the window is fine');
  for (let i = 0; i < 20; i++) drop = w.frame(1000 / 20, 60) || drop;
  assert.equal(drop, true, '20 fps for a second is too slow');
});

test('FpsWatch: a pause resets the window', () => {
  const w = new FpsWatch({ windowMs: 1000 });
  for (let i = 0; i < 15; i++) w.frame(50, 30);
  assert.equal(w.frame(5000, 30), false);
  assert.equal(w.elapsed, 0);
});

// Minimal Image for Node: "loads" on the next tick with a fixed size.
class FakeImage {
  static created = [];
  constructor() {
    this.naturalWidth = 0;
    this.naturalHeight = 0;
    this.onload = null;
    this.onerror = null;
    FakeImage.created.push(this);
  }

  set src(value) {
    this._src = value;
    setImmediate(() => {
      this.naturalWidth = 1000;
      this.naturalHeight = 1000;
      this.onload?.();
    });
  }

  get src() {
    return this._src;
  }

  removeAttribute() {
    this._src = '';
  }
}

function manifest() {
  return {
    tilePx: 64,
    pages: [['a.webp', null], ['b.webp', null], ['c.webp', 'c-mask.webp']],
    pagesLow: [['low/a.webp', null], ['low/b.webp', null], ['low/c.webp', 'low/c-mask.webp']],
    frames: [[0, 10, 20, 30, 40, 5, 6, 0], [1, 0, 0, 8, 8, 0, 0, 0], [2, 0, 0, 8, 8, 0, 0, 1]],
    gaia: {},
    civs: {
      1: { buildings: { 70: { 1: [[0, 0, 0]], 2: [[1, 0, 0]] } } },
      5: { buildings: { 70: { 1: [[2, 0, 0]] }, 999: { 1: [[2, 0, 0]] } } },
    },
  };
}

const tick = () => new Promise((r) => setImmediate(r));

test('SpriteSet: half-size pages keep full-size frame geometry', async () => {
  globalThis.Image = FakeImage;
  const s = new SpriteSet(manifest(), '/sprites');
  s.setQuality({ lowRes: true });
  assert.equal(s.frame(0), null); // requested, loading
  assert.equal(s.pending, 1);
  await tick();
  const f = s.frame(0);
  assert.equal(FakeImage.created.at(-1).src, '/sprites/low/a.webp');
  assert.deepEqual([f.sx, f.sy, f.sw, f.sh], [5, 10, 15, 20]);
  assert.deepEqual([f.w, f.h, f.ax, f.ay], [30, 40, 5, 6]);
  assert.equal(s.pending, 0);
  // Back to full size: pages are dropped and fetched again.
  s.setQuality({ lowRes: false });
  assert.equal(s.frame(0), null);
  await tick();
  assert.equal(s.frame(0).sx, 10);
  assert.equal(FakeImage.created.at(-1).src, '/sprites/a.webp');
});

test('SpriteSet: shared architecture, with the owner\'s own unique buildings', () => {
  const s = new SpriteSet(manifest(), '/sprites');
  assert.deepEqual(s.building(5, 70, 1), [[2, 0, 0]]);
  s.setQuality({ sharedCiv: 1 });
  assert.deepEqual(s.building(5, 70, 2), [[1, 0, 0]]);
  assert.deepEqual(s.building(5, 999, 3), [[2, 0, 0]], 'falls back to the owner and to an earlier age');
});

test('SpriteSet: releases pages not drawn lately when over budget', async () => {
  globalThis.Image = FakeImage;
  const s = new SpriteSet(manifest(), '/sprites');
  s.setQuality({ atlasMB: 5 }); // each fake page decodes to ~3.8 MB
  s.frame(0);
  s.frame(1);
  await tick();
  assert.equal(s.pages.size, 2);
  // Keep drawing page 1 only; page 0 goes once it has been idle a while.
  for (let i = 0; i < 60; i++) {
    s.frame(1);
    s.endFrame();
  }
  assert.deepEqual([...s.pages.keys()], [1]);
  assert.ok(s.decodedBytes <= 5 * 1024 * 1024);
});
