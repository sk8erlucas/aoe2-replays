import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Replay } from '../src/engine.js';
import { EXPLORED, Fog, SEEN } from '../src/fog.js';

function match(timeline = []) {
  const gameData = { units: { 83: { speed: 1, class: 4, los: 4, train: [] } }, buildings: {}, techs: {} };
  return new Replay({
    game: {
      duration_ms: 200_000,
      players: [
        { number: 1, name: 'A', color_id: 0, team_id: 2, start: { x: 10, y: 10 } },
        { number: 2, name: 'B', color_id: 1, team_id: 2, start: { x: 40, y: 10 } },
        { number: 3, name: 'C', color_id: 2, team_id: 3, start: { x: 40, y: 40 } },
      ],
    },
    map: { size: 50, terrain: [], elevation: [] },
    initial_objects: [
      { id: 101, player: 1, type_id: 83, x: 10, y: 10 },
      { id: 201, player: 2, type_id: 83, x: 40, y: 10 },
      { id: 301, player: 3, type_id: 83, x: 40, y: 40 },
    ],
    timeline,
    chat: [],
    legend: { objects: { 83: { name: 'Villager', category: 'unit' } } },
  }, { gameData });
}

test('a team sees around its units, and not the enemy', () => {
  const fog = new Fog(match(), 1);
  const grid = fog.at(1000);
  assert.ok(fog.sees(grid, 10, 10) && fog.sees(grid, 13, 10), 'own villager, 4 tiles');
  assert.ok(!fog.sees(grid, 16, 10));
  assert.ok(fog.sees(grid, 40, 10), 'an ally sees for the team');
  assert.equal(grid[40 * 50 + 40], 0, 'the enemy is never seen');
});

test('where a unit was stays explored after it leaves', () => {
  const fog = new Fog(match([{ t: 40_000, type: 'MOVE', player: 1, object_ids: [101], x: 10, y: 40 }]), 1);
  const grid = fog.at(150_000);
  assert.equal(grid[10 * 50 + 10], EXPLORED);
  assert.equal(grid[40 * 50 + 10], SEEN);
});
