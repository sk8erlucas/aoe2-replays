import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

import { Replay, Unit, formatTime } from '../src/engine.js';

function replay(timeline, extra = {}) {
  return new Replay({
    game: {
      duration_ms: 60000,
      players: [{ number: 1, name: 'A', color_id: 1, team_id: 1, start: { x: 10, y: 10 } }],
    },
    map: { size: 20, terrain: [], elevation: [] },
    initial_objects: [
      { id: 100, player: 1, type_id: 109, class_id: 80, x: 10, y: 10 },
      { id: 101, player: 1, type_id: 83, class_id: 70, x: 12, y: 10 },
    ],
    timeline,
    chat: [],
    legend: {
      objects: {
        109: { name: 'Town Center', category: 'building' },
        83: { name: 'Villager', category: 'unit' },
        70: { name: 'House', category: 'building' },
      },
      technologies: { 22: 'Loom' },
    },
    ...extra,
  });
}

test('formatTime', () => {
  assert.equal(formatTime(0), '0:00');
  assert.equal(formatTime(51091), '0:51');
  assert.equal(formatTime(125000), '2:05');
});

test('unit walks in a straight line and stops at the target', () => {
  const u = new Unit({ id: 1, player: 1, typeId: 83, x: 0, y: 0 });
  u.speed = 1;
  u.moveTo(0, 10, 0);
  assert.deepEqual(u.positionAt(5000), { x: 5, y: 0, moving: true, target: { x: 10, y: 0 } });
  assert.equal(u.positionAt(20000).x, 10);
  assert.equal(u.positionAt(20000).moving, false);
});

test('a new command starts from where the unit is', () => {
  const u = new Unit({ id: 1, player: 1, typeId: 83, x: 0, y: 0 });
  u.speed = 1;
  u.moveTo(0, 10, 0);
  u.moveTo(4000, 4, 10);
  assert.equal(u.positionAt(4000).x, 4);
  assert.equal(u.positionAt(30000).y, 10);
});

test('empty object_ids reuse the last selection', () => {
  const r = replay([
    { t: 0, type: 'MOVE', player: 1, object_ids: [101], x: 12, y: 15 },
    { t: 1000, type: 'MOVE', player: 1, object_ids: [], x: 2, y: 10 },
  ]);
  const v = r.unitById.get(101);
  assert.equal(v.path.at(-1).x1, 2);
});

test('trained units spawn after the train time and bind to unknown ids', () => {
  const r = replay([
    { t: 1000, type: 'DE_QUEUE', player: 1, object_ids: [100], amount: 2, unit_id: 83 },
    { t: 60000, type: 'MOVE', player: 1, object_ids: [555], x: 5, y: 5 },
  ]);
  const trained = r.units.filter((u) => u.approx);
  assert.deepEqual(trained.map((u) => u.spawnT), [26000, 51000]);
  assert.equal(r.unitById.get(555), trained[0]);
  assert.equal(r.stateAt(25999).units.length, 1);
  assert.equal(r.stateAt(26000).units.length, 2);
});

test('buildings appear at their command time and finish after the build time', () => {
  const r = replay([{ t: 2000, type: 'BUILD', player: 1, building_id: 70, object_ids: [101], x: 5, y: 5 }]);
  const at = (t) => r.stateAt(t).buildings.find((b) => b.building.typeId === 70);
  assert.equal(at(1999), undefined);
  assert.equal(at(14500).progress, 0.5);
  assert.equal(at(27000).progress, 1);
});

test('resign is recorded once and logged', () => {
  const r = replay([
    { t: 1000, type: 'RESIGN', player: 1 },
    { t: 2000, type: 'RESIGN', player: 1 },
  ]);
  assert.equal(r.resignedAt.get(1), 1000);
  assert.equal(r.log.filter((e) => e.kind === 'resign').length, 1);
  assert.ok(r.stateAt(1500).resigned.has(1));
});

const SAMPLE = new URL('../../../fixtures/sample.json', import.meta.url);

test('sample replay loads end to end', { skip: !existsSync(SAMPLE) && 'missing fixtures/sample.json' }, () => {
  const r = new Replay(JSON.parse(readFileSync(SAMPLE, 'utf8')));
  assert.equal(r.players.length, 8);
  assert.deepEqual([...r.resignedAt.keys()], [7, 3, 4, 1, 5]);
  const end = r.stateAt(r.duration);
  assert.ok(end.buildings.length > 8);
  for (const u of end.units) {
    assert.ok(Number.isFinite(u.x) && Number.isFinite(u.y));
  }
  assert.ok(r.log.some((e) => e.kind === 'chat' && e.text === 'gg'));
});

test('focus follows the last positioned order of a player', () => {
  const r = replay([
    { t: 1000, type: 'MOVE', player: 1, object_ids: [101], x: 15, y: 5 },
    { t: 3000, type: 'RESEARCH', player: 1, object_ids: [100], technology_id: 22 },
    { t: 5000, type: 'BUILD', player: 1, building_id: 70, object_ids: [101], x: 3, y: 4 },
  ]);
  assert.deepEqual(r.focusOf(1, 500), { t: 0, player: 1, x: 10, y: 10 });
  assert.equal(r.focusOf(1, 4000).x, 15);
  assert.equal(r.focusOf(1, 6000).x, 3);
  assert.equal(r.latestFocus(6000).t, 5000);
});
