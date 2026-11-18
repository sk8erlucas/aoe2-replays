import assert from 'node:assert/strict';
import { test } from 'node:test';

import { FOREST_COST, NavGrid, terrainKind } from '../src/pathing.js';

// 20x20 map with a river at x = 10 and a ford at y = 15.
function riverMap() {
  const size = 20;
  const terrain = new Array(size * size).fill(0);
  for (let y = 0; y < size; y++) terrain[y * size + 10] = y === 15 ? 4 : 1;
  const legend = {
    0: { name: 'Grass', category: 'grass' },
    1: { name: 'Water, Shallow', category: 'shallows' }, // as stored before November 2026
    4: { name: 'Shallows', category: 'shallows' },
    10: { name: 'Forest', category: 'forest' },
  };
  return { map: { size, terrain }, legend };
}

test('terrain kinds: "Water, Shallow" is water, Shallows and bridges can be walked', () => {
  assert.equal(terrainKind({ name: 'Water, Shallow', category: 'shallows' }), 'water');
  assert.equal(terrainKind({ name: 'Shallows', category: 'shallows' }), 'shallows');
  assert.equal(terrainKind({ name: 'Water, Bridge', category: 'water' }), 'shallows');
  assert.equal(terrainKind({ name: 'Forest', category: 'forest' }), 'forest');
});

test('land units cross a river at its ford, ships stay on the water', () => {
  const { map, legend } = riverMap();
  const { land, water } = NavGrid.fromMap(map, legend);
  const points = land.path(5.5, 5.5, 15.5, 5.5);
  assert.deepEqual(points.at(-1), { x: 15.5, y: 5.5 });
  assert.ok(points.length > 1, 'not straight across');
  assert.ok(points.some((p) => Math.floor(p.x) === 10 && Math.floor(p.y) === 15) || points.some((p) => p.y > 13), 'goes by the ford');
  // Every leg stays off the water.
  let at = { x: 5.5, y: 5.5 };
  for (const p of points) {
    for (let k = 0; k <= 1; k += 0.02) assert.notEqual(land.costAt(at.x + (p.x - at.x) * k, at.y + (p.y - at.y) * k), 0);
    at = p;
  }
  // A ship told to go up the river does; one told onto land stops at the shore.
  assert.deepEqual(water.path(10.5, 2.5, 10.5, 12.5), [{ x: 10.5, y: 12.5 }]);
  const shore = water.path(10.5, 2.5, 14.5, 2.5).at(-1);
  assert.equal(Math.floor(shore.x), 10);
});

test('nothing in the way: a straight line', () => {
  const { map, legend } = riverMap();
  const { land } = NavGrid.fromMap(map, legend);
  assert.deepEqual(land.path(2.5, 2.5, 8.5, 18.5), [{ x: 8.5, y: 18.5 }]);
});

test('woods are walked around when the way round is not much longer', () => {
  const size = 20;
  const terrain = new Array(size * size).fill(0);
  for (let y = 5; y < 15; y++) for (let x = 8; x < 12; x++) terrain[y * size + x] = 10;
  const { land } = NavGrid.fromMap({ size, terrain }, { 0: { name: 'Grass', category: 'grass' }, 10: { name: 'Forest', category: 'forest' } });
  assert.equal(land.costAt(9, 9), FOREST_COST);
  const points = land.path(4.5, 10.5, 15.5, 10.5);
  assert.ok(points.length > 1);
  assert.ok(points.every((p) => land.costAt(p.x, p.y) === 1));
});
