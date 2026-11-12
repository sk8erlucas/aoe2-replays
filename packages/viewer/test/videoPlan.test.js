import assert from 'node:assert/strict';
import { test } from 'node:test';
import { estimateBytes, videoLengthMs } from '../src/videoPlan.js';

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
