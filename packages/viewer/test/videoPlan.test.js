import assert from 'node:assert/strict';
import { test } from 'node:test';
import { estimateBytes, videoLengthMs, videoSize } from '../src/videoPlan.js';

test('video length is the game range over the speed', () => {
  assert.equal(videoLengthMs({ from: 60_000, to: 1_020_000, speed: 16 }), 60_000);
  assert.equal(videoLengthMs({ from: 5_000, to: 1_000, speed: 4 }), 0);
});

test('size estimate grows with resolution', () => {
  const range = { from: 0, to: 960_000, speed: 16 };
  const hd = estimateBytes({ ...range, height: 720 });
  assert.ok(hd > 20e6 && hd < 35e6, String(hd));
  assert.ok(estimateBytes({ ...range, height: 1080 }) > hd * 2);
});

test('vertical videos swap the sides; music adds a little', () => {
  assert.deepEqual(videoSize(720, true), [720, 1280]);
  assert.deepEqual(videoSize(1080), [1920, 1080]);
  const range = { from: 0, to: 960_000, speed: 16, height: 720 };
  const silent = estimateBytes(range);
  const withMusic = estimateBytes({ ...range, music: true });
  assert.ok(withMusic > silent && withMusic < silent * 1.05);
});
