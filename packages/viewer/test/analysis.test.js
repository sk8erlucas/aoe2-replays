import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

import { analyze, bucketSize } from '../src/analysis.js';

function game(timeline, duration = 600_000) {
  return {
    game: { duration_ms: duration, players: [{ number: 1 }, { number: 2 }] },
    timeline,
    legend: {
      objects: { 83: { name: 'Villager' }, 70: { name: 'House' }, 74: { name: 'Militia' }, 13: { name: 'Fishing Ship' } },
      technologies: { 101: 'Feudal Age', 22: 'Loom' },
    },
  };
}

test('bucketSize picks a round size for ~30 bars', () => {
  assert.equal(bucketSize(51_091), 10_000);
  assert.equal(bucketSize(25 * 60_000), 60_000);
  assert.equal(bucketSize(90 * 60_000), 300_000);
});

test('APM counts player commands until resign and skips non-actions', () => {
  const moves = Array.from({ length: 60 }, (_, i) => ({ t: i * 1000, type: 'MOVE', player: 1 }));
  const r = analyze(game([
    ...moves,
    { t: 500, type: 'GAME', player: 1 },
    { t: 500, type: 'DE_TRANSFORM', player: 1 },
    { t: 60_000, type: 'RESIGN', player: 1 },
    { t: 61_000, type: 'MOVE', player: 1 },
  ]));
  const p1 = r.players[0];
  assert.equal(p1.activeMs, 60_000);
  assert.equal(p1.actions, 60);
  assert.equal(p1.apm, 60);
  assert.equal(r.players[1].actions, 0);
});

test('APM is null for players active less than 30 s', () => {
  const r = analyze(game([{ t: 1000, type: 'RESIGN', player: 2 }]));
  assert.equal(r.players[1].apm, null);
});

test('build order, trained units and age-up estimate', () => {
  const r = analyze(game([
    { t: 1000, type: 'DE_QUEUE', player: 1, unit_id: 83, amount: 3 },
    { t: 2000, type: 'BUILD', player: 1, building_id: 70 },
    { t: 3000, type: 'RESEARCH', player: 1, technology_id: 22 },
    { t: 4000, type: 'DE_QUEUE', player: 1, unit_id: 83, amount: 1 },
    { t: 500_000, type: 'RESEARCH', player: 1, technology_id: 101 },
  ]));
  const p1 = r.players[0];
  assert.deepEqual(p1.buildOrder.map((b) => [b.kind, b.name]), [
    ['queue', 'Villager'], ['build', 'House'], ['research', 'Loom'], ['queue', 'Villager'], ['age', 'Feudal Age'],
  ]);
  assert.deepEqual(p1.trained, [{ name: 'Villager', amount: 4, kind: 'economy' }]);
  assert.deepEqual(p1.ageUps, [{ key: 'feudal', label: 'Feudal', clickedAt: 500_000, reachedAt: 630_000 }]);
});

test('activity buckets add up to the action count', () => {
  const r = analyze(game([{ t: 0, type: 'MOVE', player: 1 }, { t: 599_999, type: 'MOVE', player: 1 }]));
  assert.equal(r.players[0].activity.reduce((a, b) => a + b, 0), 2);
});

const SAMPLE = new URL('../../../fixtures/sample.json', import.meta.url);

test('sample replay', { skip: !existsSync(SAMPLE) && 'missing fixtures/sample.json' }, () => {
  const r = analyze(JSON.parse(readFileSync(SAMPLE, 'utf8')));
  assert.equal(r.players.length, 8);
  const p7 = r.players.find((p) => p.number === 7);
  assert.equal(p7.apm, null); // resigned at 0:01
  const p1 = r.players.find((p) => p.number === 1);
  assert.ok(p1.buildOrder.some((b) => b.name === 'Loom'));
});

test('queued units are split into economy and army', () => {
  const r = analyze(game([
    { t: 1000, type: 'DE_QUEUE', player: 1, unit_id: 83, amount: 5 },
    { t: 2000, type: 'DE_QUEUE', player: 1, unit_id: 13, amount: 2 },
    { t: 3000, type: 'DE_QUEUE', player: 1, unit_id: 74, amount: 4 },
  ]));
  const p1 = r.players[0];
  assert.equal(p1.economy, 7);
  assert.equal(p1.military, 4);
  assert.equal(p1.trained.find((u) => u.name === 'Militia').kind, 'military');
});
