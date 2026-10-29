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

function forest(timeline, extraObjects = [], extraLegend = {}) {
  return new Replay({
    game: {
      duration_ms: 1_000_000,
      players: [{ number: 1, name: 'A', color_id: 0, team_id: 1, start: { x: 10, y: 10 } }],
    },
    map: { size: 40, terrain: [], elevation: [] },
    initial_objects: [
      { id: 100, player: 1, type_id: 109, class_id: 80, x: 10, y: 10 },
      { id: 101, player: 1, type_id: 83, class_id: 70, x: 20, y: 20 },
      { id: 200, player: 0, type_id: 349, class_id: 10, x: 20, y: 21 },
      { id: 201, player: 0, type_id: 349, class_id: 10, x: 21, y: 22 },
      { id: 202, player: 0, type_id: 349, class_id: 10, x: 35, y: 35 }, // too far to retarget
      ...extraObjects,
    ],
    timeline,
    chat: [],
    legend: {
      objects: {
        109: { name: 'Town Center', category: 'building' },
        83: { name: 'Villager', category: 'unit' },
        349: { name: 'Tree', category: 'tree' },
        ...extraLegend,
      },
      technologies: {},
    },
  });
}

test('gathered trees disappear and the villager moves to the nearest one', () => {
  const r = forest([{ t: 0, type: 'ORDER', player: 1, object_ids: [101], target_id: 200, x: 20, y: 21 }]);
  const tree = (id) => r.resources.find((x) => x.id === id);
  // 100 wood at 0.33/s: about 304 s (plus ~2 s walking).
  assert.ok(tree(200).depletedAt > 300_000 && tree(200).depletedAt < 310_000, `${tree(200).depletedAt}`);
  assert.ok(tree(201).depletedAt > tree(200).depletedAt + 300_000);
  assert.equal(tree(202).depletedAt, Infinity);
  const v = r.unitById.get(101);
  assert.equal(v.positionAt(tree(200).depletedAt + 10_000).x, 21);
});

test('a new order stops gathering', () => {
  const r = forest([
    { t: 0, type: 'ORDER', player: 1, object_ids: [101], target_id: 200, x: 20, y: 21 },
    { t: 100_000, type: 'MOVE', player: 1, object_ids: [101], x: 5, y: 5 },
  ]);
  const tree = r.resources.find((x) => x.id === 200);
  assert.equal(tree.depletedAt, Infinity);
  assert.ok(tree.remaining > 60 && tree.remaining < 75, `${tree.remaining}`);
});

test('units trained with a gather point on a resource go gather it', () => {
  const r = forest([
    { t: 0, type: 'GATHER_POINT', player: 1, object_ids: [100], target_id: 200, x: 20, y: 21 },
    { t: 0, type: 'DE_QUEUE', player: 1, object_ids: [100], amount: 1, unit_id: 83 },
  ]);
  const tree = r.resources.find((x) => x.id === 200);
  assert.ok(tree.depletedAt < Infinity);
});

test('age is estimated from age research plus its research time', () => {
  const r = replay([{ t: 10_000, type: 'RESEARCH', player: 1, object_ids: [100], technology_id: 101 }]);
  assert.equal(r.ageAt(1, 139_999), 1);
  assert.equal(r.ageAt(1, 140_000), 2);
  assert.equal(r.ageAt(2, 500_000), 1);
});

test('units queued in a building built during the game come out of it (with game data)', () => {
  const gameData = {
    units: { 38: { speed: 1.35, class: 12, train: [[101, 30]] } },
    buildings: { 101: { size: 3, buildTime: 50 } },
  };
  const data = {
    game: { duration_ms: 600_000, players: [{ number: 1, name: 'A', color_id: 0, team_id: 1, start: { x: 10, y: 10 } }] },
    map: { size: 40, terrain: [], elevation: [] },
    initial_objects: [{ id: 101, player: 1, type_id: 83, class_id: 70, x: 12, y: 10 }],
    timeline: [
      { t: 1000, type: 'BUILD', player: 1, building_id: 101, object_ids: [101], x: 30, y: 30 },
      { t: 100_000, type: 'DE_QUEUE', player: 1, object_ids: [900], amount: 1, unit_id: 38 },
      { t: 200_000, type: 'MOVE', player: 1, object_ids: [901], x: 5, y: 5 },
    ],
    chat: [],
    legend: { objects: { 83: { name: 'Villager', category: 'unit' }, 101: { name: 'Stable', category: 'building' }, 38: { name: 'Knight', category: 'unit' } } },
  };
  const r = new Replay(data, { gameData });
  const stable = r.buildingById.get(900);
  assert.equal(stable?.typeId, 101);
  assert.equal(stable.size, 3);
  assert.equal(stable.buildTime, 50_000);
  const knight = r.unitById.get(901);
  assert.equal(knight.typeId, 38);
  assert.equal(knight.speed, 1.35);
  assert.equal(knight.spawnT, 130_000);
});

test('villager activity: chopping until a new order, building until done', () => {
  const r = forest([
    { t: 0, type: 'ORDER', player: 1, object_ids: [101], target_id: 200, x: 20, y: 21 },
    { t: 50_000, type: 'BUILD', player: 1, building_id: 70, object_ids: [101], x: 25, y: 25 },
    { t: 200_000, type: 'MOVE', player: 1, object_ids: [101], x: 5, y: 5 },
  ]);
  const v = r.unitById.get(101);
  assert.equal(v.activityAt(10_000), 'tree');
  assert.equal(v.activityAt(60_000), 'build');
  // House: 40 s default build time in this legend-less test, so done at 90 s.
  assert.equal(v.activityAt(100_000), null);
  assert.equal(v.activityAt(250_000), null);
});

test('activity moves to the next tree when one runs out', () => {
  const r = forest([{ t: 0, type: 'ORDER', player: 1, object_ids: [101], target_id: 200, x: 20, y: 21 }]);
  const v = r.unitById.get(101);
  const firstDone = r.resources.find((x) => x.id === 200).depletedAt;
  assert.equal(v.activityAt(firstDone + 1000), 'tree');
});

test('farm builders keep farming until their next order', () => {
  const r = forest([
    { t: 0, type: 'BUILD', player: 1, building_id: 50, object_ids: [101], x: 22, y: 22 },
    { t: 300_000, type: 'MOVE', player: 1, object_ids: [101], x: 5, y: 5 },
  ], [], { 50: { name: 'Farm', category: 'building' } });
  const v = r.unitById.get(101);
  assert.equal(v.activityAt(10_000), 'build');
  assert.equal(v.activityAt(100_000), 'farm');
  assert.equal(v.activityAt(310_000), null);
});

test('an order before the farm is done cancels the farming that would follow', () => {
  const r = forest([
    { t: 0, type: 'BUILD', player: 1, building_id: 50, object_ids: [101], x: 22, y: 22 },
    { t: 5_000, type: 'MOVE', player: 1, object_ids: [101], x: 5, y: 5 },
  ], [], { 50: { name: 'Farm', category: 'building' } });
  const v = r.unitById.get(101);
  assert.equal(v.activityAt(100_000), null);
});

// Two teams: players 1 and 2 against 3.
function skirmish(timeline) {
  return new Replay({
    game: {
      duration_ms: 120_000,
      players: [
        { number: 1, name: 'A', color_id: 0, team_id: 2, start: { x: 10, y: 10 } },
        { number: 2, name: 'B', color_id: 1, team_id: 2, start: { x: 30, y: 10 } },
        { number: 3, name: 'C', color_id: 2, team_id: 3, start: { x: 10, y: 30 } },
      ],
    },
    map: { size: 40, terrain: [], elevation: [] },
    initial_objects: [
      { id: 101, player: 1, type_id: 83, x: 12, y: 10 },
      { id: 102, player: 1, type_id: 74, x: 12, y: 12 },
      { id: 201, player: 2, type_id: 74, x: 30, y: 12 },
      { id: 301, player: 3, type_id: 74, x: 12, y: 30 },
      { id: 302, player: 3, type_id: 70, x: 20, y: 30 },
      { id: 401, player: 0, type_id: 594, x: 14, y: 14 },
      { id: 402, player: 0, type_id: 1060, x: 16, y: 10 },
    ],
    timeline,
    chat: [],
    legend: {
      objects: {
        83: { name: 'Villager', category: 'unit' },
        74: { name: 'Militia', category: 'unit' },
        70: { name: 'House', category: 'building' },
        594: { name: 'Sheep', category: 'animal' },
        1060: { name: 'Deer', category: 'animal' },
      },
    },
  });
}

test('villagers herd sheep and hunt deer until their next order', () => {
  const r = skirmish([
    { t: 0, type: 'ORDER', player: 1, object_ids: [101], target_id: 401, x: 14, y: 14 },
    { t: 30_000, type: 'ORDER', player: 1, object_ids: [101], target_id: 402, x: 16, y: 10 },
    { t: 90_000, type: 'MOVE', player: 1, object_ids: [101], x: 5, y: 5 },
  ]);
  const v = r.unitById.get(101);
  assert.equal(v.activityAt(10_000), 'shepherd');
  assert.equal(v.activityAt(60_000), 'hunt');
  assert.equal(v.activityAt(95_000), null);
  // Next to the deer, not on top of it.
  const at = v.positionAt(89_000);
  const d = Math.hypot(at.x - 16, at.y - 10);
  assert.ok(d > 0.3 && d < 1.5, `distance ${d}`);
});

test('an order on an enemy is an attack of fixed length; allies are not attacked', () => {
  const r = skirmish([
    { t: 0, type: 'ORDER', player: 1, object_ids: [102], target_id: 301, x: 12, y: 30 },
    { t: 0, type: 'ORDER', player: 2, object_ids: [201], target_id: 102, x: 12, y: 12 },
  ]);
  const m = r.unitById.get(102);
  assert.equal(m.activityAt(10_000), 'attack');
  assert.equal(m.activityAt(30_000), null);
  assert.ok(Math.hypot(m.positionAt(60_000).x - 12, m.positionAt(60_000).y - 30) < 1.5);
  assert.equal(r.unitById.get(201).activityAt(10_000), null);
});

test('enemy buildings are attacked from outside their footprint', () => {
  const r = skirmish([{ t: 0, type: 'ORDER', player: 1, object_ids: [102], target_id: 302, x: 20, y: 30 }]);
  const m = r.unitById.get(102);
  assert.equal(m.activityAt(5_000), 'attack');
  const at = m.positionAt(60_000);
  assert.ok(Math.hypot(at.x - 20, at.y - 30) >= 1, 'stops at the wall, not inside');
});

test('villagers sent to an unfinished building of their own help build it', () => {
  const r = skirmish([
    { t: 0, type: 'BUILD', player: 1, building_id: 70, object_ids: [102], x: 20, y: 12 },
    // The new house has no known id: the clicked point binds it.
    { t: 1_000, type: 'ORDER', player: 1, object_ids: [101], target_id: 999, x: 20.3, y: 11.8 },
  ]);
  assert.equal(r.buildingById.get(999)?.typeId, 70);
  const v = r.unitById.get(101);
  assert.equal(v.activityAt(5_000), 'build');
  assert.equal(v.activityAt(50_000), null); // House: 40 s default build time here
});

test('deleted units disappear and deleted buildings become ruins', () => {
  const r = skirmish([{ t: 5_000, type: 'DELETE', player: 3, object_ids: [301, 302] }]);
  const before = r.stateAt(4_000);
  const after = r.stateAt(6_000);
  assert.ok(before.units.some((u) => u.unit.id === 301));
  assert.ok(!after.units.some((u) => u.unit.id === 301));
  assert.ok(!after.buildings.some((b) => b.building.id === 302));
  assert.deepEqual(after.ruins.map((b) => b.id), [302]);
});

test('only the owner can delete', () => {
  const r = skirmish([{ t: 5_000, type: 'DELETE', player: 1, object_ids: [301] }]);
  assert.ok(r.stateAt(6_000).units.some((u) => u.unit.id === 301));
});
