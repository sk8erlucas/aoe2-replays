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

test('trained units spawn after the train time and bind to unknown ids in creation order', () => {
  const r = replay([
    { t: 1000, type: 'DE_QUEUE', player: 1, object_ids: [100], amount: 2, unit_id: 83 },
    // Commanded in the opposite order: the lower id was still created first.
    { t: 55000, type: 'MOVE', player: 1, object_ids: [556], x: 5, y: 5 },
    { t: 58000, type: 'MOVE', player: 1, object_ids: [555], x: 6, y: 6 },
  ]);
  const trained = r.units.filter((u) => u.approx);
  assert.deepEqual(trained.map((u) => u.spawnT), [26000, 51000]);
  assert.equal(r.unitById.get(555), trained[0]);
  assert.equal(r.unitById.get(556), trained[1]);
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

test('age marks list arrivals within the match, not after a resign', () => {
  const r = replay([
    { t: 1_000, type: 'RESEARCH', player: 1, object_ids: [100], technology_id: 101 },
    { t: 1_000, type: 'RESEARCH', player: 1, object_ids: [100], technology_id: 101 },
  ], { game: { duration_ms: 600_000, players: [{ number: 1, name: 'A', color_id: 1, team_id: 1, start: { x: 10, y: 10 } }] } });
  assert.deepEqual(r.ageMarks(), [{ player: 1, age: 2, t: 131_000 }]);

  const resigned = replay([
    { t: 1_000, type: 'RESEARCH', player: 1, object_ids: [100], technology_id: 101 },
    { t: 50_000, type: 'RESIGN', player: 1 },
  ]);
  assert.deepEqual(resigned.ageMarks(), []);
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

test('herded animals follow orders but never attack', () => {
  const r = skirmish([{ t: 0, type: 'ORDER', player: 1, object_ids: [401], target_id: 302, x: 20, y: 30 }]);
  assert.equal(r.unitById.get(401).activityAt(5_000), null);
});

test('a gate replaces the wall segments under it, without rubble', () => {
  const r = new Replay({
    game: { duration_ms: 60_000, players: [{ number: 1, name: 'A', color_id: 0, team_id: 2, start: { x: 5, y: 5 } }] },
    map: { size: 30, terrain: [], elevation: [] },
    initial_objects: [],
    timeline: [
      { t: 0, type: 'WALL', player: 1, building_id: 117, x: 10, y: 10, x_end: 18, y_end: 10, object_ids: [] },
      { t: 10_000, type: 'BUILD', player: 1, building_id: 665, x: 14, y: 10, object_ids: [] },
    ],
    chat: [],
    legend: { objects: { 117: { name: 'Stone Wall', category: 'building' }, 665: { name: 'Gate', category: 'building' } } },
  });
  const later = r.stateAt(20_000);
  const walls = later.buildings.filter((b) => b.building.typeId === 117).map((b) => b.building.x);
  assert.ok(!walls.includes(14) && walls.includes(10) && walls.includes(18), `walls left: ${walls}`);
  assert.equal(later.ruins.length, 0);
});

test('an unknown id ordered to attack binds to a trained soldier, not a villager', () => {
  const gameData = {
    units: { 83: { speed: 0.8, class: 4, train: [[109, 25]] }, 74: { speed: 0.9, class: 6, train: [[12, 21]] } },
    buildings: {},
  };
  const r = new Replay({
    game: {
      duration_ms: 200_000,
      players: [
        { number: 1, name: 'A', color_id: 0, team_id: 2, start: { x: 10, y: 10 } },
        { number: 2, name: 'B', color_id: 1, team_id: 3, start: { x: 30, y: 30 } },
      ],
    },
    map: { size: 40, terrain: [], elevation: [] },
    initial_objects: [
      { id: 100, player: 1, type_id: 109, x: 10, y: 10 },
      { id: 110, player: 1, type_id: 12, x: 14, y: 10 },
      { id: 200, player: 2, type_id: 74, x: 30, y: 30 },
    ],
    timeline: [
      { t: 0, type: 'DE_QUEUE', player: 1, object_ids: [100], unit_id: 83, amount: 1 },
      { t: 1_000, type: 'DE_QUEUE', player: 1, object_ids: [110], unit_id: 74, amount: 1 },
      { t: 60_000, type: 'ORDER', player: 1, object_ids: [5000], target_id: 200, x: 30, y: 30 },
    ],
    chat: [],
    legend: {
      objects: {
        109: { name: 'Town Center', category: 'building' },
        12: { name: 'Barracks', category: 'building' },
        83: { name: 'Villager', category: 'unit' },
        74: { name: 'Militia', category: 'unit' },
      },
    },
  }, { gameData });
  assert.equal(r.unitById.get(5000)?.typeId, 74);
});

test('hotspot is where most recent orders are, not the last one', () => {
  const moves = [
    ...Array.from({ length: 6 }, (_, i) => ({ t: 10_000 + i * 1000, type: 'MOVE', player: 1, object_ids: [101], x: 50 + i * 0.5, y: 50 })),
    { t: 17_000, type: 'MOVE', player: 1, object_ids: [101], x: 5, y: 5 },
  ];
  const r = replay(moves, { map: { size: 80, terrain: [], elevation: [] } });
  const spot = r.hotspot(17_500);
  assert.ok(Math.abs(spot.x - 51) < 2 && Math.abs(spot.y - 50) < 1, JSON.stringify(spot));
  assert.equal(r.hotspot(60_000), null); // nothing in the last 20 s
});

test('a unit last sent to attack and never ordered again falls, and fades out', () => {
  const r = skirmish([
    { t: 0, type: 'ORDER', player: 1, object_ids: [102], target_id: 301, x: 12, y: 30 },
    // Player 1 keeps playing for minutes without ordering the militia again.
    { t: 200_000, type: 'MOVE', player: 1, object_ids: [101], x: 5, y: 5 },
  ]);
  const m = r.unitById.get(102);
  assert.ok(m.fell);
  assert.equal(m.removedAt, 25_000);
  const fading = r.stateAt(26_000).units.find((u) => u.unit === m);
  assert.ok(fading && fading.fading > 0 && fading.fading < 1);
  assert.ok(!r.stateAt(30_000).units.some((u) => u.unit === m));
});

const DEER = [{ id: 402, player: 0, type_id: 1060, class_id: 58, x: 22, y: 20 }];
const ANIMALS = { 1060: { name: 'Deer', category: 'animal' }, 594: { name: 'Sheep', category: 'animal' }, 48: { name: 'Wild Boar', category: 'animal' } };

test('hunted animals disappear when their food runs out', () => {
  const r = forest([{ t: 0, type: 'ORDER', player: 1, object_ids: [101], target_id: 402, x: 22, y: 20 }], DEER, ANIMALS);
  const deer = r.unitById.get(402);
  // 140 food at 0.4/s: 350 s, plus a few seconds walking.
  assert.ok(deer.removedAt >= 350_000 && deer.removedAt < 360_000, `deer gone at ${deer.removedAt}`);
  assert.equal(r.unitById.get(101).activityAt(deer.removedAt + 1000), null);
});

test('several villagers share an animal and move on to the next sheep', () => {
  const r = forest(
    [{ t: 0, type: 'ORDER', player: 1, object_ids: [101, 102], target_id: 403, x: 20, y: 22 }],
    [
      { id: 102, player: 1, type_id: 83, class_id: 70, x: 20, y: 21 },
      { id: 403, player: 1, type_id: 594, class_id: 58, x: 20, y: 22 },
      { id: 404, player: 1, type_id: 594, class_id: 58, x: 23, y: 22 },
    ],
    ANIMALS,
  );
  const first = r.unitById.get(403);
  // 100 food eaten by two: about 125 s.
  assert.ok(first.removedAt > 120_000 && first.removedAt < 135_000, `${first.removedAt}`);
  const v = r.unitById.get(101);
  assert.equal(v.activityAt(first.removedAt + 10_000), 'shepherd');
  const at = v.positionAt(first.removedAt + 10_000);
  assert.ok(Math.hypot(at.x - 23, at.y - 22) < 1.5, `${at.x},${at.y}`);
});

test('a lured boar walks to where the hunters clicked it, and they eat it there', () => {
  const r = forest(
    [
      { t: 0, type: 'ORDER', player: 1, object_ids: [101], target_id: 405, x: 30, y: 30 },
      { t: 30_000, type: 'MOVE', player: 1, object_ids: [101], x: 11, y: 12 },
      { t: 60_000, type: 'ORDER', player: 1, object_ids: [101, 102], target_id: 405, x: 12, y: 13 },
    ],
    [
      { id: 102, player: 1, type_id: 83, class_id: 70, x: 12, y: 12 },
      { id: 405, player: 0, type_id: 48, class_id: 58, x: 30, y: 30 },
      { id: 406, player: 0, type_id: 48, class_id: 58, x: 13, y: 14 }, // another boar: never taken by itself
    ],
    ANIMALS,
  );
  const boar = r.unitById.get(405);
  const at = boar.positionAt(60_000);
  assert.ok(Math.hypot(at.x - 12, at.y - 13) < 0.01, `${at.x},${at.y}`);
  assert.ok(Math.hypot(boar.positionAt(20_000).x - 30, boar.positionAt(20_000).y - 30) < 5); // still out there while hit
  // 340 food: two hunters next to the town center, not out at the boar's start.
  const hunter = r.unitById.get(102);
  assert.equal(hunter.activityAt(100_000), 'hunt');
  assert.ok(Math.hypot(hunter.positionAt(100_000).x - 12, hunter.positionAt(100_000).y - 13) < 1.5);
  assert.ok(boar.removedAt < Infinity);
  assert.equal(hunter.activityAt(boar.removedAt + 5_000), null);
  assert.equal(r.unitById.get(406).removedAt, Infinity);
});

test('a player who resigns loses every unit and building', () => {
  const r = skirmish([{ t: 50_000, type: 'RESIGN', player: 3, object_ids: [] }]);
  const after = r.stateAt(60_000);
  assert.ok(!after.units.some((u) => u.unit.player === 3));
  assert.ok(!after.buildings.some((b) => b.building.player === 3));
  assert.ok(after.ruins.some((b) => b.player === 3));
});

test('units over the population limit are taken as fallen, army first', () => {
  const data = {
    game: { duration_ms: 400_000, population_limit: 2, players: [{ number: 1, name: 'A', color_id: 0, team_id: 2, start: { x: 10, y: 10 } }] },
    map: { size: 40, terrain: [], elevation: [] },
    initial_objects: [
      { id: 100, player: 1, type_id: 109, x: 10, y: 10 },
      { id: 101, player: 1, type_id: 83, x: 12, y: 10 },
      { id: 102, player: 1, type_id: 74, x: 12, y: 12 },
    ],
    timeline: [
      { t: 0, type: 'DE_QUEUE', player: 1, object_ids: [100], unit_id: 83, amount: 1 },
      { t: 100_000, type: 'MOVE', player: 1, object_ids: [900], x: 15, y: 15 },
    ],
    chat: [],
    legend: { objects: { 109: { name: 'Town Center', category: 'building' }, 83: { name: 'Villager', category: 'unit' }, 74: { name: 'Militia', category: 'unit' } } },
  };
  const r = new Replay(data);
  const militia = r.unitById.get(102);
  assert.ok(militia.fell, 'the soldier goes before the villager');
  assert.equal(r.unitById.get(101).fell, false);
  assert.equal(r.stateAt(100_000).units.filter((u) => u.unit.player === 1).length, 2);
});

test('an unknown id binds to the unit trained when that id was created', () => {
  const gameData = { units: { 83: { speed: 0.8, class: 4, train: [[109, 25]] } }, buildings: {} };
  const r = new Replay({
    game: { duration_ms: 300_000, players: [{ number: 1, name: 'A', color_id: 0, team_id: 2, start: { x: 10, y: 10 } }] },
    map: { size: 40, terrain: [], elevation: [] },
    initial_objects: [{ id: 100, player: 1, type_id: 109, x: 10, y: 10 }, { id: 101, player: 1, type_id: 83, x: 12, y: 10 }],
    timeline: [
      { t: 0, type: 'DE_QUEUE', player: 1, object_ids: [100], unit_id: 83, amount: 3 }, // out at 25, 50 and 75 s
      { t: 60_000, type: 'BUILD', player: 1, building_id: 70, object_ids: [101], x: 20, y: 20 },
      // The house gets id 5003 by being clicked: something created at 60 s.
      { t: 70_000, type: 'ORDER', player: 1, object_ids: [101], target_id: 5003, x: 20, y: 20 },
      // 5004 was created after 60 s: the villager out at 75 s, not the older ones.
      { t: 100_000, type: 'MOVE', player: 1, object_ids: [5004], x: 5, y: 5 },
    ],
    chat: [],
    legend: { objects: { 109: { name: 'Town Center', category: 'building' }, 83: { name: 'Villager', category: 'unit' }, 70: { name: 'House', category: 'building' } } },
  }, { gameData });
  assert.equal(r.buildingById.get(5003)?.typeId, 70);
  assert.equal(r.unitById.get(5004)?.spawnT, 75_000);
});

test('gather points are kept over time for each building', () => {
  const r = replay([
    { t: 1_000, type: 'GATHER_POINT', player: 1, object_ids: [100], x: 14, y: 12 },
    { t: 9_000, type: 'GATHER_POINT', player: 1, object_ids: [100], x: 6, y: 7 },
  ]);
  const tc = r.buildingById.get(100);
  assert.equal(r.rallyAt(tc, 500), null);
  assert.deepEqual(r.rallyAt(tc, 5_000), { x: 14, y: 12 });
  assert.deepEqual(r.rallyAt(tc, 20_000), { x: 6, y: 7 });
});

test('trained units walk to a gather point on the ground', () => {
  const r = forest([
    { t: 0, type: 'GATHER_POINT', player: 1, object_ids: [100], target_id: -1, x: 15, y: 5 },
    { t: 0, type: 'DE_QUEUE', player: 1, object_ids: [100], amount: 1, unit_id: 83 },
  ]);
  const v = r.units.find((u) => u.id == null);
  const at = v.positionAt(200_000);
  assert.ok(Math.hypot(at.x - 15, at.y - 5) < 0.01, `${at.x},${at.y}`);
});

test('trained villagers with a gather point on their own sheep herd it', () => {
  const r = forest(
    [
      { t: 0, type: 'GATHER_POINT', player: 1, object_ids: [100], target_id: 300, x: 14, y: 14 },
      { t: 0, type: 'DE_QUEUE', player: 1, object_ids: [100], amount: 1, unit_id: 83 },
    ],
    [{ id: 300, player: 1, type_id: 594, class_id: 58, x: 14, y: 14 }],
    { 594: { name: 'Sheep', category: 'unit' } },
  );
  const v = r.units.find((u) => u.id == null);
  assert.equal(v.activityAt(v.spawnT + 30_000), 'shepherd');
  assert.ok(r.unitById.get(300).removedAt < Infinity); // eaten
});

test('a trained unit already ordered by its player ignores the gather point', () => {
  const r = forest([
    { t: 0, type: 'GATHER_POINT', player: 1, object_ids: [100], target_id: -1, x: 15, y: 5 },
    { t: 0, type: 'DE_QUEUE', player: 1, object_ids: [100], amount: 1, unit_id: 83 },
    { t: 10_000, type: 'MOVE', player: 1, object_ids: [900], x: 30, y: 30 },
  ]);
  const at = r.unitById.get(900).positionAt(500_000);
  assert.ok(Math.hypot(at.x - 30, at.y - 30) < 0.01, `${at.x},${at.y}`);
});

test("age arrival comes from the game's notices; game notices are not chat", () => {
  const r = replay([
    { t: 10_000, type: 'RESEARCH', player: 1, object_ids: [100], technology_id: 101 },
    { t: 30_000, type: 'RESEARCH', player: 1, object_ids: [100], technology_id: 102 },
  ], {
    chat: [
      { t: 150_000, player: 1, channel: 0, message: '<player_id,1,0> ha avanzado a la Edad Feudal.' },
      { t: 160_000, player: 1, channel: 0, message: 'gg' },
    ],
  });
  assert.equal(r.ageAt(1, 149_999), 1);
  assert.equal(r.ageAt(1, 150_000), 2);
  // Castle was clicked but never announced: cancelled, so never reached.
  assert.equal(r.ageAt(1, 59_000), 1);
  assert.deepEqual(r.log.filter((e) => e.kind === 'chat').map((e) => e.text), ['gg']);
});

test('a research holds up the queue of its building', () => {
  const r = replay([
    { t: 0, type: 'RESEARCH', player: 1, object_ids: [100], technology_id: 22 }, // Loom, 25 s
    { t: 1000, type: 'DE_QUEUE', player: 1, object_ids: [100], amount: 1, unit_id: 83 },
  ]);
  assert.deepEqual(r.units.filter((u) => u.approx).map((u) => u.spawnT), [50_000]);
});

test('builders of a lumber camp start chopping next to it; a flare does not stop them', () => {
  const r = forest(
    [
      { t: 0, type: 'BUILD', player: 1, building_id: 562, object_ids: [101], x: 22, y: 22 },
      { t: 100_000, type: 'FLARE', player: 1, object_ids: [], x: 5, y: 5 },
    ],
    [],
    { 562: { name: 'Lumber Camp', category: 'building' } },
  );
  const v = r.unitById.get(101);
  assert.equal(v.activityAt(10_000), 'build');
  assert.equal(v.activityAt(200_000), 'tree');
});

test('a trained unit never commanded in the whole match leaves once idle', () => {
  const r = replay([{ t: 1000, type: 'DE_QUEUE', player: 1, object_ids: [100], amount: 1, unit_id: 83 }]);
  const [u] = r.units.filter((x) => x.approx);
  assert.equal(u.removedAt, u.spawnT);
});

// One villager (101) at (10, 12) and a palisade that takes 6 s per piece alone.
function palisade(timeline) {
  return new Replay({
    game: { duration_ms: 120_000, players: [{ number: 1, name: 'A', color_id: 0, team_id: 1, start: { x: 5, y: 5 } }] },
    map: { size: 30, terrain: [], elevation: [] },
    initial_objects: [{ id: 101, player: 1, type_id: 83, class_id: 70, x: 10, y: 12 }],
    timeline,
    chat: [],
    legend: { objects: { 83: { name: 'Villager', category: 'unit' }, 72: { name: 'Palisade Wall', category: 'building' } } },
  }, { gameData: { units: { 83: { speed: 1 } }, buildings: { 72: { size: 1, buildTime: 6 } } } });
}

const pieces = (r, t) => Object.fromEntries(r.stateAt(t).buildings
  .filter((b) => b.building.typeId === 72)
  .map((b) => [b.building.x, b.planned ? 'planned' : Math.round(b.progress * 100) / 100]));

test('wall pieces go up one after another and stay foundations when the builders leave', () => {
  const r = palisade([
    { t: 0, type: 'WALL', player: 1, building_id: 72, object_ids: [101], x: 10, y: 10, x_end: 14, y_end: 10 },
    { t: 15_000, type: 'MOVE', player: 1, object_ids: [101], x: 2, y: 2 },
  ]);
  // 2 s walking to the near end, then 6 s per piece.
  assert.deepEqual(pieces(r, 1_000), { 10: 'planned', 11: 'planned', 12: 'planned', 13: 'planned', 14: 'planned' });
  assert.deepEqual(pieces(r, 5_000), { 10: 0.5, 11: 'planned', 12: 'planned', 13: 'planned', 14: 'planned' });
  // Sent away at 15 s: the third piece stays half started, the rest foundations.
  assert.deepEqual(pieces(r, 60_000), { 10: 1, 11: 1, 12: 0.17, 13: 'planned', 14: 'planned' });
});

test('deleted wall foundations go away without rubble, and the log says it was cancelled', () => {
  const r = palisade([
    { t: 0, type: 'WALL', player: 1, building_id: 72, object_ids: [101], x: 10, y: 10, x_end: 14, y_end: 10 },
    { t: 1_000, type: 'MOVE', player: 1, object_ids: [101], x: 2, y: 2 },
    // One DELETE per piece, with IDs the engine never saw, split in two batches.
    ...[500, 501, 502].map((id) => ({ t: 5_000, type: 'DELETE', player: 1, object_ids: [id] })),
    ...[503, 504].map((id) => ({ t: 5_200, type: 'DELETE', player: 1, object_ids: [id] })),
  ]);
  const after = r.stateAt(10_000);
  assert.equal(after.buildings.filter((b) => b.building.typeId === 72).length, 0);
  assert.equal(after.ruins.length, 0);
  assert.equal(r.log.find((l) => l.segments === 5).cancelled, true);
});

test('villagers done with their sheep move on to a boar already lured nearby', () => {
  const r = forest(
    [
      { t: 0, type: 'ORDER', player: 1, object_ids: [101], target_id: 403, x: 20, y: 22 },
      // Someone lured the boar next to the sheep: a click on it there.
      // (the sheep, 100 food for one villager, lasts until ~255 s)
      { t: 200_000, type: 'ORDER', player: 1, object_ids: [102], target_id: 405, x: 25, y: 22 },
      { t: 205_000, type: 'MOVE', player: 1, object_ids: [102], x: 5, y: 5 },
    ],
    [
      { id: 102, player: 1, type_id: 83, class_id: 70, x: 25, y: 24 },
      { id: 403, player: 1, type_id: 594, class_id: 58, x: 20, y: 22 },
      { id: 405, player: 0, type_id: 48, class_id: 58, x: 26, y: 22 },
    ],
    ANIMALS,
  );
  const sheep = r.unitById.get(403);
  const v = r.unitById.get(101);
  assert.equal(v.activityAt(sheep.removedAt + 10_000), 'hunt');
  const at = v.positionAt(sheep.removedAt + 20_000);
  assert.ok(Math.hypot(at.x - 25, at.y - 22) < 1.5, `${at.x},${at.y}`);
});

test('a carcass left with food rots away', () => {
  const r = forest(
    [
      { t: 0, type: 'ORDER', player: 1, object_ids: [101], target_id: 402, x: 22, y: 20 },
      { t: 60_000, type: 'MOVE', player: 1, object_ids: [101], x: 5, y: 5 },
    ],
    DEER,
    ANIMALS,
  );
  const deer = r.unitById.get(402);
  assert.ok(deer.removedAt > 60_000 && deer.removedAt < 200_000, `${deer.removedAt}`);
});

test('shift-queued farms are shared out, one villager each', () => {
  const farm = { 50: { name: 'Farm', category: 'building' } };
  const r = forest(
    [
      { t: 0, type: 'BUILD', player: 1, building_id: 50, object_ids: [101, 102, 103], x: 22, y: 22 },
      { t: 500, type: 'BUILD', player: 1, building_id: 50, object_ids: [101, 102, 103], x: 26, y: 22 },
      { t: 900, type: 'BUILD', player: 1, building_id: 50, object_ids: [101, 102, 103], x: 26, y: 22 }, // same spot again
      { t: 1_200, type: 'BUILD', player: 1, building_id: 50, object_ids: [101, 102, 103], x: 22, y: 26 },
    ],
    [
      { id: 102, player: 1, type_id: 83, class_id: 70, x: 20, y: 21 },
      { id: 103, player: 1, type_id: 83, class_id: 70, x: 21, y: 20 },
    ],
    farm,
  );
  assert.equal(r.buildings.filter((b) => b.typeId === 50).length, 3);
  const spots = [101, 102, 103].map((id) => {
    const at = r.unitById.get(id).positionAt(300_000);
    assert.equal(r.unitById.get(id).activityAt(300_000), 'farm', `villager ${id}`);
    return `${Math.round(at.x / 4)},${Math.round(at.y / 4)}`;
  });
  assert.equal(new Set(spots).size, 3, spots.join(' '));
});
