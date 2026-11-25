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

test('an explored map starts explored; with everything visible nothing hides', () => {
  const r = match();
  r.data.game.reveal_map = 'explored';
  const grid = new Fog(r, 1).at(1000);
  assert.equal(grid[40 * 50 + 40], EXPLORED, 'the terrain shows, the enemy unit does not');
  assert.equal(grid[10 * 50 + 10], SEEN);
  r.data.game.reveal_map = 'all_visible';
  const all = new Fog(r, 1);
  assert.equal(all.hides, false);
  assert.ok(all.at(1000).every((v) => v === SEEN));
});

test('an enemy attacking the team from out of sight is seen while it attacks', () => {
  const gameData = {
    units: { 83: { speed: 1, class: 4, los: 4, train: [] }, 4: { speed: 1, class: 0, los: 6, train: [] } },
    buildings: {}, techs: {},
  };
  const archerAt = (timeline) => {
    const r = new Replay({
      game: {
        duration_ms: 200_000,
        players: [
          { number: 1, name: 'A', color_id: 0, team_id: 2, start: { x: 10, y: 10 } },
          { number: 3, name: 'C', color_id: 2, team_id: 3, start: { x: 40, y: 40 } },
        ],
      },
      map: { size: 50, terrain: [], elevation: [] },
      initial_objects: [
        { id: 101, player: 1, type_id: 83, x: 10, y: 10 },
        { id: 302, player: 3, type_id: 4, x: 30, y: 10 },
      ],
      timeline,
      chat: [],
      legend: { objects: { 83: { name: 'Villager', category: 'unit' }, 4: { name: 'Archer', category: 'unit' } } },
    }, { gameData });
    const fog = new Fog(r, 1);
    const at = r.unitById.get(302).positionAt(60_000);
    return fog.sees(fog.at(60_000), at.x, at.y);
  };
  // 5 tiles off: out of the villager's sight (4), in the archer's range.
  assert.equal(archerAt([{ t: 1000, type: 'MOVE', player: 3, object_ids: [302], x: 15, y: 10 }]), true);
  assert.equal(archerAt([{ t: 1000, type: 'MOVE', player: 3, object_ids: [302], x: 15, y: 10 },
    { t: 2000, type: 'STANCE', player: 3, stance_id: 3, object_ids: [302] }]), false);
});

test('Town Watch makes towers see farther, from the game effects', () => {
  const gameData = {
    units: { 83: { speed: 1, class: 4, los: 4, train: [] } },
    buildings: { 79: { size: 1, buildTime: 0, class: 52, los: 8 }, 109: { size: 4, buildTime: 0, class: 3, los: 8 } },
    techs: { 8: { at: [[109, 25]], fx: [[4, -1, 3, 1, 4], [4, -1, 52, 1, 4]] } },
  };
  const r = new Replay({
    game: { duration_ms: 200_000, players: [{ number: 1, name: 'A', color_id: 0, team_id: 2, start: { x: 10, y: 10 } }] },
    map: { size: 60, terrain: [], elevation: [] },
    initial_objects: [
      { id: 100, player: 1, type_id: 109, x: 10, y: 10 },
      { id: 102, player: 1, type_id: 79, x: 40, y: 40 },
    ],
    timeline: [{ t: 1000, type: 'RESEARCH', player: 1, object_ids: [100], technology_id: 8 }],
    chat: [],
    legend: { objects: { 109: { name: 'Town Center', category: 'building' }, 79: { name: 'Watch Tower', category: 'building' } } },
  }, { gameData });
  const fog = new Fog(r, 1);
  assert.ok(!fog.sees(fog.at(10_000), 40, 50), 'a tower sees 8 tiles');
  assert.ok(fog.sees(fog.at(30_000), 40, 50), 'and 12 with Town Watch');
});
